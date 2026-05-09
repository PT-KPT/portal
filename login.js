// login.js — ES6 Module v2.1 with Auto-Warmup after Login
import { EL, ROLE_KEYS, ROUTES } from './constants.js';
import { GS_API_URL } from './config.js';

const AUTH_KEY = 'kp_auth_session';

export const ROLES = {
  admin:   { label:'Admin',   icon:'bi-shield-lock-fill',  color:'#2185D5', allowedRoutes:['dashboard','perusahaan','proyek','metode','jsa','jadwal','manpower','pembelian','laporan','akun'], defaultRoute:'dashboard', badge:'bg-primary' },
  hse:     { label:'HSE',     icon:'bi-journal-check',     color:'#10B981', allowedRoutes:['dashboard','metode','jsa','jadwal','manpower','laporan'], defaultRoute:'jsa', badge:'bg-success' },
  pembeli: { label:'Pembeli', icon:'bi-cart-fill',         color:'#F59E0B', allowedRoutes:['dashboard','pembelian','laporan'], defaultRoute:'pembelian', badge:'bg-warning text-dark' }
};

export const AuthService = {
  getSession()         { try { const r = sessionStorage.getItem(AUTH_KEY); return r ? JSON.parse(r) : null; } catch { return null; } },
  setSession(user)     { sessionStorage.setItem(AUTH_KEY, JSON.stringify({ ...user, loginAt: new Date().toISOString() })); },
  clearSession()       { sessionStorage.removeItem(AUTH_KEY); },
  isLoggedIn()         { return !!this.getSession(); },
  getCurrentRole()     { return this.getSession()?.role || null; },
  getCurrentUser()     { return this.getSession() || null; },
  canAccess(route)     { const role = this.getCurrentRole(); return !!(role && ROLES[role] && ROLES[role].allowedRoutes.includes(route)); },
  logout()             { this.clearSession(); window.location.hash = ''; window.location.reload(); }
};

// Expose to global for HTML onclick handlers
window.AuthService = AuthService;

let _keydownListener = null;
let _resizeListener  = null;

export const AppNavbar = {
  toggleSidebar() { const sb = document.getElementById('appSidebar'); sb?.classList.contains('open') ? this.closeSidebar() : this.openSidebar(); },

  openSidebar() {
    const sidebar  = document.getElementById('appSidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    const hBtn     = document.getElementById('hamburgerBtn');
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (hBtn) { hBtn.setAttribute('aria-expanded','true'); hBtn.setAttribute('aria-label','Tutup menu'); }
  },

  closeSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const hBtn    = document.getElementById('hamburgerBtn');
    if (sidebar) { sidebar.classList.remove('open'); document.body.style.overflow = ''; }
    if (overlay) overlay.classList.remove('active');
    if (hBtn) { hBtn.setAttribute('aria-expanded','false'); hBtn.setAttribute('aria-label','Buka menu'); }
  },

  updateUserInfo(session) {
    if (!session) return;
    const rc = ROLES[session.role];
    const nm = document.getElementById(EL.SIDEBAR_USERNAME);
    const rl = document.getElementById(EL.SIDEBAR_USERROLE);
    if (nm) nm.textContent = session.name || 'User';
    if (rl) rl.textContent = rc?.label || 'Role';
  },

  init() {
    _keydownListener = (e) => { if (e.key === 'Escape') this.closeSidebar(); };
    _resizeListener  = () => { if (window.innerWidth >= 1024) this.closeSidebar(); };
    document.addEventListener('keydown', _keydownListener);
    window.addEventListener('resize', _resizeListener);
    window.addEventListener('beforeunload', () => this.destroy());
  },

  destroy() {
    if (_keydownListener) { document.removeEventListener('keydown', _keydownListener); _keydownListener = null; }
    if (_resizeListener)  { window.removeEventListener('resize', _resizeListener); _resizeListener = null; }
  }
};

window.AppNavbar = AppNavbar;

export const LoginPage = {
  _loginContainer: null,
  _submitHandler:  null,

  show() {
    if (this._loginContainer) { this._loginContainer.remove(); this._loginContainer = null; }
    ['appSidebar','appMainContent'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const userInfoBar = document.getElementById('userInfoBar');
    if (userInfoBar) userInfoBar.style.display = 'none';
    document.getElementById('sidebarOverlay')?.classList.remove('active');

    this._loginContainer = document.createElement('div');
    this._loginContainer.id = 'loginContainer';
    this._loginContainer.setAttribute('role','main');
    document.body.appendChild(this._loginContainer);
    this._loginContainer.style.display = 'flex';
    this._loginContainer.innerHTML = this.renderHTML();

    setTimeout(() => {
      document.getElementById('loginUsername')?.focus();
      this._submitHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submit(); } };
      this._loginContainer.querySelectorAll('input').forEach(i => i.addEventListener('keydown', this._submitHandler));
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
        <button class="login-btn" id="loginBtn" aria-label="Masuk ke aplikasi">
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
    const username  = document.getElementById('loginUsername')?.value.trim() || '';
    const password  = document.getElementById('loginPassword')?.value || '';
    const errorBox  = document.getElementById('loginError');
    const errorMsg  = document.getElementById('loginErrorMsg');
    const btn       = document.getElementById('loginBtn');

    if (!username || !password) { errorMsg.textContent = 'Username dan password wajib diisi.'; errorBox.style.display = 'flex'; return; }

    const spinner = document.getElementById('navbarLoadingSpinner');
    if (spinner) spinner.style.display = 'inline-block';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Memverifikasi…'; }

    try {
      const res  = await fetch(GS_API_URL, { method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({ action:'login', username, password }) });
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
      window.AppAuth.onLoginSuccess(json.session.role);
      
      // 🆕 Trigger cache warmup di background setelah login sukses
      setTimeout(async () => {
        try {
          console.log('[LoginPage] 🔥 Starting background cache warmup...');
          const { AppCache } = await import('./cache.js');
          const prioritySheets = AppCache.getPrioritySheets();
          await AppCache.warmupBulk(prioritySheets);
          console.log('[LoginPage] ✅ Background cache warmup complete');
        } catch (err) {
          console.warn('[LoginPage] ⚠️ Background cache warmup failed:', err.message);
        }
      }, 500);
    } catch {
      errorMsg.textContent = 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
      errorBox.style.display = 'flex';
    } finally {
      if (spinner) spinner.style.display = 'none';
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Masuk'; }
    }
  },

  hide() {
    if (this._loginContainer && this._submitHandler) {
      this._loginContainer.querySelectorAll('input').forEach(i => i.removeEventListener('keydown', this._submitHandler));
      this._submitHandler = null;
    }
    const pwField = document.getElementById('loginPassword');
    if (pwField) pwField.value = '';
    if (this._loginContainer) this._loginContainer.style.display = 'none';
    ['appSidebar','appMainContent'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    const userInfoBar = document.getElementById('userInfoBar');
    if (userInfoBar) userInfoBar.style.display = '';
  }
};

window.LoginPage = LoginPage;