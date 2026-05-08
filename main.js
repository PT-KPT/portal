// main.js — v4.1 dengan Performance Optimization & Memory Leak Fix

const WORK_TYPE_APD = {
  welding: { label: 'Welding (Pengelasan)', icon: 'bi-fire', items: [
    { id: 'ppe_welding_helmet', label: 'Helm Las (Auto Darkening)' },
    { id: 'ppe_safety_glasses_weld', label: 'Kacamata Safety' },
    { id: 'ppe_leather_gloves', label: 'Sarung Tangan Tahan Panas (Leather)' },
    { id: 'ppe_fire_resistant_apron', label: 'Apron / Baju Tahan Api' },
    { id: 'ppe_safety_shoes_weld', label: 'Sepatu Safety (Steel Toe)' },
    { id: 'ppe_respirator_weld', label: 'Masker / Respirator' },
    { id: 'ppe_ear_protection_weld', label: 'Pelindung Telinga (Earplug / Earmuff)' }
  ]},
  electrical: { label: 'Pekerjaan Listrik', icon: 'bi-lightning-charge', items: [
    { id: 'ppe_non_conductive_helmet', label: 'Helm Safety (Non-Conductive)' },
    { id: 'ppe_electrical_gloves', label: 'Sarung Tangan Isolasi Listrik' },
    { id: 'ppe_electrical_shoes', label: 'Sepatu Safety Anti Listrik' },
    { id: 'ppe_face_shield_elec', label: 'Kacamata Safety / Face Shield' },
    { id: 'ppe_arc_flash_suit', label: 'Arc Flash Suit (Tegangan Tinggi)' },
    { id: 'ppe_voltage_detector', label: 'Alat Deteksi Tegangan' }
  ]},
  working_height: { label: 'Pekerjaan di Ketinggian', icon: 'bi-arrow-up', items: [
    { id: 'ppe_full_body_harness', label: 'Full Body Harness' },
    { id: 'ppe_lanyard_lifeline', label: 'Lanyard + Lifeline' },
    { id: 'ppe_helmet_chin_strap', label: 'Helm Safety dengan Chin Strap' },
    { id: 'ppe_anti_slip_shoes', label: 'Sepatu Anti Slip' },
    { id: 'ppe_work_gloves_height', label: 'Sarung Tangan Kerja' }
  ]},
  chemical: { label: 'Pekerjaan Kimia', icon: 'bi-droplet', items: [
    { id: 'ppe_chemical_suit', label: 'Baju Pelindung (Chemical Suit / Lab Coat)' },
    { id: 'ppe_chemical_gloves', label: 'Sarung Tangan Tahan Bahan Kimia' },
    { id: 'ppe_goggles_chem', label: 'Kacamata Safety / Goggles' },
    { id: 'ppe_face_shield_chem', label: 'Face Shield' },
    { id: 'ppe_respirator_chem', label: 'Respirator / Masker Khusus' },
    { id: 'ppe_rubber_boots_chem', label: 'Sepatu Boot Karet' }
  ]},
  high_noise: { label: 'Pekerjaan dengan Kebisingan Tinggi', icon: 'bi-volume-up', items: [
    { id: 'ppe_earplug', label: 'Earplug' },
    { id: 'ppe_earmuff', label: 'Earmuff' },
    { id: 'ppe_helmet_noise', label: 'Helm Safety' },
    { id: 'ppe_safety_glasses_noise', label: 'Kacamata Safety' }
  ]},
  mechanical: { label: 'Pekerjaan Mekanik / Bengkel', icon: 'bi-gear', items: [
    { id: 'ppe_safety_glasses_mech', label: 'Kacamata Safety' },
    { id: 'ppe_work_gloves_mech', label: 'Sarung Tangan Kerja' },
    { id: 'ppe_safety_shoes_mech', label: 'Sepatu Safety' },
    { id: 'ppe_coverall', label: 'Coverall / Wearpack' },
    { id: 'ppe_face_shield_grinding', label: 'Face Shield (Jika Grinding)' }
  ]},
  general_construction: { label: 'Konstruksi Umum', icon: 'bi-building', items: [
    { id: 'ppe_helmet_const', label: 'Helm Safety' },
    { id: 'ppe_reflective_vest', label: 'Rompi Reflektif' },
    { id: 'ppe_safety_shoes_const', label: 'Sepatu Safety' },
    { id: 'ppe_work_gloves_const', label: 'Sarung Tangan' },
    { id: 'ppe_safety_glasses_const', label: 'Kacamata Safety' },
    { id: 'ppe_dust_mask_const', label: 'Masker Debu' }
  ]},
  grinding_cutting: { label: 'Grinding / Cutting', icon: 'bi-tools', items: [
    { id: 'ppe_face_shield_grind', label: 'Face Shield' },
    { id: 'ppe_safety_glasses_grind', label: 'Kacamata Safety' },
    { id: 'ppe_gloves_grind', label: 'Sarung Tangan' },
    { id: 'ppe_apron_grind', label: 'Apron' },
    { id: 'ppe_safety_shoes_grind', label: 'Sepatu Safety' },
    { id: 'ppe_respirator_grind', label: 'Masker Debu / Respirator' }
  ]}
};

// ============================================================
// PERFORMANCE OPTIMIZATION: Debounce & Throttle Utilities
// ============================================================
const PerformanceUtils = {
  // Debounce: Menunda eksekusi sampai tidak ada panggilan baru dalam delay
  debounce(func, delay = 300) {
    let timeoutId;
    return function executedFunction(...args) {
      const context = this;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(context, args), delay);
    };
  },

  // Throttle: Membatasi eksekusi maksimal sekali per limit
  throttle(func, limit = 250) {
    let inThrottle;
    let lastFunc;
    let lastRan;
    return function executedFunction(...args) {
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        lastRan = Date.now();
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
          if (lastFunc) {
            lastFunc();
            lastFunc = null;
          }
        }, limit);
      } else {
        lastFunc = () => func.apply(context, args);
      }
    };
  },

  // RequestIdleCallback dengan fallback
  scheduleIdleTask(callback, timeout = 2000) {
    if (typeof requestIdleCallback !== 'undefined') {
      return requestIdleCallback(callback, { timeout });
    }
    return setTimeout(callback, 1);
  },

  cancelIdleTask(id) {
    if (typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(id);
    } else {
      clearTimeout(id);
    }
  },

  // Batch DOM updates untuk mengurangi reflow
  batchDOMUpdates(callback) {
    if (typeof requestAnimationFrame !== 'undefined') {
      return requestAnimationFrame(callback);
    }
    return setTimeout(callback, 16); // ~60fps
  }
};

const UtilityService = {
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
      const min = Math.floor(diff/60000), h = Math.floor(diff/3600000), day = Math.floor(diff/86400000);
      if (min < 1) return 'baru saja';
      if (min < 60) return `${min}m lalu`;
      if (h < 24) return `${h}j lalu`;
      if (day < 7) return `${day}h lalu`;
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
      const yyyy = date.getFullYear();
      const mm   = String(date.getMonth() + 1).padStart(2, '0');
      const dd   = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch { return ''; }
  },

  calcAge(birthDate) {
    if (!birthDate) return null;
    const dob = new Date(birthDate);
    if (isNaN(dob)) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  },

  getAgeDisplay(birthDate) {
    const age = this.calcAge(birthDate);
    return age === null ? '-' : `${age} tahun`;
  },

  // PERFORMANCE: Cache untuk generateDocNumber
  _docNumberCache: new Map(),
  async generateDocNumber(type) {
    const cacheKey = `${type}_${new Date().toISOString().split('T')[0]}`;
    if (this._docNumberCache.has(cacheKey)) {
      let cached = this._docNumberCache.get(cacheKey);
      cached.count++;
      this._docNumberCache.set(cacheKey, cached);
      return `${type}-${cached.year}-${String(cached.count).padStart(3, '0')}${cached.rand}`;
    }
    
    const y = new Date().getFullYear();
    const sheet = type === 'JSA' ? SHEETS.JSA : SHEETS.WORK_METHODS;
    const count = await DB.getCount(sheet);
    const seq = String(count + 1).padStart(3, '0');
    const rand = Math.floor(Math.random() * 90 + 10);
    const docNum = `${type}-${y}-${seq}${rand}`;
    
    this._docNumberCache.set(cacheKey, { count: count + 1, year: y, rand });
    return docNum;
  },

  showConfirmDialog(message, onConfirm, onCancel) {
    const existing = document.getElementById('confirmDialog');
    if (existing) {
      const modal = bootstrap.Modal.getInstance(existing);
      if (modal) modal.dispose();
      existing.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal fade" id="confirmDialog" tabindex="-1" role="dialog" aria-labelledby="confirmDialogTitle" aria-modal="true">
        <div class="modal-dialog modal-dialog-centered" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="confirmDialogTitle"><i class="bi bi-question-circle text-warning" aria-hidden="true"></i> Konfirmasi</h5>
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
    const modal = new bootstrap.Modal(modalEl);
    
    const handleConfirm = () => { 
      modal.hide(); 
      if (onConfirm) onConfirm(); 
      modalEl.removeEventListener('hidden.bs.modal', cleanup);
    };
    const handleCancel = () => { 
      modal.hide(); 
      if (onCancel) onCancel(); 
      modalEl.removeEventListener('hidden.bs.modal', cleanup);
    };
    const cleanup = () => {
      modalEl.remove();
      document.getElementById('confirmOkBtn')?.removeEventListener('click', handleConfirm);
      document.getElementById('confirmCancelBtn')?.removeEventListener('click', handleCancel);
    };
    
    document.getElementById('confirmOkBtn').addEventListener('click', handleConfirm);
    document.getElementById('confirmCancelBtn').addEventListener('click', handleCancel);
    modalEl.addEventListener('hidden.bs.modal', cleanup);
    modal.show();
  }
};

// ============================================================
// DYNAMIC IMPORT SYSTEM — Lazy Loading dengan Performance Optimasi
// ============================================================

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

const _loadedModules = {};

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

const UIService = {
  currentRoute: null,
  _guardCache: { companyOk: null, hasProjects: null },
  _loadingRoute: null,
  _prefetchTimers: new Set(),
  _toastContainer: null,
  _toastCleanupTimer: null,

  invalidateGuardCache() {
    this._guardCache = { companyOk: null, hasProjects: null };
  },

  init() { this.setupRouting(); },

  showToast(message, type = 'success') {
    // PERFORMANCE: Reuse toast container
    if (!this._toastContainer || !document.body.contains(this._toastContainer)) {
      this._toastContainer = document.createElement('div');
      this._toastContainer.className = 'app-toast-container';
      this._toastContainer.setAttribute('role', 'alert');
      this._toastContainer.setAttribute('aria-live', 'polite');
      document.body.appendChild(this._toastContainer);
    }
    
    // PERFORMANCE: Batasi jumlah toast maksimal 3
    const existingToasts = this._toastContainer.querySelectorAll('.toast');
    while (existingToasts.length >= 3) {
      existingToasts[0].remove();
    }
    
    const iconMap = { success:'bi-check-circle-fill', danger:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0 show mb-2`;
    el.style.minWidth = '300px';
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body d-flex align-items-center gap-2"><i class="bi ${iconMap[type]||iconMap.info}" aria-hidden="true"></i><span class="toast-msg"></span></div><button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()" aria-label="Tutup notifikasi"></button></div>`;
    el.querySelector('.toast-msg').textContent = message;
    this._toastContainer.appendChild(el);
    
    // PERFORMANCE: Gunakan satu timer untuk semua toast
    const autoRemove = () => {
      if (el.parentElement) {
        el.style.opacity='0';
        el.style.transition='opacity .3s';
        setTimeout(() => el.remove(), 300);
      }
    };
    setTimeout(autoRemove, 3500);
  },

  setupRouting() {
    // PERFORMANCE: Gunakan debounce untuk hashchange
    const handleHashChange = PerformanceUtils.debounce(() => {
      const hash = window.location.hash.replace('#', '') || ROUTES.DASHBOARD;
      this.navigate(hash);
    }, 100);
    
    window.addEventListener('hashchange', handleHashChange);
    
    // Cleanup saat page unload
    window.addEventListener('beforeunload', () => {
      window.removeEventListener('hashchange', handleHashChange);
      this._cleanupPrefetchTimers();
    });
    
    if (window.location.hash) {
      const hash = window.location.hash.replace('#', '') || ROUTES.DASHBOARD;
      this.navigate(hash);
    } else {
      window.location.hash = '#' + ROUTES.DASHBOARD;
    }
  },

  // MEMORY LEAK FIX: Cleanup prefetch timers
  _cleanupPrefetchTimers() {
    this._prefetchTimers.forEach(timer => {
      PerformanceUtils.cancelIdleTask(timer);
    });
    this._prefetchTimers.clear();
  },

  navigate(route) {
    if (document.getElementById(EL.LOGIN_CONTAINER)?.style.display === 'flex') return;
    
    if (this._loadingRoute === route) return;
    
    this.currentRoute = route;
    document.querySelectorAll('.nav-item[data-route]').forEach(n => n.classList.toggle('active', n.dataset.route === route));
    this.loadPage(route);
    if (window.innerWidth < 769) setTimeout(() => AppNavbar?.closeSidebar(), 100);
    
    // MEMORY LEAK FIX: Cleanup before new prefetch
    this._cleanupPrefetchTimers();
    this._prefetchRelatedPages(route);
  },

  showFlowBanner(icon, title, message, buttonLabel, buttonAction) {
    return `<div class="flow-guard-banner">
      <div class="flow-guard-banner__icon"><i class="bi ${icon}" aria-hidden="true"></i></div>
      <h5 class="flow-guard-banner__title">${title}</h5>
      <p class="flow-guard-banner__description">${message}</p>
      <button class="btn btn--primary" onclick="${buttonAction}">${buttonLabel}</button>
    </div>`;
  },

  async loadPage(route) {
    const mainContent = document.getElementById('appMainContent');
    if (!mainContent) return;

    this._loadingRoute = route;

    if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn()) {
      if (!AuthService.canAccess(route) && route !== ROUTES.AKUN) {
        mainContent.innerHTML = `<div class="flow-guard-banner">
          <div class="flow-guard-banner__icon"><i class="bi bi-shield-lock" aria-hidden="true"></i></div>
          <h5 class="flow-guard-banner__title">Akses Ditolak</h5>
          <p class="flow-guard-banner__description">Anda tidak memiliki izin untuk mengakses halaman ini.</p>
          <button class="btn btn--primary" onclick="UIService.navigate('${ROUTES.DASHBOARD}')">Kembali ke Dashboard</button>
        </div>`;
        this._loadingRoute = null;
        return;
      }
    }

    if (route === ROUTES.AKUN) {
      if (typeof AppAuth !== 'undefined') {
        await AppAuth.renderAccountManager();
        document.querySelectorAll('.nav-item[data-route]').forEach(n => n.classList.toggle('active', n.dataset.route === ROUTES.AKUN));
      }
      this._loadingRoute = null;
      return;
    }

    // PERFORMANCE: Gunakan cache guard dengan TTL
    const guardCacheKey = `guard_${route}`;
    const guardCacheAge = this._guardCache[guardCacheKey]?.timestamp || 0;
    const shouldRefreshGuard = Date.now() - guardCacheAge > 30000; // Refresh setiap 30 detik

    if (ROUTES_NEED_COMPANY.includes(route)) {
      if (!this._guardCache.companyOk || shouldRefreshGuard) {
        this._guardCache.companyOk = await DataAccess.isCompanyComplete();
        this._guardCache[guardCacheKey] = { timestamp: Date.now() };
      }
      if (!this._guardCache.companyOk) {
        mainContent.innerHTML = this.showFlowBanner(
          'bi-building-exclamation', 'Lengkapi Data Perusahaan Terlebih Dahulu',
          ERR.COMPANY_INCOMPLETE,
          '<i class="bi bi-building"></i> Isi Data Perusahaan',
          `UIService.navigate('${ROUTES.PERUSAHAAN}')`
        );
        this._loadingRoute = null;
        return;
      }
    }

    if (ROUTES_NEED_PROJECT.includes(route)) {
      if (!this._guardCache.hasProjects || shouldRefreshGuard) {
        this._guardCache.hasProjects = await DataAccess.hasProjects();
        this._guardCache[guardCacheKey] = { timestamp: Date.now() };
      }
      if (!this._guardCache.hasProjects) {
        mainContent.innerHTML = this.showFlowBanner(
          'bi-clipboard-plus', 'Buat Proyek Terlebih Dahulu',
          ERR.NO_PROJECT,
          '<i class="bi bi-clipboard-data"></i> Buat Proyek Baru',
          `UIService.navigate('${ROUTES.PROYEK}')`
        );
        this._loadingRoute = null;
        return;
      }
    }

    const loader = PAGE_LOADERS[route];
    
    if (!loader) {
      console.warn(`[UIService] Tidak ada loader untuk route: ${route}, fallback ke Dashboard`);
      if (route !== ROUTES.DASHBOARD) {
        this.navigate(ROUTES.DASHBOARD);
        return;
      }
      mainContent.innerHTML = '<div class="flow-guard-banner"><p>Halaman tidak ditemukan</p></div>';
      this._loadingRoute = null;
      return;
    }

    try {
      this._showSkeleton(mainContent);
      
      // PERFORMANCE: Gunakan module cache
      let module;
      if (_loadedModules[route]) {
        module = _loadedModules[route];
      } else {
        module = await loader();
        _loadedModules[route] = module;
      }
      
      const page = this._getPageFromModule(module, route);
      
      if (!page || typeof page.render !== 'function') {
        throw new Error(`Module untuk route "${route}" tidak memiliki page object yang valid`);
      }

      this._exposeToGlobal(route, page);

      // PERFORMANCE: Gunakan batch DOM updates
      PerformanceUtils.batchDOMUpdates(() => {
        mainContent.innerHTML = page.render();
        // Gunakan setTimeout untuk memungkinkan rendering selesai
        setTimeout(async () => {
          try {
            await page.init();
          } catch (err) {
            console.error(`[UIService] Error in init for "${route}":`, err);
            AppError.handle(err, `Inisialisasi halaman ${route}`);
          }
        }, 0);
      });
      
    } catch (err) {
      console.error(`[UIService] Gagal memuat halaman "${route}":`, err);
      AppError.handlePageLoad(err, route);
    } finally {
      this._loadingRoute = null;
    }
  },

  _getPageFromModule(module, route) {
    const pageMap = {
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
    
    return pageMap[route] || module.default || Object.values(module).find(v => typeof v === 'object' && v.render);
  },

  _exposeToGlobal(route, page) {
    const globalNames = {
      [ROUTES.DASHBOARD]:  'DashboardPage',
      [ROUTES.PERUSAHAAN]: 'CompanyPage',
      [ROUTES.PROYEK]:     'ProjectPage',
      [ROUTES.METODE]:     'WorkMethodPage',
      [ROUTES.JSA]:        'JSAPage',
      [ROUTES.JADWAL]:     'SchedulePage',
      [ROUTES.MANPOWER]:   'ManpowerPage',
      [ROUTES.PEMBELIAN]:  'ProcurementPage',
      [ROUTES.LAPORAN]:    'ReportPage',
    };
    
    const globalName = globalNames[route];
    if (globalName && page) {
      window[globalName] = page;
    }
  },

  _showSkeleton(container) {
    const routeIcons = {
      [ROUTES.DASHBOARD]: 'bi-speedometer2',
      [ROUTES.PERUSAHAAN]: 'bi-building',
      [ROUTES.PROYEK]: 'bi-clipboard-data',
      [ROUTES.METODE]: 'bi-diagram-3',
      [ROUTES.JSA]: 'bi-journal-check',
      [ROUTES.JADWAL]: 'bi-calendar-week',
      [ROUTES.MANPOWER]: 'bi-people',
      [ROUTES.PEMBELIAN]: 'bi-cart',
      [ROUTES.LAPORAN]: 'bi-file-earmark-pdf',
    };
    
    const routeTitles = {
      [ROUTES.DASHBOARD]: 'Dashboard',
      [ROUTES.PERUSAHAAN]: 'Data Perusahaan',
      [ROUTES.PROYEK]: 'Proyek',
      [ROUTES.METODE]: 'Metode Kerja',
      [ROUTES.JSA]: 'Job Safety Analysis',
      [ROUTES.JADWAL]: 'Jadwal Kerja',
      [ROUTES.MANPOWER]: 'Man Power',
      [ROUTES.PEMBELIAN]: 'Cost Project',
      [ROUTES.LAPORAN]: 'Laporan',
    };
    
    const icon = routeIcons[this.currentRoute] || 'bi-hourglass-split';
    const title = routeTitles[this.currentRoute] || 'Halaman';
    
    container.innerHTML = `
      <div class="skeleton-loading" role="status" aria-label="Memuat konten">
        <div class="text-center mb-4">
          <div class="page-loading-spinner" style="margin: 0 auto 1rem;" aria-hidden="true"></div>
          <h5 style="color: #64748b;">
            <i class="bi ${icon}" aria-hidden="true"></i> Memuat ${title}...
          </h5>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line w-75"></div>
          <div class="skeleton-line w-50"></div>
          <div class="skeleton-line w-100"></div>
          <div class="skeleton-line w-25"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line w-50"></div>
          <div class="skeleton-line w-100"></div>
          <div class="skeleton-line w-100"></div>
          <div class="skeleton-line w-75"></div>
        </div>
      </div>
    `;
  },

  // MEMORY LEAK FIX: Prefetch dengan idle callback dan cleanup
  _prefetchRelatedPages(route) {
    const pagesToPrefetch = PREFETCH_MAP[route] || [];
    
    pagesToPrefetch.forEach(targetRoute => {
      if (_loadedModules[targetRoute]) return;
      
      const loader = PAGE_LOADERS[targetRoute];
      if (!loader) return;
      
      const doPrefetch = () => {
        loader().then(module => {
          _loadedModules[targetRoute] = module;
          const page = this._getPageFromModule(module, targetRoute);
          if (page) {
            this._exposeToGlobal(targetRoute, page);
          }
          console.debug(`[Prefetch] Halaman "${targetRoute}" berhasil di-prefetch`);
        }).catch(err => {
          console.debug(`[Prefetch] Gagal prefetch halaman "${targetRoute}":`, err.message);
        });
      };
      
      const timer = PerformanceUtils.scheduleIdleTask(doPrefetch, 2000);
      this._prefetchTimers.add(timer);
    });
  }
};

// ============================================================
// EXPORT
// ============================================================
window.UtilityService = UtilityService;
window.UIService = UIService;
window.WORK_TYPE_APD = WORK_TYPE_APD;
window.PerformanceUtils = PerformanceUtils;

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  UIService.init();
  if (!AuthService.isLoggedIn()) LoginPage.show();
  else AppAuth.onLoginSuccess(AuthService.getCurrentRole());
});

// MEMORY LEAK FIX: Cleanup saat page unload
window.addEventListener('beforeunload', () => {
  // Cleanup toast container
  if (UIService._toastContainer) {
    UIService._toastContainer.remove();
    UIService._toastContainer = null;
  }
  
  // Cleanup doc number cache
  UtilityService._docNumberCache.clear();
  
  // Cleanup prefetch timers
  UIService._cleanupPrefetchTimers();
  
  // Cleanup loaded modules (opsional, untuk menghemat memory)
  Object.keys(_loadedModules).forEach(key => {
    delete _loadedModules[key];
  });
});

// Export untuk dynamic import
export { UtilityService, UIService, WORK_TYPE_APD, PerformanceUtils };