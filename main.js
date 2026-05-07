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

  async generateDocNumber(type) {
    const y = new Date().getFullYear();
    const sheet = type === 'JSA' ? SHEETS.JSA : SHEETS.WORK_METHODS;
    const count = await DB.getCount(sheet);
    const seq = String(count + 1).padStart(3, '0');
    const rand = Math.floor(Math.random() * 90 + 10);
    return `${type}-${y}-${seq}${rand}`;
  },

  showConfirmDialog(message, onConfirm, onCancel) {
    const existing = document.getElementById('confirmDialog');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal fade" id="confirmDialog" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-question-circle text-warning"></i> Konfirmasi</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
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
    document.getElementById('confirmOkBtn').addEventListener('click', () => { modal.hide(); if (onConfirm) onConfirm(); });
    document.getElementById('confirmCancelBtn').addEventListener('click', () => { modal.hide(); if (onCancel) onCancel(); });
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    modal.show();
  }
};

const UIService = {
  currentRoute: null,
  _guardCache: { companyOk: null, hasProjects: null },

  invalidateGuardCache() {
    this._guardCache = { companyOk: null, hasProjects: null };
  },

  init() { this.setupRouting(); },

  showToast(message, type = 'success') {
    let container = document.querySelector('.app-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'app-toast-container';
      document.body.appendChild(container);
    }
    const iconMap = { success:'bi-check-circle-fill', danger:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0 show mb-2`;
    el.style.minWidth = '300px';
    el.innerHTML = `<div class="d-flex"><div class="toast-body d-flex align-items-center gap-2"><i class="bi ${iconMap[type]||iconMap.info}"></i><span class="toast-msg"></span></div><button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button></div>`;
    el.querySelector('.toast-msg').textContent = message;
    container.appendChild(el);
    setTimeout(() => { if (el.parentElement) { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(() => el.remove(), 300); } }, 3500);
  },

  setupRouting() {
    const handle = () => {
      const hash = window.location.hash.replace('#', '') || ROUTES.DASHBOARD;
      this.navigate(hash);
    };
    window.addEventListener('hashchange', handle);
    if (window.location.hash) handle();
    else window.location.hash = '#' + ROUTES.DASHBOARD;
  },

  navigate(route) {
    if (document.getElementById(EL.LOGIN_CONTAINER)?.style.display === 'flex') return;
    this.currentRoute = route;
    document.querySelectorAll('.nav-item[data-route]').forEach(n => n.classList.toggle('active', n.dataset.route === route));
    this.loadPage(route);
    if (window.innerWidth < 769) setTimeout(() => AppNavbar?.closeSidebar(), 100);
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
    const mainContent = document.getElementById('appMainContent');
    if (!mainContent) return;

    // Auth guard: cek apakah user punya hak akses ke route ini
    if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn()) {
      if (!AuthService.canAccess(route) && route !== ROUTES.AKUN) {
        mainContent.innerHTML = `<div class="flow-guard-banner">
          <div class="flow-guard-banner__icon"><i class="bi bi-shield-lock"></i></div>
          <h5 class="flow-guard-banner__title">Akses Ditolak</h5>
          <p class="flow-guard-banner__description">Anda tidak memiliki izin untuk mengakses halaman ini.</p>
          <button class="btn btn--primary" onclick="UIService.navigate('${ROUTES.DASHBOARD}')">Kembali ke Dashboard</button>
        </div>`;
        return;
      }
    }

    if (route === ROUTES.AKUN) {
      if (typeof AppAuth !== 'undefined') {
        await AppAuth.renderAccountManager();
        document.querySelectorAll('.nav-item[data-route]').forEach(n => n.classList.toggle('active', n.dataset.route === ROUTES.AKUN));
      }
      return;
    }

    if (ROUTES_NEED_COMPANY.includes(route)) {
      if (this._guardCache.companyOk === null) this._guardCache.companyOk = await DataAccess.isCompanyComplete();
      if (!this._guardCache.companyOk) {
        mainContent.innerHTML = this.showFlowBanner(
          'bi-building-exclamation', 'Lengkapi Data Perusahaan Terlebih Dahulu',
          ERR.COMPANY_INCOMPLETE,
          '<i class="bi bi-building"></i> Isi Data Perusahaan',
          `UIService.navigate('${ROUTES.PERUSAHAAN}')`
        );
        return;
      }
    }

    if (ROUTES_NEED_PROJECT.includes(route)) {
      if (this._guardCache.hasProjects === null) this._guardCache.hasProjects = await DataAccess.hasProjects();
      if (!this._guardCache.hasProjects) {
        mainContent.innerHTML = this.showFlowBanner(
          'bi-clipboard-plus', 'Buat Proyek Terlebih Dahulu',
          ERR.NO_PROJECT,
          '<i class="bi bi-clipboard-data"></i> Buat Proyek Baru',
          `UIService.navigate('${ROUTES.PROYEK}')`
        );
        return;
      }
    }

    const page = PAGE_MAP[route] || DashboardPage;
    try {
      mainContent.innerHTML = page.render();
      await page.init();
    } catch (err) {
      AppError.handlePageLoad(err, route);
    }
  }
};

const PAGE_MAP = Object.freeze({
  [ROUTES.DASHBOARD]: DashboardPage,
  [ROUTES.PERUSAHAAN]: CompanyPage,
  [ROUTES.PROYEK]: ProjectPage,
  [ROUTES.METODE]: WorkMethodPage,
  [ROUTES.JSA]: JSAPage,
  [ROUTES.JADWAL]: SchedulePage,
  [ROUTES.MANPOWER]: ManpowerPage,
  [ROUTES.PEMBELIAN]: ProcurementPage,
  [ROUTES.LAPORAN]: ReportPage,
  [ROUTES.DOWNLOAD]: DownloadPage,
});

document.addEventListener('DOMContentLoaded', () => {
  UIService.init();
  if (!AuthService.isLoggedIn()) LoginPage.show();
  else AppAuth.onLoginSuccess(AuthService.getCurrentRole());
});

window.UIService = UIService;