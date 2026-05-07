const DashboardPage = {
  render() {
    return `
    <div class="page-header no-print">
      <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
    </div>
    <div id="${EL.DASHBOARD_ALERTS}"></div>
    <div class="stat-grid">
      ${this._statCard('blue', 'bi-building', EL.STAT_COMPANY, 'Perusahaan', ROUTES.PERUSAHAAN)}
      ${this._statCard('green', 'bi-clipboard-data', EL.STAT_PROJECTS, 'Proyek', ROUTES.PROYEK)}
      ${this._statCard('indigo', 'bi-diagram-3', EL.STAT_WORK_METHODS, 'Metode Kerja', ROUTES.METODE)}
      ${this._statCard('amber', 'bi-journal-check', EL.STAT_JSA, 'Total JSA', ROUTES.JSA)}
      ${this._statCard('cyan', 'bi-people', EL.STAT_MANPOWER, 'Man Power', ROUTES.MANPOWER)}
      ${this._statCard('red', 'bi-cart', EL.STAT_PROCUREMENT, 'Pembelian', ROUTES.PEMBELIAN)}
    </div>
    <div class="row g-3">
      <div class="col-md-6">
        <div class="card">
          <div class="card-header"><i class="bi bi-journal-text"></i> JSA Terbaru
            <a href="#${ROUTES.JSA}" class="ms-auto btn btn--xs btn--ghost" onclick="event.preventDefault();UIService.navigate('${ROUTES.JSA}')">Lihat Semua <i class="bi bi-chevron-right"></i></a>
          </div>
          <div id="${EL.RECENT_JSA}"><div class="empty-state"><div class="empty-state__icon"><i class="bi bi-journal"></i></div><p>Memuat…</p></div></div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card">
          <div class="card-header"><i class="bi bi-building"></i> Proyek Terbaru
            <a href="#${ROUTES.PROYEK}" class="ms-auto btn btn--xs btn--ghost" onclick="event.preventDefault();UIService.navigate('${ROUTES.PROYEK}')">Lihat Semua <i class="bi bi-chevron-right"></i></a>
          </div>
          <div id="${EL.RECENT_PROJECTS}"><div class="empty-state"><div class="empty-state__icon"><i class="bi bi-clipboard-data"></i></div><p>Memuat…</p></div></div>
        </div>
      </div>
    </div>`;
  },

  _statCard(color, icon, id, label, route) {
    return `<div class="stat-card stat-card--${color} stat-card--clickable" onclick="UIService.navigate('${route}')">
      <div class="stat-card__icon"><i class="bi ${icon}"></i></div>
      <div class="stat-card__value" id="${id}">-</div>
      <div class="stat-card__label">${label}</div>
    </div>`;
  },

  async init() {
    try {
      const [company, stats, recentJSA, recentProjects] = await Promise.all([
        DataAccess.getCompany(),
        DB.getStats(),
        DB.getRecent(SHEETS.JSA, 5),
        DB.getRecent(SHEETS.PROJECTS, 4)
      ]);

      const alertsEl = document.getElementById(EL.DASHBOARD_ALERTS);
      if (alertsEl) {
        const isCompanyReady = !!(company && company.name);
        const hasProj = stats.totalProjects > 0;
        if (!isCompanyReady) {
          alertsEl.innerHTML = `<div class="flow-alert flow-alert--warning"><i class="bi bi-exclamation-triangle-fill"></i> <strong>Langkah 1:</strong> Lengkapi <a href="#${ROUTES.PERUSAHAAN}" onclick="event.preventDefault();UIService.navigate('${ROUTES.PERUSAHAAN}')">Data Perusahaan</a> terlebih dahulu.</div>`;
        } else if (!hasProj) {
          alertsEl.innerHTML = `<div class="flow-alert flow-alert--info"><i class="bi bi-info-circle-fill"></i> <strong>Langkah 2:</strong> <a href="#${ROUTES.PROYEK}" onclick="event.preventDefault();UIService.navigate('${ROUTES.PROYEK}')">Buat Proyek pertama Anda</a> untuk mulai menggunakan semua fitur.</div>`;
        }
      }

      const statCompanyEl = document.getElementById(EL.STAT_COMPANY);
      if (statCompanyEl) statCompanyEl.textContent = company ? '✓' : '-';

      const statMap = {
        [EL.STAT_PROJECTS]: stats.totalProjects,
        [EL.STAT_JSA]: stats.totalJSA,
        [EL.STAT_WORK_METHODS]: stats.totalWorkMethods,
        [EL.STAT_PROCUREMENT]: stats.totalPO,
        [EL.STAT_MANPOWER]: stats.totalManpower,
      };

      Object.entries(statMap).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined ? val : '-';
      });

      const recentJSAEl = document.getElementById(EL.RECENT_JSA);
      if (recentJSAEl) {
        if (recentJSA.length > 0) {
          recentJSAEl.innerHTML = recentJSA.map(jsa => `
            <a href="#${ROUTES.JSA}" class="list-item" onclick="event.preventDefault();UIService.navigate('${ROUTES.JSA}')">
              <div class="list-item__icon list-item__icon--warning"><i class="bi bi-journal-text"></i></div>
              <div class="list-item__body">
                <div class="list-item__title">${UtilityService.escapeHtml(jsa.document_number || 'Tanpa Nomor')}</div>
                <div class="list-item__subtitle">${UtilityService.escapeHtml(jsa.project_id || '-')}</div>
              </div>
              <div class="list-item__end"><span class="text-muted">${UtilityService.getTimeAgo(jsa.updated_at || jsa.created_at)}</span></div>
            </a>
          `).join('');
        } else {
          recentJSAEl.innerHTML = '<div class="empty-state"><div class="empty-state__icon"><i class="bi bi-journal"></i></div><p>Belum ada JSA</p></div>';
        }
      }

      const recentProjectsEl = document.getElementById(EL.RECENT_PROJECTS);
      if (recentProjectsEl) {
        if (recentProjects.length > 0) {
          recentProjectsEl.innerHTML = recentProjects.map(project => `
            <a href="#${ROUTES.PROYEK}" class="list-item" onclick="event.preventDefault();UIService.navigate('${ROUTES.PROYEK}')">
              <div class="list-item__icon list-item__icon--success"><i class="bi bi-building"></i></div>
              <div class="list-item__body">
                <div class="list-item__title">${UtilityService.escapeHtml(project.name)}</div>
                <div class="list-item__subtitle">${UtilityService.escapeHtml(project.client || '-')}</div>
              </div>
              <div class="list-item__end"><span class="text-muted">${UtilityService.getTimeAgo(project.updated_at || project.created_at)}</span></div>
            </a>
          `).join('');
        } else {
          recentProjectsEl.innerHTML = '<div class="empty-state"><div class="empty-state__icon"><i class="bi bi-clipboard-data"></i></div><p>Belum ada proyek</p></div>';
        }
      }
    } catch (err) {
      AppError.handle(err, 'Memuat dashboard');
      const alertsEl = document.getElementById(EL.DASHBOARD_ALERTS);
      if (alertsEl) {
        alertsEl.innerHTML = `<div class="flow-alert flow-alert--warning"><i class="bi bi-exclamation-triangle-fill"></i> Gagal memuat data dashboard. <a href="javascript:location.reload()">Muat ulang</a></div>`;
      }
    }
  }
};