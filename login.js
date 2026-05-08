// login.js — v2.0 with Memory Leak Fix

const AUTH_KEY = 'kp_auth_session';

const ROLES = {
  admin: { label:'Admin', icon:'bi-shield-lock-fill', color:'#2185D5', allowedRoutes:['dashboard','perusahaan','proyek','metode','jsa','jadwal','manpower','pembelian','laporan','akun'], defaultRoute:'dashboard', badge:'bg-primary' },
  hse: { label:'HSE', icon:'bi-journal-check', color:'#10B981', allowedRoutes:['dashboard','metode','jsa','jadwal','manpower','laporan'], defaultRoute:'jsa', badge:'bg-success' },
  pembeli: { label:'Pembeli', icon:'bi-cart-fill', color:'#F59E0B', allowedRoutes:['dashboard','pembelian','laporan'], defaultRoute:'pembelian', badge:'bg-warning text-dark' }
};

// MEMORY LEAK FIX: Simpan reference listener untuk cleanup
let _keydownListener = null;
let _resizeListener = null;

const AuthService = {
  getSession() {
    try { const r = sessionStorage.getItem(AUTH_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  },
  setSession(user) {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({ ...user, loginAt: new Date().toISOString() }));
  },
  clearSession() { sessionStorage.removeItem(AUTH_KEY); },
  isLoggedIn() { return !!this.getSession(); },
  getCurrentRole() { return this.getSession()?.role || null; },
  getCurrentUser() { return this.getSession() || null; },
  canAccess(route) {
    const role = this.getCurrentRole();
    return !!(role && ROLES[role] && ROLES[role].allowedRoutes.includes(route));
  },
  logout() { 
    this.clearSession(); 
    window.location.hash=''; 
    window.location.reload(); 
  }
};

const AppNavbar = {
  toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  },
  
  openSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (!sidebar || !overlay) return;
    
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // ARIA: Update state
    if (hamburgerBtn) {
      hamburgerBtn.setAttribute('aria-expanded', 'true');
      hamburgerBtn.setAttribute('aria-label', 'Tutup menu');
    }
  },
  
  closeSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    
    if (sidebar) { 
      sidebar.classList.remove('open'); 
      document.body.style.overflow = ''; 
    }
    if (overlay) overlay.classList.remove('active');
    
    // ARIA: Update state
    if (hamburgerBtn) {
      hamburgerBtn.setAttribute('aria-expanded', 'false');
      hamburgerBtn.setAttribute('aria-label', 'Buka menu');
    }
  },
  
  updateUserInfo(session) {
    if (!session) return;
    const rc = ROLES[session.role];
    const nm = document.getElementById(EL.SIDEBAR_USERNAME);
    if (nm) nm.textContent = session.name||'User';
    const rl = document.getElementById(EL.SIDEBAR_USERROLE);
    if (rl) rl.textContent = rc?.label||'Role';
  },
  
  init() {
    // MEMORY LEAK FIX: Simpan reference untuk cleanup
    _keydownListener = (e) => { 
      if (e.key === 'Escape') this.closeSidebar(); 
    };
    document.addEventListener('keydown', _keydownListener);
    
    _resizeListener = () => { 
      if (window.innerWidth >= 1024) this.closeSidebar(); 
    };
    window.addEventListener('resize', _resizeListener);
    
    // MEMORY LEAK FIX: Cleanup saat page unload
    window.addEventListener('beforeunload', () => {
      if (_keydownListener) {
        document.removeEventListener('keydown', _keydownListener);
        _keydownListener = null;
      }
      if (_resizeListener) {
        window.removeEventListener('resize', _resizeListener);
        _resizeListener = null;
      }
    });
  },
  
  // MEMORY LEAK FIX: Method untuk cleanup
  destroy() {
    if (_keydownListener) {
      document.removeEventListener('keydown', _keydownListener);
      _keydownListener = null;
    }
    if (_resizeListener) {
      window.removeEventListener('resize', _resizeListener);
      _resizeListener = null;
    }
  }
};

const LoginPage = {
  _loginContainer: null,
  _submitHandler: null,
  
  show() {
    // MEMORY LEAK FIX: Cleanup existing container
    if (this._loginContainer) {
      this._loginContainer.remove();
      this._loginContainer = null;
    }
    
    ['appSidebar','appMainContent'].forEach(id => { 
      const el = document.getElementById(id); 
      if(el) el.style.display = 'none'; 
    });
    
    const userInfoBar = document.getElementById('userInfoBar');
    if (userInfoBar) userInfoBar.style.display = 'none';
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    
    this._loginContainer = document.createElement('div');
    this._loginContainer.id = 'loginContainer';
    this._loginContainer.setAttribute('role', 'main');
    this._loginContainer.setAttribute('aria-label', 'Halaman login');
    document.body.appendChild(this._loginContainer);
    this._loginContainer.style.display = 'flex';
    this._loginContainer.innerHTML = this.renderHTML();
    
    setTimeout(() => {
      const usernameInput = document.getElementById('loginUsername');
      usernameInput?.focus();
      
      // MEMORY LEAK FIX: Gunakan event delegation pada container
      this._submitHandler = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          LoginPage.submit();
        }
      };
      this._loginContainer.querySelectorAll('input').forEach(i => {
        i.addEventListener('keydown', this._submitHandler);
      });
    }, 50);
  },

  renderHTML() {
    return `<div class="login-card">
      <div class="login-card__header">
        <div class="login-card__logo"><img src="logo1.png" alt="KPT Logo - PT. Kencana Prakarsa Teknik"></div>
        <h1 class="login-card__title">PT. Kencana Prakarsa Teknik</h1>
      </div>
      <div class="login-card__body">
        <div class="login-input-group">
          <label for="loginUsername"><i class="bi bi-person" aria-hidden="true"></i> Username</label>
          <input type="text" id="loginUsername" placeholder="Masukkan username" autocomplete="username" aria-required="true">
        </div>
        <div class="login-input-group">
          <label for="loginPassword"><i class="bi bi-lock" aria-hidden="true"></i> Password</label>
          <input type="password" id="loginPassword" placeholder="Masukkan password" autocomplete="current-password" aria-required="true">
        </div>
        <button class="login-btn" id="loginBtn" onclick="LoginPage.submit()" aria-label="Masuk ke aplikasi">
          <i class="bi bi-box-arrow-in-right" aria-hidden="true"></i> Masuk
        </button>
        <div class="login-error" id="loginError" style="display:none;" role="alert">
          <i class="bi bi-exclamation-circle-fill" aria-hidden="true"></i><span id="loginErrorMsg">Username atau password salah.</span>
        </div>
        <div class="login-footer">Masukkan username dan password yang terdaftar<br>PT. Kencana Prakarsa Teknik</div>
      </div>
    </div>`;
  },

  async submit() {
    const username = document.getElementById('loginUsername')?.value.trim() || '';
    const password = document.getElementById('loginPassword')?.value || '';
    const errorBox = document.getElementById('loginError');
    const errorMsg = document.getElementById('loginErrorMsg');
    const btn = document.getElementById('loginBtn');

    if (!username || !password) {
      errorMsg.textContent = 'Username dan password wajib diisi.';
      errorBox.style.display = 'flex';
      return;
    }

    const spinner = document.getElementById('navbarLoadingSpinner');
    if (spinner) spinner.style.display = 'inline-block';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-hourglass-split" aria-hidden="true"></i> Memverifikasi…';
    }

    try {
      const res = await fetch(window.GS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'login', username, password })
      });
      const json = await res.json();

      if (!json.ok) {
        errorMsg.textContent = json.error || 'Username atau password salah.';
        errorBox.style.display = 'flex';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
        return;
      }

      AuthService.setSession(json.session);
      errorBox.style.display = 'none';
      this.hide();
      AppAuth.onLoginSuccess(json.session.role);
    } catch (err) {
      errorMsg.textContent = 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
      errorBox.style.display = 'flex';
    } finally {
      if (spinner) spinner.style.display = 'none';
      if (btn) { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right" aria-hidden="true"></i> Masuk'; 
      }
    }
  },

  hide() {
    // MEMORY LEAK FIX: Cleanup event listeners
    if (this._loginContainer && this._submitHandler) {
      this._loginContainer.querySelectorAll('input').forEach(i => {
        i.removeEventListener('keydown', this._submitHandler);
      });
      this._submitHandler = null;
    }
    
    const pwField = document.getElementById('loginPassword');
    if (pwField) pwField.value = '';
    
    if (this._loginContainer) {
      this._loginContainer.style.display = 'none';
    }
    
    ['appSidebar','appMainContent'].forEach(id => { 
      const el = document.getElementById(id); 
      if(el) el.style.display = ''; 
    });
    
    const userInfoBar = document.getElementById('userInfoBar');
    if (userInfoBar) userInfoBar.style.display = '';
  }
};

const AppAuth = {
  _navigatePatched: false,
  _originalNavigate: null,
  _accountTableHandler: null,

  onLoginSuccess(role) {
    const session = AuthService.getCurrentUser();
    AppNavbar.updateUserInfo(session);
    this.applyRoleToUI(role);
    const defaultRoute = ROLES[role]?.defaultRoute || 'dashboard';
    window.location.hash = '#' + defaultRoute;
    UIService.navigate(defaultRoute);
  },

  applyRoleToUI(role) {
    const rc = ROLES[role];
    if (!rc) return;
    
    const na = document.getElementById('navItemAkun');
    if (na) na.style.display = role==='admin' ? '' : 'none';
    
    document.querySelectorAll('.nav-item[data-route]').forEach(n => {
      n.style.display = rc.allowedRoutes.includes(n.dataset.route) ? '' : 'none';
    });
    
    // ARIA: Update current page indicator
    document.querySelectorAll('.nav-item[data-route]').forEach(n => {
      n.setAttribute('aria-current', n.classList.contains('active') ? 'page' : 'false');
    });
    
    this.patchNavigate(role);
  },

  patchNavigate(role) {
    if (this._navigatePatched) return;
    const rc = ROLES[role];
    if (!rc || typeof UIService === 'undefined') return;
    
    // MEMORY LEAK FIX: Simpan original reference
    this._originalNavigate = UIService.navigate.bind(UIService);
    
    UIService.navigate = (route) => {
      if (!rc.allowedRoutes.includes(route)) {
        UIService.showToast('Akses ditolak.', 'danger');
        return;
      }
      this._originalNavigate(route);
    };
    
    this._navigatePatched = true;
  },

  // MEMORY LEAK FIX: Restore original navigate
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
      
      // MEMORY LEAK FIX: Cleanup account table handler
      if (this._accountTableHandler) {
        const tbody = document.getElementById('accountTableBody');
        if (tbody) {
          tbody.removeEventListener('click', this._accountTableHandler);
        }
        this._accountTableHandler = null;
      }
      
      AuthService.logout();
    });
  },

  async renderAccountManager() {
    // MEMORY LEAK FIX: Cleanup existing handler
    if (this._accountTableHandler) {
      const tbody = document.getElementById('accountTableBody');
      if (tbody) {
        tbody.removeEventListener('click', this._accountTableHandler);
      }
      this._accountTableHandler = null;
    }
    
    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); }
    catch(err) { console.error('[AppAuth] Gagal memuat akun:', err); }

    const roleColors = { admin:'primary', hse:'success', pembeli:'warning' };

    const html = `<div class="page-header no-print">
      <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-people-fill" aria-hidden="true"></i></span>Manajemen Akun</h2>
      <button class="btn btn--primary" onclick="AppAuth.showAddAccountForm()" aria-label="Tambah akun baru">
        <i class="bi bi-person-plus" aria-hidden="true"></i> Tambah Akun
      </button>
    </div>
    <div id="${EL.ADD_ACCOUNT_FORM_CARD}" class="card" style="display:none;">
      <div class="card-header"><i class="bi bi-person-plus" aria-hidden="true"></i> Tambah / Edit Akun</div>
      <div class="card-body">
        <div class="row g-3">
          <input type="hidden" id="${EL.EDIT_ACCOUNT_USERNAME}" value="">
          <div class="col-sm-6">
            <label class="form-label" for="${EL.INPUT_ACCOUNT_USERNAME}">Username <span class="text-danger" aria-hidden="true">*</span></label>
            <input type="text" class="form-control" id="${EL.INPUT_ACCOUNT_USERNAME}" placeholder="username" required aria-required="true">
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="${EL.INPUT_ACCOUNT_PASSWORD}">Password <span class="text-danger" aria-hidden="true">*</span></label>
            <input type="password" class="form-control" id="${EL.INPUT_ACCOUNT_PASSWORD}" placeholder="password" required aria-required="true">
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="${EL.INPUT_ACCOUNT_NAME}">Nama <span class="text-danger" aria-hidden="true">*</span></label>
            <input type="text" class="form-control" id="${EL.INPUT_ACCOUNT_NAME}" placeholder="Nama lengkap" required aria-required="true">
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="${EL.INPUT_ACCOUNT_ROLE}">Role</label>
            <select class="form-select" id="${EL.INPUT_ACCOUNT_ROLE}">
              <option value="${ROLE_KEYS.ADMIN}">Admin — Akses Penuh</option>
              <option value="${ROLE_KEYS.HSE}">HSE — Metode, JSA, Man Power</option>
              <option value="${ROLE_KEYS.PEMBELI}">Pembeli — Pembelian</option>
            </select>
          </div>
        </div>
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn--primary" onclick="AppAuth.saveAccount()">
            <i class="bi bi-save" aria-hidden="true"></i> Simpan
          </button>
          <button class="btn btn--outline-secondary" onclick="document.getElementById('${EL.ADD_ACCOUNT_FORM_CARD}').style.display='none'">Batal</button>
        </div>
      </div>
    </div>
    <div class="card" id="${EL.ACCOUNT_TABLE_CARD}">
      <div class="card-header">
        <i class="bi bi-people-fill" aria-hidden="true"></i> Daftar Akun
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table--hover mb-0" aria-label="Daftar akun pengguna">
            <thead>
              <tr>
                <th class="col-width-40">No</th>
                <th>Username</th>
                <th>Nama</th>
                <th>Role</th>
                <th class="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody id="accountTableBody">
              ${accounts.length === 0 ? '<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada akun.</td></tr>' : ''}
              ${accounts.map((acc, i) => {
                const rc = ROLES[acc.role];
                return `<tr>
                  <td class="text-center">${i+1}</td>
                  <td><strong>${UtilityService.escapeHtml(acc.username)}</strong></td>
                  <td>${UtilityService.escapeHtml(acc.name||'-')}</td>
                  <td><span class="badge bg-${roleColors[acc.role]||'secondary'}">${rc?.label||acc.role}</span></td>
                  <td class="text-center">
                    <button class="btn btn--xs btn--outline-warning me-1" data-action="edit-account" data-username="${UtilityService.escapeHtml(acc.username)}" aria-label="Edit akun ${UtilityService.escapeHtml(acc.username)}">
                      <i class="bi bi-pencil" aria-hidden="true"></i>
                    </button>
                    <button class="btn btn--xs btn--outline-danger" data-action="delete-account" data-username="${UtilityService.escapeHtml(acc.username)}" aria-label="Hapus akun ${UtilityService.escapeHtml(acc.username)}">
                      <i class="bi bi-trash" aria-hidden="true"></i>
                    </button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

    const mainContent = document.getElementById(EL.APP_MAIN_CONTENT);
    if (!mainContent) return;
    mainContent.innerHTML = html;

    const tbody = document.getElementById('accountTableBody');
    if (tbody) {
      // MEMORY LEAK FIX: Simpan handler reference
      this._accountTableHandler = function(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const username = btn.getAttribute('data-username');
        if (action === 'edit-account') AppAuth.editAccount(username);
        if (action === 'delete-account') AppAuth.deleteAccount(username);
      };
      tbody.addEventListener('click', this._accountTableHandler);
    }
  },

  showAddAccountForm() {
    document.getElementById(EL.EDIT_ACCOUNT_USERNAME).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_USERNAME).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_NAME).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_ROLE).value = ROLE_KEYS.ADMIN;
    const pwInput = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD);
    if (pwInput) { pwInput.value = ''; pwInput.placeholder = 'password'; pwInput.required = true; }
    const f = document.getElementById(EL.ADD_ACCOUNT_FORM_CARD);
    if (f) { f.style.display = 'block'; setTimeout(() => f.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
  },

  async editAccount(username) {
    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); }
    catch (err) { AppError.handle(err, 'Memuat data akun'); return; }

    const acc = accounts.find(a => a.username === username);
    if (!acc) { UIService.showToast('Akun tidak ditemukan.', TOAST.DANGER); return; }

    document.getElementById(EL.EDIT_ACCOUNT_USERNAME).value = acc.username;
    document.getElementById(EL.INPUT_ACCOUNT_USERNAME).value = acc.username;
    document.getElementById(EL.INPUT_ACCOUNT_PASSWORD).value = '';
    document.getElementById(EL.INPUT_ACCOUNT_NAME).value = acc.name || '';
    document.getElementById(EL.INPUT_ACCOUNT_ROLE).value = acc.role;

    const pwInput = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD);
    if (pwInput) { pwInput.placeholder = 'Kosongkan jika tidak diubah'; pwInput.required = false; }

    const f = document.getElementById(EL.ADD_ACCOUNT_FORM_CARD);
    if (f) { f.style.display = 'block'; setTimeout(() => f.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }
  },

  async saveAccount() {
    const username = document.getElementById(EL.INPUT_ACCOUNT_USERNAME).value.trim();
    const password = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD).value.trim();
    const name = document.getElementById(EL.INPUT_ACCOUNT_NAME).value.trim();
    const role = document.getElementById(EL.INPUT_ACCOUNT_ROLE).value;
    const editOldUser = document.getElementById(EL.EDIT_ACCOUNT_USERNAME).value;
    const isEdit = !!editOldUser;

    if (!username || !name) { UIService.showToast(ERR.REQUIRED_FIELD('Username dan nama'), TOAST.WARNING); return; }
    if (!isEdit && !password) { UIService.showToast(ERR.REQUIRED_FIELD('Password'), TOAST.WARNING); return; }
    if (username.length < 3) { UIService.showToast(ERR.MIN_LENGTH('Username', 3), TOAST.WARNING); return; }
    if (password && password.length < 6) { UIService.showToast(ERR.MIN_LENGTH('Password', 6), TOAST.WARNING); return; }

    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); }
    catch (err) { accounts = []; }

    const dup = accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
    if (dup && dup.username !== editOldUser) { UIService.showToast(ERR.DUPLICATE('Username'), TOAST.WARNING); return; }

    try {
      const payload = { action: 'saveAccount', username, name, role, oldUsername: editOldUser || '' };
      if (password) payload.password = password;
      await DB.post(payload);

      AppCache.invalidate('accounts');
      UIService.showToast('Akun berhasil disimpan!', TOAST.SUCCESS);
      document.getElementById(EL.ADD_ACCOUNT_FORM_CARD).style.display = 'none';
      const pwInput = document.getElementById(EL.INPUT_ACCOUNT_PASSWORD);
      if (pwInput) { pwInput.placeholder = 'password'; pwInput.required = true; }
      await AppAuth.renderAccountManager();
    } catch (err) {
      AppError.handle(err, 'Menyimpan akun');
    }
  },

  async deleteAccount(username) {
    const session = AuthService.getCurrentUser();
    if (session && session.username === username) {
      UIService.showToast('Tidak dapat menghapus akun yang sedang aktif!', TOAST.DANGER);
      return;
    }

    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); }
    catch (err) { accounts = []; }
    if (accounts.length <= 1) { UIService.showToast('Minimal harus ada 1 akun!', TOAST.DANGER); return; }

    UtilityService.showConfirmDialog(`Hapus akun "${username}"?`, async () => {
      try {
        await DataAccess.deleteAccount(username);
        UIService.showToast('Akun dihapus.', TOAST.WARNING);
        await AppAuth.renderAccountManager();
      } catch (err) { AppError.handle(err, 'Menghapus akun'); }
    });
  }
};

// MEMORY LEAK FIX: Cleanup saat page unload
window.addEventListener('beforeunload', () => {
  AppNavbar.destroy();
  AppAuth.restoreNavigate();
  
  if (LoginPage._loginContainer) {
    LoginPage._loginContainer.remove();
    LoginPage._loginContainer = null;
  }
});

document.addEventListener('DOMContentLoaded', function() {
  AppNavbar.init();
});