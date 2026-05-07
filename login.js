const AUTH_KEY = 'kp_auth_session';

const ROLES = {
  admin: { label:'Admin', icon:'bi-shield-lock-fill', color:'#2185D5', allowedRoutes:['dashboard','perusahaan','proyek','metode','jsa','jadwal','manpower','pembelian','laporan','download','akun'], defaultRoute:'dashboard', badge:'bg-primary' },
  hse: { label:'HSE', icon:'bi-journal-check', color:'#10B981', allowedRoutes:['dashboard','metode','jsa','jadwal','manpower','laporan'], defaultRoute:'jsa', badge:'bg-success' },
  pembeli: { label:'Pembeli', icon:'bi-cart-fill', color:'#F59E0B', allowedRoutes:['dashboard','pembelian','laporan'], defaultRoute:'pembelian', badge:'bg-warning text-dark' }
};

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
  logout() { this.clearSession(); window.location.hash=''; window.location.reload(); }
};

const AppNavbar = {
  toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.contains('open') ? this.closeSidebar() : this.openSidebar();
  },
  openSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  },
  closeSidebar() {
    const s = document.getElementById('appSidebar');
    const o = document.getElementById('sidebarOverlay');
    if (s) { s.classList.remove('open'); document.body.style.overflow = ''; }
    if (o) o.classList.remove('active');
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
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeSidebar(); });
    window.addEventListener('resize', () => { if (window.innerWidth >= 1024) this.closeSidebar(); });
  }
};

const LoginPage = {
  show() {
    ['appSidebar','appMainContent'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
    const userInfoBar = document.getElementById('userInfoBar');
    if (userInfoBar) userInfoBar.style.display = 'none';
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    let c = document.getElementById('loginContainer');
    if (!c) { c = document.createElement('div'); c.id='loginContainer'; document.body.appendChild(c); }
    c.style.display = 'flex';
    c.innerHTML = this.renderHTML();
    setTimeout(() => {
      document.getElementById('loginUsername')?.focus();
      c.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if(e.key==='Enter') LoginPage.submit(); }));
    }, 50);
  },

  renderHTML() {
    return `<div class="login-card">
      <div class="login-card__header">
        <div class="login-card__logo"><img src="logo1.png" alt="KPT Logo"></div>
        <h1 class="login-card__title">PT. Kencana Prakarsa Teknik</h1>
      </div>
      <div class="login-card__body">
        <div class="login-input-group">
          <label for="loginUsername"><i class="bi bi-person"></i> Username</label>
          <input type="text" id="loginUsername" placeholder="Masukkan username" autocomplete="username">
        </div>
        <div class="login-input-group">
          <label for="loginPassword"><i class="bi bi-lock"></i> Password</label>
          <input type="password" id="loginPassword" placeholder="Masukkan password" autocomplete="current-password">
        </div>
        <button class="login-btn" id="loginBtn" onclick="LoginPage.submit()"><i class="bi bi-box-arrow-in-right"></i> Masuk</button>
        <div class="login-error" id="loginError" style="display:none;">
          <i class="bi bi-exclamation-circle-fill"></i><span id="loginErrorMsg">Username atau password salah.</span>
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
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Memverifikasi…';

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
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Masuk'; }
    }
  },

  hide() {
    const pwField = document.getElementById('loginPassword');
    if (pwField) pwField.value = '';
    document.getElementById('loginContainer').style.display = 'none';
    ['appSidebar','appMainContent'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=''; });
    const userInfoBar = document.getElementById('userInfoBar');
    if (userInfoBar) userInfoBar.style.display = '';
  }
};

const AppAuth = {
  _navigatePatched: false,

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
    this.patchNavigate(role);
  },

  patchNavigate(role) {
    if (this._navigatePatched) return;
    const rc = ROLES[role];
    if (!rc || typeof UIService === 'undefined') return;
    const _orig = UIService.navigate.bind(UIService);
    UIService.navigate = function(route) {
      if (!rc.allowedRoutes.includes(route)) {
        UIService.showToast(`Akses ditolak.`, 'danger');
        return;
      }
      _orig(route);
    };
    this._navigatePatched = true;
  },

  logout() {
    UtilityService.showConfirmDialog('Apakah Anda yakin ingin keluar?', () => {
      this._navigatePatched = false;
      AuthService.logout();
    });
  },

  async renderAccountManager() {
    let accounts = [];
    try { accounts = await DataAccess.getAccounts(); }
    catch(err) { console.error('[AppAuth] Gagal memuat akun:', err); }

    const roleColors = { admin:'primary', hse:'success', pembeli:'warning' };

    const html = `<div class="page-header no-print">
      <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-people-fill"></i></span>Manajemen Akun</h2>
      <button class="btn btn--primary" onclick="AppAuth.showAddAccountForm()"><i class="bi bi-person-plus"></i> Tambah Akun</button>
    </div>
    <div id="${EL.ADD_ACCOUNT_FORM_CARD}" class="card" style="display:none;">
      <div class="card-header"><i class="bi bi-person-plus"></i> Tambah / Edit Akun</div>
      <div class="card-body">
        <div class="row g-3">
          <input type="hidden" id="${EL.EDIT_ACCOUNT_USERNAME}" value="">
          <div class="col-sm-6"><label class="form-label">Username <span class="text-danger">*</span></label><input type="text" class="form-control" id="${EL.INPUT_ACCOUNT_USERNAME}" placeholder="username" required></div>
          <div class="col-sm-6"><label class="form-label">Password <span class="text-danger">*</span></label><input type="password" class="form-control" id="${EL.INPUT_ACCOUNT_PASSWORD}" placeholder="password" required></div>
          <div class="col-sm-6"><label class="form-label">Nama <span class="text-danger">*</span></label><input type="text" class="form-control" id="${EL.INPUT_ACCOUNT_NAME}" placeholder="Nama lengkap" required></div>
          <div class="col-sm-6"><label class="form-label">Role</label>
            <select class="form-select" id="${EL.INPUT_ACCOUNT_ROLE}">
              <option value="${ROLE_KEYS.ADMIN}">Admin — Akses Penuh</option>
              <option value="${ROLE_KEYS.HSE}">HSE — Metode, JSA, Man Power</option>
              <option value="${ROLE_KEYS.PEMBELI}">Pembeli — Pembelian</option>
            </select>
          </div>
        </div>
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn--primary" onclick="AppAuth.saveAccount()"><i class="bi bi-save"></i> Simpan</button>
          <button class="btn btn--outline-secondary" onclick="document.getElementById('${EL.ADD_ACCOUNT_FORM_CARD}').style.display='none'">Batal</button>
        </div>
      </div>
    </div>
    <div class="card" id="${EL.ACCOUNT_TABLE_CARD}"><div class="card-body p-0"><div class="table-responsive">
      <table class="table table--hover mb-0">
        <thead><tr><th class="col-width-40">No</th><th>Username</th><th>Nama</th><th>Role</th><th class="text-center">Aksi</th></tr></thead>
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
                <button class="btn btn--xs btn--outline-warning me-1" data-action="edit-account" data-username="${UtilityService.escapeHtml(acc.username)}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn--xs btn--outline-danger" data-action="delete-account" data-username="${UtilityService.escapeHtml(acc.username)}"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div></div></div>`;

    const mainContent = document.getElementById(EL.APP_MAIN_CONTENT);
    if (!mainContent) return;
    mainContent.innerHTML = html;

    const tbody = document.getElementById('accountTableBody');
    if (tbody) {
      tbody.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const username = btn.getAttribute('data-username');
        if (action === 'edit-account') AppAuth.editAccount(username);
        if (action === 'delete-account') AppAuth.deleteAccount(username);
      });
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
      // Gunakan _post() bukan fetch() langsung agar token otomatis disertakan
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

document.addEventListener('DOMContentLoaded', function() {
  AppNavbar.init();
});