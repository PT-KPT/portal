// main.js — ES6 Module v5.0 — FIXED: Event listener cleanup, memory leak prevention, page lifecycle management
import { ROUTES, ROUTES_NEED_COMPANY, ROUTES_NEED_PROJECT, EL, ERR, TOAST } from './constants.js';
import { AppCache } from './cache.js';
import { DB, DataAccess, abortAllRequests } from './db.js';
import { AppError } from './error-handler.js';
import { AuthService, AppNavbar, LoginPage, ROLES } from './login.js';

// ─────────────────────────────────────────────
// APD Work Types
// ─────────────────────────────────────────────
export const WORK_TYPE_APD = {
  welding:              { label:'Welding (Pengelasan)',            icon:'bi-fire',          items:[{id:'ppe_welding_helmet',label:'Helm Las (Auto Darkening)'},{id:'ppe_safety_glasses_weld',label:'Kacamata Safety'},{id:'ppe_leather_gloves',label:'Sarung Tangan Tahan Panas (Leather)'},{id:'ppe_fire_resistant_apron',label:'Apron / Baju Tahan Api'},{id:'ppe_safety_shoes_weld',label:'Sepatu Safety (Steel Toe)'},{id:'ppe_respirator_weld',label:'Masker / Respirator'},{id:'ppe_ear_protection_weld',label:'Pelindung Telinga (Earplug / Earmuff)'}]},
  electrical:           { label:'Pekerjaan Listrik',              icon:'bi-lightning-charge',items:[{id:'ppe_non_conductive_helmet',label:'Helm Safety (Non-Conductive)'},{id:'ppe_electrical_gloves',label:'Sarung Tangan Isolasi Listrik'},{id:'ppe_electrical_shoes',label:'Sepatu Safety Anti Listrik'},{id:'ppe_face_shield_elec',label:'Kacamata Safety / Face Shield'},{id:'ppe_arc_flash_suit',label:'Arc Flash Suit (Tegangan Tinggi)'},{id:'ppe_voltage_detector',label:'Alat Deteksi Tegangan'}]},
  working_height:       { label:'Pekerjaan di Ketinggian',        icon:'bi-arrow-up',      items:[{id:'ppe_full_body_harness',label:'Full Body Harness'},{id:'ppe_lanyard_lifeline',label:'Lanyard + Lifeline'},{id:'ppe_helmet_chin_strap',label:'Helm Safety dengan Chin Strap'},{id:'ppe_anti_slip_shoes',label:'Sepatu Anti Slip'},{id:'ppe_work_gloves_height',label:'Sarung Tangan Kerja'}]},
  chemical:             { label:'Pekerjaan Kimia',                icon:'bi-droplet',       items:[{id:'ppe_chemical_suit',label:'Baju Pelindung (Chemical Suit / Lab Coat)'},{id:'ppe_chemical_gloves',label:'Sarung Tangan Tahan Bahan Kimia'},{id:'ppe_goggles_chem',label:'Kacamata Safety / Goggles'},{id:'ppe_face_shield_chem',label:'Face Shield'},{id:'ppe_respirator_chem',label:'Respirator / Masker Khusus'},{id:'ppe_rubber_boots_chem',label:'Sepatu Boot Karet'}]},
  high_noise:           { label:'Pekerjaan dengan Kebisingan Tinggi',icon:'bi-volume-up',  items:[{id:'ppe_earplug',label:'Earplug'},{id:'ppe_earmuff',label:'Earmuff'},{id:'ppe_helmet_noise',label:'Helm Safety'},{id:'ppe_safety_glasses_noise',label:'Kacamata Safety'}]},
  mechanical:           { label:'Pekerjaan Mekanik / Bengkel',    icon:'bi-gear',          items:[{id:'ppe_safety_glasses_mech',label:'Kacamata Safety'},{id:'ppe_work_gloves_mech',label:'Sarung Tangan Kerja'},{id:'ppe_safety_shoes_mech',label:'Sepatu Safety'},{id:'ppe_coverall',label:'Coverall / Wearpack'},{id:'ppe_face_shield_grinding',label:'Face Shield (Jika Grinding)'}]},
  general_construction: { label:'Konstruksi Umum',                icon:'bi-building',      items:[{id:'ppe_helmet_const',label:'Helm Safety'},{id:'ppe_reflective_vest',label:'Rompi Reflektif'},{id:'ppe_safety_shoes_const',label:'Sepatu Safety'},{id:'ppe_work_gloves_const',label:'Sarung Tangan'},{id:'ppe_safety_glasses_const',label:'Kacamata Safety'},{id:'ppe_dust_mask_const',label:'Masker Debu'}]},
  grinding_cutting:     { label:'Grinding / Cutting',             icon:'bi-tools',         items:[{id:'ppe_face_shield_grind',label:'Face Shield'},{id:'ppe_safety_glasses_grind',label:'Kacamata Safety'},{id:'ppe_gloves_grind',label:'Sarung Tangan'},{id:'ppe_apron_grind',label:'Apron'},{id:'ppe_safety_shoes_grind',label:'Sepatu Safety'},{id:'ppe_respirator_grind',label:'Masker Debu / Respirator'}]},
};

// ─────────────────────────────────────────────
// Performance Utilities
// ─────────────────────────────────────────────
export const PerformanceUtils = {
  debounce(func, delay = 300) {
    let tid;
    return function (...args) { clearTimeout(tid); tid = setTimeout(() => func.apply(this, args), delay); };
  },
  throttle(func, limit = 250) {
    let inThrottle, lastFunc, lastRan;
    return function (...args) {
      if (!inThrottle) { func.apply(this, args); lastRan = Date.now(); inThrottle = true; setTimeout(() => { inThrottle = false; if (lastFunc) { lastFunc(); lastFunc = null; } }, limit); }
      else { lastFunc = () => func.apply(this, args); }
    };
  },
  scheduleIdleTask(cb, timeout = 2000) {
    return typeof requestIdleCallback !== 'undefined' ? requestIdleCallback(cb, { timeout }) : setTimeout(cb, 1);
  },
  cancelIdleTask(id) {
    if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(id); else clearTimeout(id);
  },
  batchDOMUpdates(cb) {
    return typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : setTimeout(cb, 16);
  }
};

// ─────────────────────────────────────────────
// Utility Service
// ─────────────────────────────────────────────
export const UtilityService = {
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div'); div.textContent = text; return div.innerHTML;
  },
  formatDate(d) {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('id-ID', { year:'numeric', month:'long', day:'numeric' }); }
    catch { return String(d); }
  },
  getTimeAgo(d) {
    if (!d) return '-';
    try {
      const diff = Date.now() - new Date(d).getTime();
      if (diff < 0) return this.formatDate(d);
      const min = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
      if (min < 1) return 'baru saja'; if (min < 60) return `${min}m lalu`;
      if (h < 24) return `${h}j lalu`; if (day < 7) return `${day}h lalu`;
      return this.formatDate(d);
    } catch { return '-'; }
  },
  formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '-';
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(amount);
  },
  toDateInput(d) {
    if (!d) return '';
    try {
      const s = String(d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const date = new Date(s);
      if (isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    } catch { return ''; }
  },
  calcAge(birthDate) {
    if (!birthDate) return null;
    const dob = new Date(birthDate); if (isNaN(dob)) return null;
    const now = new Date(); let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  },
  getAgeDisplay(birthDate) { const age = this.calcAge(birthDate); return age === null ? '-' : `${age} tahun`; },
  _docNumberCache: new Map(),
  async generateDocNumber(type) {
    const cacheKey = `${type}_${new Date().toISOString().split('T')[0]}`;
    if (this._docNumberCache.has(cacheKey)) {
      const cached = this._docNumberCache.get(cacheKey);
      cached.count++;
      return `${type}-${cached.year}-${String(cached.count).padStart(3,'0')}${cached.rand}`;
    }
    const y     = new Date().getFullYear();
    const sheet = type === 'JSA' ? 'jsa' : 'work_methods';
    const count = await DB.getCount(sheet);
    const seq   = String(count + 1).padStart(3, '0');
    const rand  = Math.floor(Math.random() * 90 + 10);
    this._docNumberCache.set(cacheKey, { count: count + 1, year: y, rand });
    return `${type}-${y}-${seq}${rand}`;
  },
  showConfirmDialog(message, onConfirm, onCancel) {
    const existing = document.getElementById('confirmDialog');
    if (existing) { 
      try {
        const m = bootstrap.Modal.getInstance(existing); 
        if (m) m.dispose(); 
      } catch(e) {}
      existing.remove(); 
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="modal fade" id="confirmDialog" tabindex="-1" role="dialog" aria-modal="true">
      <div class="modal-dialog modal-dialog-centered" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-question-circle text-warning"></i> Konfirmasi</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
          </div>
          <div class="modal-body"><p id="confirmDialogMsg"></p></div>
          <div class="modal-footer">
            <button type="button" class="btn btn--outline-secondary" data-bs-dismiss="modal" id="confirmCancelBtn">Batal</button>
            <button type="button" class="btn btn--primary" id="confirmOkBtn">OK</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrapper.firstElementChild);
    document.getElementById('confirmDialogMsg').textContent = message;
    const modalEl = document.getElementById('confirmDialog');
    const modal   = new bootstrap.Modal(modalEl);
    let isResolved = false;
    const cleanup = () => { 
      if (isResolved) return;
      isResolved = true;
      try { modalEl.remove(); } catch(e) {}
      document.getElementById('confirmOkBtn')?.removeEventListener('click', handleConfirm); 
      document.getElementById('confirmCancelBtn')?.removeEventListener('click', handleCancel);
      modalEl?.removeEventListener('hidden.bs.modal', cleanup);
    };
    const handleConfirm = () => { 
      modal.hide(); 
      if (onConfirm && !isResolved) onConfirm(); 
      cleanup();
    };
    const handleCancel = () => { 
      modal.hide(); 
      if (onCancel && !isResolved) onCancel(); 
      cleanup();
    };
    document.getElementById('confirmOkBtn').addEventListener('click', handleConfirm);
    document.getElementById('confirmCancelBtn').addEventListener('click', handleCancel);
    modalEl.addEventListener('hidden.bs.modal', cleanup);
    modal.show();
  }
};

// ─────────────────────────────────────────────
// Page lifecycle management
// ─────────────────────────────────────────────
let _currentPageInstance = null;
let _currentPageName = null;

function _cleanupCurrentPage() {
  if (_currentPageInstance && typeof _currentPageInstance.destroy === 'function') {
    try {
      _currentPageInstance.destroy();
      console.log(`[UIService] Destroyed page: ${_currentPageName}`);
    } catch (err) {
      console.warn(`[UIService] Error destroying page ${_currentPageName}:`, err);
    }
  }
  
  // Cleanup global page references
  const globalPages = ['DashboardPage', 'CompanyPage', 'ProjectPage', 'WorkMethodPage', 
    'JSAPage', 'SchedulePage', 'ManpowerPage', 'ProcurementPage', 'ReportPage'];
  globalPages.forEach(pageName => {
    if (window[pageName]) {
      delete window[pageName];
    }
  });
  
  _currentPageInstance = null;
  _currentPageName = null;
}

// ─────────────────────────────────────────────
// Data prefetch mapping untuk setiap halaman
// ─────────────────────────────────────────────
const PAGE_DATA_MAP = Object.freeze({
  [ROUTES.DASHBOARD]:  ['company', 'projects', 'jsa', 'work_methods', 'procurement', 'manpower'],
  [ROUTES.PERUSAHAAN]: ['company'],
  [ROUTES.PROYEK]:     ['projects'],
  [ROUTES.METODE]:     ['work_methods', 'projects'],
  [ROUTES.JSA]:        ['jsa', 'work_methods', 'projects'],
  [ROUTES.JADWAL]:     ['jadwal', 'work_methods', 'projects'],
  [ROUTES.MANPOWER]:   ['personnel', 'manpower', 'projects'],
  [ROUTES.PEMBELIAN]:  ['procurement', 'projects'],
  [ROUTES.LAPORAN]:    ['projects', 'company'],
});

// ─────────────────────────────────────────────
// Dynamic Page Loaders
// ─────────────────────────────────────────────
const PAGE_LOADERS = Object.freeze({
  [ROUTES.DASHBOARD]:  () => import('./dashboard.js'),
  [ROUTES.PERUSAHAAN]: () => import('./perusahaan.js'),
  [ROUTES.PROYEK]:     () => import('./proyek.js'),
  [ROUTES.METODE]:     () => import('./metode.js'),
  [ROUTES.JSA]:        () => import('./jsa.js'),
  [ROUTES.JADWAL]:     () => import('./jadwal.js'),
  [ROUTES.MANPOWER]:   () => import('./mp.js'),
  [ROUTES.PEMBELIAN]:  () => import('./pembelian.js'),
  [ROUTES.LAPORAN]:    () => import('./laporan.js'),
  [ROUTES.AKUN]:       () => null,
});

const PREFETCH_MAP = Object.freeze({
  [ROUTES.DASHBOARD]:  [ROUTES.PERUSAHAAN, ROUTES.PROYEK],
  [ROUTES.PERUSAHAAN]: [ROUTES.PROYEK],
  [ROUTES.PROYEK]:     [ROUTES.METODE, ROUTES.JSA, ROUTES.MANPOWER, ROUTES.PEMBELIAN],
  [ROUTES.METODE]:     [ROUTES.JSA, ROUTES.JADWAL],
  [ROUTES.JSA]:        [ROUTES.METODE, ROUTES.LAPORAN],
  [ROUTES.JADWAL]:     [ROUTES.LAPORAN],
  [ROUTES.MANPOWER]:   [ROUTES.LAPORAN],
  [ROUTES.PEMBELIAN]:  [ROUTES.LAPORAN],
  [ROUTES.LAPORAN]:    [ROUTES.DASHBOARD],
});

// WeakRef + LRU eviction untuk _loadedModules
const _loadedModules = new Map();
const _moduleAccessOrder = [];
const MAX_LOADED_MODULES = 8;

function _trackModuleAccess(route) {
  const idx = _moduleAccessOrder.indexOf(route);
  if (idx > -1) _moduleAccessOrder.splice(idx, 1);
  _moduleAccessOrder.push(route);
}

function _evictLRUModules() {
  while (_loadedModules.size > MAX_LOADED_MODULES) {
    const oldest = _moduleAccessOrder.shift();
    if (oldest && _loadedModules.has(oldest)) {
      _loadedModules.delete(oldest);
      console.debug(`[UIService] LRU evicted module: ${oldest}`);
    }
  }
}

// ─────────────────────────────────────────────
// UI Service
// ─────────────────────────────────────────────
export const UIService = {
  currentRoute:    null,
  _guardCache:     { companyOk: null, hasProjects: null, timestamp: 0 },
  _loadingRoute:   null,
  _prefetchTimers: new Set(),
  _toastContainer: null,
  _isDestroyed:    false,

  invalidateGuardCache() { this._guardCache = { companyOk: null, hasProjects: null, timestamp: 0 }; },

  destroy() {
    this._isDestroyed = true;
    this._cleanupPrefetchTimers();
    if (this._toastContainer) {
      this._toastContainer.remove();
      this._toastContainer = null;
    }
    _cleanupCurrentPage();
    console.log('[UIService] Destroyed');
  },

  init() { this.setupRouting(); },

  showToast(message, type = 'success') {
    if (!this._toastContainer || !document.body.contains(this._toastContainer)) {
      this._toastContainer = document.createElement('div');
      this._toastContainer.className = 'app-toast-container';
      this._toastContainer.setAttribute('role','alert');
      this._toastContainer.setAttribute('aria-live','polite');
      document.body.appendChild(this._toastContainer);
    }
    const existing = this._toastContainer.querySelectorAll('.toast');
    while (existing.length >= 3) existing[0].remove();
    const iconMap = { success:'bi-check-circle-fill', danger:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0 show mb-2`;
    el.style.minWidth = '300px';
    el.setAttribute('role','alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body d-flex align-items-center gap-2"><i class="bi ${iconMap[type]||iconMap.info}"></i><span class="toast-msg"></span></div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Tutup"></button></div>`;
    el.querySelector('.toast-msg').textContent = message;
    el.querySelector('.btn-close').onclick = () => el.remove();
    this._toastContainer.appendChild(el);
    setTimeout(() => { if (el.parentElement) { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(() => el.remove(), 300); } }, 3500);
  },

  setupRouting() {
    const handleHash = PerformanceUtils.debounce(() => {
      if (this._isDestroyed) return;
      const hash = window.location.hash.replace('#','') || ROUTES.DASHBOARD;
      this.navigate(hash);
    }, 100);
    window.addEventListener('hashchange', handleHash);
    window.addEventListener('beforeunload', () => { 
      window.removeEventListener('hashchange', handleHash);
      this.destroy();
    });
    if (window.location.hash) this.navigate(window.location.hash.replace('#','') || ROUTES.DASHBOARD);
    else window.location.hash = '#' + ROUTES.DASHBOARD;
  },

  _cleanupPrefetchTimers() {
    this._prefetchTimers.forEach(t => PerformanceUtils.cancelIdleTask(t));
    this._prefetchTimers.clear();
  },

  navigate(route) {
    if (this._isDestroyed) return;
    if (document.getElementById(EL.LOGIN_CONTAINER)?.style.display === 'flex') return;
    if (this._loadingRoute === route) return;
    
    // Cleanup previous page before loading new one
    _cleanupCurrentPage();
    
    this.currentRoute = route;
    document.querySelectorAll('.nav-item[data-route]').forEach(n => n.classList.toggle('active', n.dataset.route === route));
    this.loadPage(route);
    if (window.innerWidth < 769) setTimeout(() => AppNavbar.closeSidebar(), 100);
    this._cleanupPrefetchTimers();
    this._prefetchRelatedPages(route);
  },

  showFlowBanner(icon, title, message, buttonLabel, buttonAction) {
    return `<div class="flow-guard-banner">
      <div class="flow-guard-banner__icon"><i class="bi ${icon}"></i></div>
      <h5 class="flow-guard-banner__title">${title}</h5>
      <p class="flow-guard-banner__description">${message}</p>
      <button class="btn btn--primary" onclick="${buttonAction}">${buttonLabel}</button>
    </div>`;
  },

  async loadPage(route) {
    if (this._isDestroyed) return;
    
    const mainContent = document.getElementById('appMainContent');
    if (!mainContent) return;
    this._loadingRoute = route;

    if (AuthService.isLoggedIn()) {
      if (!AuthService.canAccess(route) && route !== ROUTES.AKUN) {
        mainContent.innerHTML = this.showFlowBanner('bi-shield-lock','Akses Ditolak','Anda tidak memiliki izin untuk mengakses halaman ini.','<i class="bi bi-house"></i> Dashboard',`UIService.navigate('${ROUTES.DASHBOARD}')`);
        this._loadingRoute = null; return;
      }
    }

    if (route === ROUTES.AKUN) {
      await AppAuth.renderAccountManager();
      document.querySelectorAll('.nav-item[data-route]').forEach(n => n.classList.toggle('active', n.dataset.route === ROUTES.AKUN));
      this._loadingRoute = null; return;
    }

    const GUARD_CACHE_TTL = 5 * 60 * 1000;
    const now = Date.now();
    const shouldRefresh = now - (this._guardCache.timestamp || 0) > GUARD_CACHE_TTL;

    if (ROUTES_NEED_COMPANY.includes(route)) {
      if (this._guardCache.companyOk === null || shouldRefresh) {
        this._guardCache.companyOk = await DataAccess.isCompanyComplete();
        this._guardCache.timestamp = now;
      }
      if (!this._guardCache.companyOk) {
        mainContent.innerHTML = this.showFlowBanner('bi-building-exclamation','Lengkapi Data Perusahaan Terlebih Dahulu',ERR.COMPANY_INCOMPLETE,'<i class="bi bi-building"></i> Isi Data Perusahaan',`UIService.navigate('${ROUTES.PERUSAHAAN}')`);
        this._loadingRoute = null; return;
      }
    }

    if (ROUTES_NEED_PROJECT.includes(route)) {
      if (this._guardCache.hasProjects === null || shouldRefresh) {
        this._guardCache.hasProjects = await DataAccess.hasProjects();
        this._guardCache.timestamp = now;
      }
      if (!this._guardCache.hasProjects) {
        mainContent.innerHTML = this.showFlowBanner('bi-clipboard-plus','Buat Proyek Terlebih Dahulu',ERR.NO_PROJECT,'<i class="bi bi-clipboard-data"></i> Buat Proyek Baru',`UIService.navigate('${ROUTES.PROYEK}')`);
        this._loadingRoute = null; return;
      }
    }

    const loader = PAGE_LOADERS[route];
    if (!loader) {
      if (route !== ROUTES.DASHBOARD) { this.navigate(ROUTES.DASHBOARD); return; }
      mainContent.innerHTML = '<div class="flow-guard-banner"><p>Halaman tidak ditemukan</p></div>';
      this._loadingRoute = null; return;
    }

    try {
      this._showSkeleton(mainContent);

      let module = _loadedModules.get(route);
      if (!module || !module.deref) {
        const IMPORT_TIMEOUT_MS = 10000;
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Timeout: Gagal memuat modul "${route}" dalam ${IMPORT_TIMEOUT_MS/1000} detik`)), IMPORT_TIMEOUT_MS);
        });

        try {
          module = await Promise.race([loader(), timeoutPromise]);
          clearTimeout(timeoutId);
          
          _evictLRUModules();
          _loadedModules.set(route, module);
          _trackModuleAccess(route);
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      } else {
        _trackModuleAccess(route);
      }

      const page = this._getPageFromModule(module, route);
      if (!page || typeof page.render !== 'function') throw new Error(`Module "${route}" tidak memiliki page object yang valid`);
      
      // Simpan instance untuk cleanup nanti
      _currentPageInstance = page;
      _currentPageName = route;
      
      this._exposeToGlobal(route, page);

      await new Promise(resolve => {
        PerformanceUtils.batchDOMUpdates(() => {
          mainContent.innerHTML = page.render();
          resolve();
        });
      });

      try { await page.init(); }
      catch (err) {
        console.error(`[UIService] Error in init "${route}":`, err);
        AppError.handle(err, `Inisialisasi halaman ${route}`);
      }
    } catch (err) {
      console.error(`[UIService] Gagal memuat halaman "${route}":`, err);
      AppError.handlePageLoad(err, route);
    } finally {
      this._loadingRoute = null;
    }
  },

  _getPageFromModule(module, route) {
    const map = {
      [ROUTES.DASHBOARD]:  module.DashboardPage,
      [ROUTES.PERUSAHAAN]: module.CompanyPage,
      [ROUTES.PROYEK]:     module.ProjectPage,
      [ROUTES.METODE]:     module.WorkMethodPage,
      [ROUTES.JSA]:        module.JSAPage,
      [ROUTES.JADWAL]:     module.SchedulePage,
      [ROUTES.MANPOWER]:   module.ManpowerPage,
      [ROUTES.PEMBELIAN]:  module.ProcurementPage,
      [ROUTES.LAPORAN]:    module.ReportPage,
    };
    return map[route] || module.default || Object.values(module).find(v => typeof v === 'object' && v?.render);
  },

  _exposeToGlobal(route, page) {
    const names = {
      [ROUTES.DASHBOARD]:  'DashboardPage',  [ROUTES.PERUSAHAAN]: 'CompanyPage',
      [ROUTES.PROYEK]:     'ProjectPage',    [ROUTES.METODE]:     'WorkMethodPage',
      [ROUTES.JSA]:        'JSAPage',        [ROUTES.JADWAL]:     'SchedulePage',
      [ROUTES.MANPOWER]:   'ManpowerPage',   [ROUTES.PEMBELIAN]:  'ProcurementPage',
      [ROUTES.LAPORAN]:    'ReportPage',
    };
    if (names[route] && page) window[names[route]] = page;
  },

  _showSkeleton(container) {
    const icons   = { [ROUTES.DASHBOARD]:'bi-speedometer2',[ROUTES.PERUSAHAAN]:'bi-building',[ROUTES.PROYEK]:'bi-clipboard-data',[ROUTES.METODE]:'bi-diagram-3',[ROUTES.JSA]:'bi-journal-check',[ROUTES.JADWAL]:'bi-calendar-week',[ROUTES.MANPOWER]:'bi-people',[ROUTES.PEMBELIAN]:'bi-cart',[ROUTES.LAPORAN]:'bi-file-earmark-pdf' };
    const titles  = { [ROUTES.DASHBOARD]:'Dashboard',[ROUTES.PERUSAHAAN]:'Data Perusahaan',[ROUTES.PROYEK]:'Proyek',[ROUTES.METODE]:'Metode Kerja',[ROUTES.JSA]:'Job Safety Analysis',[ROUTES.JADWAL]:'Jadwal Kerja',[ROUTES.MANPOWER]:'Man Power',[ROUTES.PEMBELIAN]:'Cost Project',[ROUTES.LAPORAN]:'Laporan' };
    const icon  = icons[this.currentRoute]  || 'bi-hourglass-split';
    const title = titles[this.currentRoute] || 'Halaman';
    container.innerHTML = `<div class="skeleton-loading" role="status" aria-label="Memuat konten">
      <div class="text-center mb-4">
        <div class="page-loading-spinner" style="margin:0 auto 1rem;"></div>
        <h5 style="color:#64748b;"><i class="bi ${icon}"></i> Memuat ${title}…</h5>
      </div>
      <div class="skeleton-card"><div class="skeleton-line w-75"></div><div class="skeleton-line w-50"></div><div class="skeleton-line w-100"></div><div class="skeleton-line w-25"></div></div>
      <div class="skeleton-card"><div class="skeleton-line w-50"></div><div class="skeleton-line w-100"></div><div class="skeleton-line w-100"></div><div class="skeleton-line w-75"></div></div>
    </div>`;
  },

  _prefetchRelatedPages(route) {
    if (this._isDestroyed) return;
    
    (PREFETCH_MAP[route] || []).forEach(targetRoute => {
      // Module prefetch
      if (!_loadedModules.has(targetRoute)) {
        const loader = PAGE_LOADERS[targetRoute];
        if (loader) {
          const timer = PerformanceUtils.scheduleIdleTask(() => {
            if (this._isDestroyed) return;
            loader().then(module => {
              _evictLRUModules();
              _loadedModules.set(targetRoute, module);
              _trackModuleAccess(targetRoute);
              const page = this._getPageFromModule(module, targetRoute);
              if (page) this._exposeToGlobal(targetRoute, page);
            }).catch(() => {});
          }, 2000);
          this._prefetchTimers.add(timer);
        }
      }
      
      // Data prefetch
      const dataSheets = PAGE_DATA_MAP[targetRoute];
      if (dataSheets && dataSheets.length > 0) {
        const dataTimer = PerformanceUtils.scheduleIdleTask(() => {
          if (this._isDestroyed) return;
          console.debug(`[UIService] 📦 Prefetching DATA for route: ${targetRoute} — sheets: [${dataSheets.join(', ')}]`);
          import('./db.js').then(({ DB }) => {
            DB.getAllBulk(dataSheets).catch(err => {
              console.warn(`[UIService] ⚠️ Prefetch data failed for ${targetRoute}:`, err.message);
            });
          });
        }, 3000);
        this._prefetchTimers.add(dataTimer);
      }
    });
  }
};

// ─────────────────────────────────────────────
// AppAuth (account manager + role enforcement)
// ─────────────────────────────────────────────
export const AppAuth = {
  _navigatePatched:     false,
  _originalNavigate:    null,
  _accountTableHandler: null,

  async onLoginSuccess(role) {
    const session = AuthService.getCurrentUser();
    AppNavbar.updateUserInfo(session);
    this.applyRoleToUI(role);
    const defaultRoute = ROLES[role]?.defaultRoute || 'dashboard';
    window.location.hash = '#' + defaultRoute;
    UIService.navigate(defaultRoute);
    
    // Cache warmup after login
    setTimeout(async () => {
      try {
        console.log('[AppAuth] 🔥 Starting cache warmup after login...');
        const prioritySheets = AppCache.getPrioritySheets();
        await AppCache.warmupBulk(prioritySheets);
        console.log('[AppAuth] ✅ Cache warmup complete');
      } catch (err) {
        console.warn('[AppAuth] ⚠️ Cache warmup failed:', err.message);
      }
    }, 500);
  },

  applyRoleToUI(role) {
    const rc = ROLES[role];
    if (!rc) return;
    const na = document.getElementById('navItemAkun');
    if (na) na.style.display = role === 'admin' ? '' : 'none';
    document.querySelectorAll('.nav-item[data-route]').forEach(n => {
      n.style.display = rc.allowedRoutes.includes(n.dataset.route) ? '' : 'none';
      n.setAttribute('aria-current', n.classList.contains('active') ? 'page' : 'false');
    });
    this.patchNavigate(role);
  },

  patchNavigate(role) {
    if (this._navigatePatched) return;
    const rc = ROLES[role];
    if (!rc) return;
    this._originalNavigate = UIService.navigate.bind(UIService);
    UIService.navigate = (route) => {
      if (!rc.allowedRoutes.includes(route)) { UIService.showToast('Akses ditolak.', 'danger'); return; }
      this._originalNavigate(route);
    };
    this._navigatePatched = true;
  },

  restoreNavigate() {
    if (this._navigatePatched && this._originalNavigate) {
      UIService.navigate = this._originalNavigate;
      this._navigatePatched = false;
      this._originalNavigate = null;
    }
  },

  logout() {
    UtilityService.showConfirmDialog('Apakah Anda yakin ingin keluar?', () => {
      this.restoreNavigate();
      this._cleanupAccountTableHandler();
      // Cleanup all services
      abortAllRequests();
      AppCache.destroy();
      UIService.destroy();
      AuthService.logout();
    });
  },
  
  _cleanupAccountTableHandler() {
    if (this._accountTableHandler) {
      const tbody = document.getElementById('accountTableBody');
      if (tbody) {
        tbody.removeEventListener('click', this._accountTableHandler);
      }
      this._accountTableHandler = null;
    }
  },

  async renderAccountManager() {
    this._cleanupAccountTableHandler();
    
    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); }
    catch (err) { console.error('[AppAuth] Gagal memuat akun:', err); }

    const roleColors = { admin:'primary', hse:'success', pembeli:'warning' };
    const EL_ref = (await import('./constants.js')).EL;

    const html = `<div class="page-header no-print">
      <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-people-fill"></i></span>Manajemen Akun</h2>
      <button class="btn btn--primary" onclick="AppAuth.showAddAccountForm()"><i class="bi bi-person-plus"></i> Tambah Akun</button>
    </div>
    <div id="${EL.ADD_ACCOUNT_FORM_CARD}" class="card" style="display:none;">
      <div class="card-header"><i class="bi bi-person-plus"></i> Tambah / Edit Akun</div>
      <div class="card-body">
        <div class="row g-3">
          <input type="hidden" id="${EL.EDIT_ACCOUNT_USERNAME}" value="">
          <div class="col-sm-6"><label class="form-label" for="${EL.INPUT_ACCOUNT_USERNAME}">Username <span class="text-danger">*</span></label><input type="text" class="form-control" id="${EL.INPUT_ACCOUNT_USERNAME}" placeholder="username" required></div>
          <div class="col-sm-6"><label class="form-label" for="${EL.INPUT_ACCOUNT_PASSWORD}">Password <span class="text-danger">*</span></label><input type="password" class="form-control" id="${EL.INPUT_ACCOUNT_PASSWORD}" placeholder="password" required></div>
          <div class="col-sm-6"><label class="form-label" for="${EL.INPUT_ACCOUNT_NAME}">Nama <span class="text-danger">*</span></label><input type="text" class="form-control" id="${EL.INPUT_ACCOUNT_NAME}" placeholder="Nama lengkap" required></div>
          <div class="col-sm-6"><label class="form-label" for="${EL.INPUT_ACCOUNT_ROLE}">Role</label>
            <select class="form-select" id="${EL.INPUT_ACCOUNT_ROLE}">
              <option value="admin">Admin — Akses Penuh</option>
              <option value="hse">HSE — Metode, JSA, Man Power</option>
              <option value="pembeli">Pembeli — Pembelian</option>
            </select>
          </div>
        </div>
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn--primary" onclick="AppAuth.saveAccount()"><i class="bi bi-save"></i> Simpan</button>
          <button class="btn btn--outline-secondary" onclick="document.getElementById('${EL.ADD_ACCOUNT_FORM_CARD}').style.display='none'">Batal</button>
        </div>
      </div>
    </div>
    <div class="card" id="${EL.ACCOUNT_TABLE_CARD}">
      <div class="card-header"><i class="bi bi-people-fill"></i> Daftar Akun</div>
      <div class="card-body p-0"><div class="table-responsive">
        <table class="table table--hover mb-0">
          <thead><tr><th>No</th><th>Username</th><th>Nama</th><th>Role</th><th class="text-center">Aksi</th></tr></thead>
          <tbody id="accountTableBody">
            ${!accounts.length ? '<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada akun.</td></tr>' : ''}
            ${accounts.map((acc, i) => {
              const rc = ROLES[acc.role];
              return `<tr><td class="text-center">${i+1}</td><td><strong>${UtilityService.escapeHtml(acc.username)}</strong></td><td>${UtilityService.escapeHtml(acc.name||'-')}</td><td><span class="badge bg-${roleColors[acc.role]||'secondary'}">${rc?.label||acc.role}</span></td><td class="text-center"><button class="btn btn--xs btn--outline-warning me-1" data-action="edit-account" data-username="${UtilityService.escapeHtml(acc.username)}"><i class="bi bi-pencil"></i></button><button class="btn btn--xs btn--outline-danger" data-action="delete-account" data-username="${UtilityService.escapeHtml(acc.username)}"><i class="bi bi-trash"></i></button></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div></div>
    </div>`;

    const mainContent = document.getElementById(EL.APP_MAIN_CONTENT);
    if (!mainContent) return;
    mainContent.innerHTML = html;

    const tbody = document.getElementById('accountTableBody');
    if (tbody) {
      this._accountTableHandler = (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, username } = btn.dataset;
        if (action === 'edit-account')   AppAuth.editAccount(username);
        if (action === 'delete-account') AppAuth.deleteAccount(username);
      };
      tbody.addEventListener('click', this._accountTableHandler);
    }
  },

  showAddAccountForm() {
    document.getElementById(EL.EDIT_ACCOUNT_USERNAME).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_USERNAME).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_NAME).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_ROLE).value = 'admin';
    const pw = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD);
    if (pw) { pw.value = ''; pw.placeholder = 'password'; pw.required = true; }
    const f = document.getElementById(EL.ADD_ACCOUNT_FORM_CARD);
    if (f) { f.style.display = 'block'; setTimeout(() => f.scrollIntoView({ behavior:'smooth', block:'start' }), 100); }
  },

  async editAccount(username) {
    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); }
    catch (err) { AppError.handle(err, 'Memuat data akun'); return; }
    const acc = accounts.find(a => a.username === username);
    if (!acc) { UIService.showToast('Akun tidak ditemukan.', 'danger'); return; }
    document.getElementById(EL.EDIT_ACCOUNT_USERNAME).value = acc.username;
    document.getElementById(EL.INPUT_ACCOUNT_USERNAME).value = acc.username;
    document.getElementById(EL.INPUT_ACCOUNT_PASSWORD).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_NAME).value = acc.name || '';
    document.getElementById(EL.INPUT_ACCOUNT_ROLE).value = acc.role;
    const pw = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD);
    if (pw) { pw.placeholder = 'Kosongkan jika tidak diubah'; pw.required = false; }
    const f = document.getElementById(EL.ADD_ACCOUNT_FORM_CARD);
    if (f) { f.style.display = 'block'; setTimeout(() => f.scrollIntoView({ behavior:'smooth', block:'start' }), 100); }
  },

  async saveAccount() {
    const username    = document.getElementById(EL.INPUT_ACCOUNT_USERNAME).value.trim();
    const password    = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD).value.trim();
    const name        = document.getElementById(EL.INPUT_ACCOUNT_NAME).value.trim();
    const role        = document.getElementById(EL.INPUT_ACCOUNT_ROLE).value;
    const editOldUser = document.getElementById(EL.EDIT_ACCOUNT_USERNAME).value;
    const isEdit      = !!editOldUser;

    if (!username || !name)             { UIService.showToast(ERR.REQUIRED_FIELD('Username dan nama'), 'warning'); return; }
    if (!isEdit && !password)           { UIService.showToast(ERR.REQUIRED_FIELD('Password'), 'warning'); return; }
    if (username.length < 3)            { UIService.showToast(ERR.MIN_LENGTH('Username', 3), 'warning'); return; }
    if (password && password.length < 6){ UIService.showToast(ERR.MIN_LENGTH('Password', 6), 'warning'); return; }

    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); } catch {}
    const dup = accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
    if (dup && dup.username !== editOldUser) { UIService.showToast(ERR.DUPLICATE('Username'), 'warning'); return; }

    try {
      const payload = { action:'saveAccount', username, name, role, oldUsername: editOldUser || '' };
      if (password) payload.password = password;
      await DB.post(payload);
      AppCache.invalidate('accounts');
      UIService.showToast('Akun berhasil disimpan!', 'success');
      document.getElementById(EL.ADD_ACCOUNT_FORM_CARD).style.display = 'none';
      const pw = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD);
      if (pw) { pw.placeholder = 'password'; pw.required = true; }
      await AppAuth.renderAccountManager();
    } catch (err) { AppError.handle(err, 'Menyimpan akun'); }
  },

  async deleteAccount(username) {
    const session = AuthService.getCurrentUser();
    if (session?.username === username) { UIService.showToast('Tidak dapat menghapus akun yang sedang aktif!', 'danger'); return; }
    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); } catch {}
    if (accounts.length <= 1) { UIService.showToast('Minimal harus ada 1 akun!', 'danger'); return; }
    UtilityService.showConfirmDialog(`Hapus akun "${username}"?`, async () => {
      try { await DataAccess.deleteAccount(username); UIService.showToast('Akun dihapus.', 'warning'); await AppAuth.renderAccountManager(); }
      catch (err) { AppError.handle(err, 'Menghapus akun'); }
    });
  }
};

// ─────────────────────────────────────────────
// Expose globals for HTML onclick handlers
// ─────────────────────────────────────────────
window.UtilityService = UtilityService;
window.UIService      = UIService;
window.WORK_TYPE_APD  = WORK_TYPE_APD;
window.PerformanceUtils = PerformanceUtils;
window.AppAuth        = AppAuth;
window.AppError       = AppError;
window.DB             = DB;
window.DataAccess     = DataAccess;
window.AppCache       = AppCache;

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  AppNavbar.init();
  UIService.init();
  if (!AuthService.isLoggedIn()) LoginPage.show();
  else AppAuth.onLoginSuccess(AuthService.getCurrentRole());
});

window.addEventListener('beforeunload', () => {
  abortAllRequests();
  AppCache.destroy();
  UIService.destroy();
  AppNavbar.destroy();
  AppAuth.restoreNavigate();
  if (LoginPage._loginContainer) { 
    LoginPage._loginContainer.remove(); 
    LoginPage._loginContainer = null; 
  }
  UtilityService._docNumberCache.clear();
});