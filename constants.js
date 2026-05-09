// constants.js — ES6 Module

export const ROUTES = Object.freeze({
  DASHBOARD:  'dashboard',
  PERUSAHAAN: 'perusahaan',
  PROYEK:     'proyek',
  METODE:     'metode',
  JSA:        'jsa',
  JADWAL:     'jadwal',
  MANPOWER:   'manpower',
  PEMBELIAN:  'pembelian',
  LAPORAN:    'laporan',
  AKUN:       'akun',
});

export const ROUTES_NEED_COMPANY = Object.freeze([
  ROUTES.PROYEK, ROUTES.METODE, ROUTES.JSA, ROUTES.JADWAL,
  ROUTES.MANPOWER, ROUTES.PEMBELIAN, ROUTES.LAPORAN, ROUTES.AKUN,
]);

export const ROUTES_NEED_PROJECT = Object.freeze([
  ROUTES.METODE, ROUTES.JSA, ROUTES.JADWAL, ROUTES.MANPOWER, ROUTES.PEMBELIAN, ROUTES.LAPORAN,
]);

export const SHEETS = Object.freeze({
  COMPANY:     'company',
  PROJECTS:    'projects',
  JSA:         'jsa',
  WORK_METHODS:'work_methods',
  PERSONNEL:   'personnel',
  MANPOWER:    'manpower',
  PROCUREMENT: 'procurement',
  ACCOUNTS:    'accounts',
  SCHEDULE:    'jadwal',
});

export const EL = Object.freeze({
  APP_NAVBAR:             'appNavbar',
  APP_SIDEBAR:            'appSidebar',
  APP_MAIN_CONTENT:       'appMainContent',
  SIDEBAR_OVERLAY:        'sidebarOverlay',
  NAVBAR_SPINNER:         'navbarLoadingSpinner',
  SIDEBAR_USERNAME:       'userInfoBarName',
  SIDEBAR_USERROLE:       'userInfoBarRole',
  NAV_ITEM_AKUN:          'navItemAkun',
  LOGIN_CONTAINER:        'loginContainer',
  LOGIN_USERNAME:         'loginUsername',
  LOGIN_PASSWORD:         'loginPassword',
  LOGIN_BTN:              'loginBtn',
  LOGIN_ERROR:            'loginError',
  LOGIN_ERROR_MSG:        'loginErrorMsg',
  ACCOUNT_TABLE_CARD:     'accountTableCard',
  ADD_ACCOUNT_FORM_CARD:  'addAccountFormCard',
  EDIT_ACCOUNT_USERNAME:  'editAccountUsername',
  INPUT_ACCOUNT_USERNAME: 'inputAccountUsername',
  INPUT_ACCOUNT_PASSWORD: 'inputAccountPassword',
  INPUT_ACCOUNT_NAME:     'inputAccountName',
  INPUT_ACCOUNT_ROLE:     'inputAccountRole',
  DASHBOARD_ALERTS:       'dashboardAlerts',
  STAT_COMPANY:           'statCompany',
  STAT_PROJECTS:          'statProjects',
  STAT_JSA:               'statJSA',
  STAT_WORK_METHODS:      'statWorkMethods',
  STAT_PROCUREMENT:       'statProcurement',
  STAT_MANPOWER:          'statManpower',
  RECENT_JSA:             'recentJSA',
  RECENT_PROJECTS:        'recentProjects',
});

export const ROLE_KEYS = Object.freeze({
  ADMIN:   'admin',
  HSE:     'hse',
  PEMBELI: 'pembeli',
});

export const ERR = Object.freeze({
  COMPANY_INCOMPLETE: 'Harap lengkapi profil perusahaan terlebih dahulu.',
  NO_PROJECT:         'Seluruh fitur harus terikat pada sebuah Proyek.',
  NETWORK:            'Gagal terhubung ke server. Periksa koneksi internet Anda.',
  SAVE_FAILED:        'Gagal menyimpan data. Silakan coba lagi.',
  DELETE_FAILED:      'Gagal menghapus data. Silakan coba lagi.',
  LOAD_FAILED:        'Gagal memuat data. Silakan muat ulang halaman.',
  REQUIRED_FIELD:     (field) => `${field} wajib diisi!`,
  MIN_LENGTH:         (field, n) => `${field} minimal ${n} karakter!`,
  DUPLICATE:          (field) => `${field} sudah digunakan!`,
});

export const TOAST = Object.freeze({
  SUCCESS: 'success',
  DANGER:  'danger',
  WARNING: 'warning',
  INFO:    'info',
});

export const DEBOUNCE_KEYS = Object.freeze({
  SEARCH_PROJECT:     'searchProject',
  SEARCH_JSA:         'searchJSA',
  SEARCH_WORK_METHOD: 'searchWorkMethod',
  SEARCH_PO:          'searchPO',
});
