// error-handler.js — ES6 Module
import { ERR, TOAST, EL, ROUTES } from './constants.js';

export const AppError = {
  handle(err, context = '') {
    console.error(`[AppError]${context ? ' ' + context + ':' : ''}`, err);
    const message = this._translate(err, context);
    // UIService resolved at runtime to avoid circular dependency
    window.UIService?.showToast(message, TOAST.DANGER);
    return message;
  },

  handlePageLoad(err, route = '') {
    console.error(`[AppError] Gagal memuat halaman "${route}":`, err);
    const mainContent = document.getElementById(EL.APP_MAIN_CONTENT);
    if (!mainContent) return;

    const message = this._translate(err, `Memuat halaman ${route}`);
    const errDiv = document.createElement('div');
    errDiv.className = 'alert alert-danger m-3';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    errDiv.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-2"></i>';
    errDiv.appendChild(msgSpan);

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'btn btn--outline-primary mt-2 d-block';
    reloadBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Coba Lagi';
    reloadBtn.onclick = () => window.UIService?.navigate(route || ROUTES.DASHBOARD);
    errDiv.appendChild(reloadBtn);

    mainContent.innerHTML = '';
    mainContent.appendChild(errDiv);
  },

  _translate(err, context = '') {
    if (!err) return ERR.LOAD_FAILED;
    const msg = (err.message || String(err)).toLowerCase();
    if (!navigator.onLine)                                                                      return 'Tidak ada koneksi internet. Periksa jaringan Anda dan coba lagi.';
    if (msg.includes('failed to fetch') || msg.includes('networkerror'))                       return ERR.NETWORK;
    if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many'))       return 'Batas permintaan terlampaui. Tunggu beberapa saat lalu coba lagi.';
    if (msg.includes('timeout') || msg.includes('deadline exceeded'))                          return 'Server lambat merespons. Coba lagi dalam beberapa saat.';
    if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('403'))      return 'Sesi Anda telah berakhir. Silakan login kembali.';
    if (err.message && !err.message.startsWith('API error') && err.message.length < 200 && !msg.includes('typeerror') && !msg.includes('referenceerror')) {
      const prefix = context ? `${context} gagal: ` : 'Terjadi kesalahan: ';
      return prefix + err.message;
    }
    if (context) return `${context} gagal. Silakan coba lagi.`;
    return ERR.LOAD_FAILED;
  },

  wrapAsync(fn, context = '') {
    return async (...args) => {
      try { return await fn(...args); }
      catch (err) { this.handle(err, context); return null; }
    };
  },
};

window.addEventListener('offline', () => {
  window.UIService?.showToast('Koneksi internet terputus. Beberapa fitur mungkin tidak tersedia.', TOAST.WARNING);
});
window.addEventListener('online', () => {
  window.UIService?.showToast('Koneksi internet pulih.', TOAST.SUCCESS);
});
