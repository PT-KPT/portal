// laporan.js — Report Page (async Google Sheets) - UPDATED with Gantt Chart Style Timeline
const ReportPage = {
  _currentReportType: 'jsa',
  _loadedTabs: new Set(),
  _data: { projects:[], jsa:[], wm:[], po:[], personnel:[], manpower:[], company:null, schedule:[] },

  render() {
    return `
    <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
        <div class="page-header__filter">
          <select class="form-select" id="selectReportProject" onchange="ReportPage.onProjectChange()">
            <option value="">-- Pilih Proyek --</option>
          </select>
        </div>
        <button class="btn btn--primary no-print" onclick="ReportPage.printReport()"><i class="bi bi-printer"></i> Cetak PDF</button>
      </div>
    <div id="reportListView">
      <div class="card no-print"><div class="card-body p-0">
        <div class="row g-2 p-3">
          <div class="col-12">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="tab-nav" id="reportTabs" style="margin-bottom:0;border-bottom:none;">
                <button class="tab-nav__btn tab-nav__btn--active" onclick="ReportPage.switchReportTab('jsa')">JSA</button>
                <button class="tab-nav__btn" onclick="ReportPage.switchReportTab('wm')">Metode Kerja</button>
                <button class="tab-nav__btn" onclick="ReportPage.switchReportTab('schedule')">Jadwal Kerja</button>
                <button class="tab-nav__btn" onclick="ReportPage.switchReportTab('po')">Cost Project</button>
                <button class="tab-nav__btn" onclick="ReportPage.switchReportTab('manpower')">Man Power</button>
              </div>
            </div>
          </div>
        </div>
      </div></div>
      <div id="reportOutput"><div class="report-container"><div class="empty-state"><p>Memuat data…</p></div></div></div>
    </div>`;
  },

  async init() {
    this._loadedTabs = new Set();
    this._data = { projects:[], jsa:[], wm:[], po:[], personnel:[], manpower:[], company:null, schedule:[] };

    const [projects, company] = await Promise.all([
      DataAccess.getAllProjects(),
      DataAccess.getCompany()
    ]);
    this._data.projects = projects;
    this._data.company  = company;

    const sel = document.getElementById('selectReportProject');
    if (sel) {
      sel.innerHTML = '<option value="">-- Pilih Proyek --</option>';
      projects.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
    }

    if (!projects.length) {
      document.getElementById('reportOutput').innerHTML = this.showFlowBanner(
        'bi-clipboard-plus', 'Belum Ada Proyek',
        'Buat proyek terlebih dahulu sebelum mencetak laporan.',
        '<i class="bi bi-clipboard-data"></i> Buat Proyek',
        "UIService.navigate('proyek')"
      );
      return;
    }

    this._currentReportType = 'jsa';
    document.querySelectorAll('#reportTabs .tab-nav__btn').forEach((btn, idx) => {
      btn.classList.toggle('tab-nav__btn--active', idx === 0);
    });
    this.renderReport();
  },

  printReport() {
    // Sembunyikan elemen no-print sebelum print
    const noPrintElements = document.querySelectorAll('.no-print');
    const originalDisplays = [];
    noPrintElements.forEach(el => {
      originalDisplays.push({ el, display: el.style.display });
      el.style.display = 'none';
    });
    
    window.print();
    
    // Kembalikan tampilan setelah print
    originalDisplays.forEach(({ el, display }) => {
      el.style.display = display;
    });
  },

  showFlowBanner(icon, title, message, buttonLabel, buttonAction) {
    return `<div class="flow-guard-banner">
      <div class="flow-guard-banner__icon"><i class="bi ${icon}"></i></div>
      <h5 class="flow-guard-banner__title">${title}</h5>
      <p class="flow-guard-banner__description">${message}</p>
      <button class="btn btn--primary no-print" onclick="${buttonAction}">${buttonLabel}</button>
    </div>`;
  },

  async _loadTabData(tab) {
    const reportEl = document.getElementById('reportOutput');
    if (reportEl) reportEl.innerHTML = '<div class="report-container"><div class="empty-state"><p>Memuat data…</p></div></div>';

    try {
      if (tab === 'jsa' && !this._data.jsa.length) {
        this._data.jsa = await DataAccess.getAllJSA();
      }
      if (tab === 'wm' && !this._data.wm.length) {
        this._data.wm = await DataAccess.getAllWorkMethods();
      }
      if (tab === 'schedule') {
        if (!this._data.wm.length) {
          this._data.wm = await DataAccess.getAllWorkMethods();
        }
        const projectId = document.getElementById('selectReportProject')?.value || '';
        if (projectId) {
          this._data.schedule = await DataAccess.getScheduleByProject(projectId);
        } else {
          this._data.schedule = await StorageService.getData('jadwal');
        }
      }
      if (tab === 'po' && !this._data.po.length) {
        this._data.po = await DataAccess.getAllPO();
      }
      if (tab === 'manpower' && !this._data.personnel.length) {
        [this._data.personnel, this._data.manpower] = await Promise.all([
          DataAccess.getAllPersonnel(),
          DataAccess.getAllManpower()
        ]);
      }
    } catch (err) {
      AppError.handle(err, `Memuat data tab ${tab}`);
    }
  },

  async onProjectChange() {
    this._loadedTabs = new Set();
    this._data.jsa = [];
    this._data.wm = [];
    this._data.po = [];
    this._data.personnel = [];
    this._data.manpower = [];
    this._data.schedule = [];

    const projectId = document.getElementById('selectReportProject')?.value || '';
    if (!projectId) {
      this.renderReport();
      return;
    }
    const tab = this._currentReportType;
    await this._loadTabData(tab);
    this._loadedTabs.add(tab);
    this.renderReport();
  },

  async switchReportTab(reportType) {
    this._currentReportType = reportType;
    document.querySelectorAll('#reportTabs .tab-nav__btn').forEach((btn, idx) => {
      const tabs = ['jsa', 'wm', 'schedule', 'po', 'manpower'];
      btn.classList.toggle('tab-nav__btn--active', tabs[idx] === reportType);
    });

    const projectId = document.getElementById('selectReportProject')?.value || '';
    if (!projectId) {
      this.renderReport();
      return;
    }

    if (!this._loadedTabs.has(reportType)) {
      await this._loadTabData(reportType);
      this._loadedTabs.add(reportType);
    }
    this.renderReport();
  },

  renderReport() {
    const projectId = document.getElementById('selectReportProject')?.value || '';
    const company   = this._data.company;

    if (!projectId) {
      document.getElementById('reportOutput').innerHTML = `
        <div class="report-container">
          <div class="flow-guard-banner">
            <div class="flow-guard-banner__icon"><i class="bi bi-funnel"></i></div>
            <h5 class="flow-guard-banner__title">Pilih Proyek Terlebih Dahulu</h5>
            <p class="flow-guard-banner__description">Gunakan filter <strong>Pilih Proyek</strong> di atas untuk menampilkan laporan.</p>
          </div>
        </div>`;
      return;
    }

    let html = '<div class="report-container">';
    switch (this._currentReportType) {
      case 'jsa':      html += this.buildJSAReport(projectId, company);      break;
      case 'wm':       html += this.buildWMReport(projectId, company);       break;
      case 'schedule': html += this.buildScheduleReport(projectId, company); break;
      case 'po':       html += this.buildPOReport(projectId, company);       break;
      case 'manpower': html += this.buildManpowerReport(projectId, company); break;
      default:         html += '<div class="alert alert-info">Pilih tipe laporan di atas</div>';
    }
    html += '</div>';
    document.getElementById('reportOutput').innerHTML = html;
  },

  createReportRow(label, value) {
    return `<tr><td class="col-width-28 fw-semibold" style="background:#f8fafc;">${UtilityService.escapeHtml(label)}</td><td>${value||'-'}</td></tr>`;
  },

  buildReportHeader(company, title, titleIcon='bi-file-earmark-pdf') {
    if (!company) return `<div class="report-header"><div class="report-header__content"><div class="report-header__title"><i class="bi ${titleIcon}"></i> ${UtilityService.escapeHtml(title)}</div></div></div>`;
    return `<div class="report-header"><div class="report-header__layout">
      <div class="report-header__left">
        <div class="report-header__logo-section"><img src="logo.png" alt="Logo" style="width:100%;height:100%"></div>
        <div class="report-header__company-info">
          <div class="report-header__company-name">${UtilityService.escapeHtml(company.name)}</div>
          ${company.address?`<div class="report-header__company-detail"> ${UtilityService.escapeHtml(company.address)}</div>`:''}
          <div class="report-header__company-contact">
            ${company.contact?`<span><i class="bi bi-telephone"></i> ${UtilityService.escapeHtml(company.contact)}</span>`:''}
            ${company.email?`<span><i class="bi bi-envelope"></i> ${UtilityService.escapeHtml(company.email)}</span>`:''}
            ${company.website?`<span><i class="bi bi-globe"></i> ${UtilityService.escapeHtml(company.website)}</span>`:''}
          </div>
        </div>
      </div>
      <div class="report-header__right">
        <div class="report-header__doc-type">${UtilityService.escapeHtml(title)}</div>
      </div>
    </div></div>`;
  },

  buildProjectInfoSection(project, includeAllFields=true) {
    if(!project) return '';
    let h=`<div class="report-section-title"><i class="bi bi-info-circle"></i> Informasi Proyek</div>
    <table class="table table-bordered table-sm"><tbody>
      ${this.createReportRow('Nama Proyek',`<strong>${UtilityService.escapeHtml(project.name)}</strong>`)}
      ${this.createReportRow('Client / Owner',UtilityService.escapeHtml(project.client))}
      ${this.createReportRow('Lokasi Proyek',UtilityService.escapeHtml(project.location))}
      ${this.createReportRow('Penanggung Jawab (PIC)',UtilityService.escapeHtml(project.pic))}`;
    if(includeAllFields) {
      h+=`${this.createReportRow('Nilai Kontrak',UtilityService.formatCurrency(project.contract_value))}
      ${this.createReportRow('Tanggal Mulai',project.start_date?UtilityService.formatDate(project.start_date):'-')}
      ${this.createReportRow('Tanggal Selesai',project.end_date?UtilityService.formatDate(project.end_date):'-')}`;
    }
    h+=`</tbody></table>`;
    return h;
  },

  buildApprovalSection(preparedBy, reviewedBy, approvedBy) {
    return `<div class="report-section-title"><i class="bi bi-check2-square"></i> Lembar Pengesahan</div>
    <div class="row signature-row">
      <div class="col-4">
        <div class="signature-box">
          <div class="signature-box__label">Disusun Oleh</div>
          <div class="signature-box__name">${UtilityService.escapeHtml(preparedBy||'_________________')}</div>
        </div>
      </div>
      <div class="col-4">
        <div class="signature-box">
          <div class="signature-box__label">Diperiksa Oleh</div>
          <div class="signature-box__name">${UtilityService.escapeHtml(reviewedBy||'_________________')}</div>
        </div>
      </div>
      <div class="col-4">
        <div class="signature-box">
          <div class="signature-box__label">Disetujui Oleh</div>
          <div class="signature-box__name">${UtilityService.escapeHtml(approvedBy||'_________________')}</div>
        </div>
      </div>
    </div>`;
  },

  buildScheduleReport(projectId, company) {
    const project = projectId ? this._data.projects.find(p => p.id === projectId) : null;
    
    let scheduleData = [];
    if (projectId) {
      scheduleData = this._data.schedule.filter(s => s.project_id === projectId);
    } else {
      scheduleData = [...this._data.schedule];
    }

    scheduleData.sort((a, b) => {
      if (a.document_number !== b.document_number) {
        return (a.document_number || '').localeCompare(b.document_number || '');
      }
      return (parseInt(a.step_number) || 0) - (parseInt(b.step_number) || 0);
    });

    let html = '';
    html += this.buildReportHeader(company, 'JADWAL KERJA', 'bi-calendar-week');

    if (project) {
      html += this.buildProjectInfoSection(project, false);
    }

    html += `<div class="report-section-title"><i class="bi bi-bar-chart-steps"></i> Timeline Pekerjaan</div>`;

    if (scheduleData.length === 0) {
      html += `<div class="flow-guard-banner">
        <div class="flow-guard-banner__icon"><i class="bi bi-calendar-x"></i></div>
        <h5 class="flow-guard-banner__title">Belum Ada Data Jadwal</h5>
        <p class="flow-guard-banner__description">Silakan buat jadwal kerja melalui menu <strong>Jadwal Kerja</strong> terlebih dahulu.</p>
        <button class="btn btn--primary no-print" onclick="UIService.navigate('jadwal')">
          <i class="bi bi-calendar-week"></i> Buka Jadwal Kerja
        </button>
      </div>`;
    } else {
      html += this.buildGanttChart(scheduleData, project);
    }

    return html;
  },

  // ============================================================
  // GANTT CHART STYLE - PROFESSIONAL TIMELINE
  // ============================================================
  buildGanttChart(scheduleItems, project) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let allDates = [];
    scheduleItems.forEach(item => {
      if (item.start_date) allDates.push(new Date(item.start_date));
      if (item.end_date) allDates.push(new Date(item.end_date));
    });

    const currentYear = today.getFullYear();
    let chartStartDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date(currentYear, 0, 1);
    let chartEndDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date(currentYear, 11, 31);
    
    chartStartDate.setDate(chartStartDate.getDate() - 1);
    chartEndDate.setDate(chartEndDate.getDate() + 1);
    
    const totalDays = Math.ceil((chartEndDate - chartStartDate) / (1000 * 60 * 60 * 24)) + 1;
    
    const days = [];
    let currentDayDate = new Date(chartStartDate);
    while (currentDayDate <= chartEndDate) {
      const dayOfWeek = currentDayDate.getDay();
      days.push({
        date: new Date(currentDayDate),
        dayOfWeek: dayOfWeek,
        isSaturday: dayOfWeek === 6,
        isSunday: dayOfWeek === 0,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6
      });
      currentDayDate.setDate(currentDayDate.getDate() + 1);
    }
    
    const months = [];
    for (let d = new Date(chartStartDate); d <= chartEndDate; d.setMonth(d.getMonth() + 1)) {
      months.push({
        label: d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }),
        startDate: new Date(d.getFullYear(), d.getMonth(), 1),
        endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0)
      });
    }

    // Hitung lebar label kolom tahapan (sekarang termasuk tanggal)
    const maxLabelLength = Math.max(...scheduleItems.map(item => {
      const taskLabel = item.work_stage || item.work_process || 'Tahapan';
      let dateInfo = '';
      if (item.start_date && item.end_date) {
        const startLabel = new Date(item.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const endLabel = new Date(item.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        dateInfo = ` (${startLabel} — ${endLabel})`;
      }
      return (taskLabel + dateInfo).length;
    }), 15);
    const labelWidth = Math.max(250, Math.min(400, maxLabelLength * 8));

    let html = '';

    html += `
    <style id="ganttDynamicStyle">
      .gantt-wrapper {
        overflow-x: auto;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        margin-bottom: 16px;
        max-width: 100%;
      }
      .gantt-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.75rem;
        table-layout: fixed;
        min-width: 900px;
      }
      .gantt-table thead th {
        background: #f8fafc;
        padding: 8px 4px;
        border-bottom: 2px solid #e2e8f0;
        font-weight: 600;
        color: #475569;
        text-align: center;
        font-size: 0.68rem;
        white-space: nowrap;
        position: sticky;
        top: 0;
        z-index: 4;
      }
      .gantt-table thead th.gantt-label-header {
        text-align: left;
        padding: 8px 12px;
        position: sticky;
        left: 0;
        background: #f8fafc;
        z-index: 6;
        width: ${labelWidth}px;
        min-width: ${labelWidth}px;
        border-right: 1px solid #e2e8f0;
      }
      .gantt-table thead th.gantt-month-header {
        font-size: 0.7rem;
        font-weight: 600;
        color: #334155;
        border-right: 1px solid #e2e8f0;
      }
      .gantt-table tbody td {
        padding: 0;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
        height: 48px;
        position: relative;
      }
      .gantt-table tbody tr:nth-child(even) td {
        background: #fafbfc;
      }
      .gantt-table tbody tr:hover td {
        background: #f1f5f9;
      }
      .gantt-task-label {
        padding: 6px 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        border-right: 1px solid #e2e8f0;
        position: sticky;
        left: 0;
        background: #ffffff;
        z-index: 3;
      }
      .gantt-table tbody tr:nth-child(even) .gantt-task-label {
        background: #fafbfc;
      }
      .gantt-table tbody tr:hover .gantt-task-label {
        background: #f1f5f9;
      }
      .gantt-task-label__name {
        font-weight: 600;
        color: #1e293b;
        font-size: 0.78rem;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .gantt-task-label__date {
        font-size: 0.65rem;
        color: #64748b;
        font-weight: 500;
        margin-top: 1px;
      }
      .gantt-bar-cell {
        position: relative;
        border-right: none;
      }
      
      .gantt-weekend-line-saturday {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #fbbf24;
        z-index: 1;
        pointer-events: none;
        opacity: 0.7;
      }
      .gantt-weekend-line-sunday {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #ef4444;
        z-index: 1;
        pointer-events: none;
        opacity: 0.6;
      }
      
      .gantt-bar {
        position: absolute;
        top: 12px;
        height: 22px;
        border-radius: 11px;
        cursor: pointer;
        z-index: 2;
        display: flex;
        align-items: center;
        padding: 0 10px;
        font-size: 0.6rem;
        font-weight: 600;
        color: white;
        white-space: nowrap;
        text-shadow: 0 1px 1px rgba(0,0,0,0.15);
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        min-width: 24px;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: all 0.15s ease;
      }
      .gantt-bar:hover {
        box-shadow: 0 3px 8px rgba(0,0,0,0.2);
        z-index: 5;
        opacity: 1 !important;
      }
      .gantt-bar--done {
        background: #10b981;
        border: 1px solid #059669;
        opacity: 0.85;
      }
      .gantt-bar--active {
        background: #f59e0b;
        border: 1px solid #d97706;
        opacity: 0.9;
      }
      .gantt-bar--upcoming {
        background: #3b82f6;
        border: 1px solid #2563eb;
        opacity: 0.85;
      }
      .gantt-bar--no-date {
        background: #f1f5f9;
        border: 1px dashed #cbd5e1;
        color: #64748b;
        text-shadow: none;
        opacity: 0.8;
        cursor: default;
        justify-content: center;
        font-weight: 500;
      }
      .gantt-bar--no-date:hover {
        opacity: 1;
      }
      .gantt-today-line {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #ef4444;
        z-index: 6;
        pointer-events: none;
        opacity: 0.8;
      }
      .gantt-today-line::after {
        content: '';
        position: absolute;
        top: -2px;
        left: -4px;
        width: 10px;
        height: 10px;
        background: #ef4444;
        border-radius: 50%;
      }
      .gantt-legend {
        display: flex;
        gap: 16px;
        justify-content: center;
        margin-top: 12px;
        padding: 8px;
        background: #f8fafc;
        border-radius: 8px;
        font-size: 0.72rem;
        flex-wrap: wrap;
      }
      .gantt-legend__item {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #64748b;
      }
      .gantt-legend__color {
        width: 20px;
        height: 12px;
        border-radius: 6px;
        display: inline-block;
      }
      
      @media (max-width: 768px) {
        .gantt-table thead th.gantt-label-header {
          width: 180px;
          min-width: 180px;
        }
        .gantt-task-label {
          width: 180px;
          min-width: 180px;
          font-size: 0.7rem;
        }
        .gantt-task-label__name {
          font-size: 0.7rem;
        }
        .gantt-task-label__date {
          font-size: 0.6rem;
        }
        .gantt-bar {
          font-size: 0.55rem;
          padding: 0 6px;
          height: 18px;
          top: 14px;
        }
      }
      
      @media print {
        @page {
          size: A4 landscape;
          margin: 1cm 1.5cm;
        }
        
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          background: white !important;
        }
        
        body::before {
          display: none !important;
        }
        
        .app-sidebar,
        .sidebar-overlay,
        .user-info-bar,
        .hamburger-btn,
        .no-print,
        .btn,
        .tab-nav,
        .page-header,
        .page-header__filter,
        #reportTabs,
        .wizard__header,
        .wizard__footer,
        .step-pills,
        .nav-item,
        #navbarLoadingSpinner,
        .dropdown-menu,
        .modal-backdrop,
        .modal,
        .app-toast-container {
          display: none !important;
        }
        
        .app-main-content {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
        }
        
        .report-container {
          padding: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
        }
        
        .gantt-wrapper {
          overflow-x: visible !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: none !important;
          page-break-inside: avoid;
        }
        
        .gantt-table {
          font-size: 0.65rem !important;
          min-width: auto !important;
          width: 100% !important;
        }
        
        .gantt-table thead th {
          padding: 6px 2px !important;
          font-size: 0.6rem !important;
          background: #1e293b !important;
          color: #f1f5f9 !important;
          border-bottom: 2px solid #334155 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-table thead th.gantt-label-header {
          padding: 6px 8px !important;
          background: #1e293b !important;
          color: #f1f5f9 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-table thead th.gantt-month-header {
          background: #1e293b !important;
          color: #f1f5f9 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-table tbody td {
          height: 42px !important;
          background: white !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-task-label {
          padding: 4px 8px !important;
          font-size: 0.62rem !important;
          background: white !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-task-label__name {
          font-size: 0.62rem !important;
        }
        
        .gantt-task-label__date {
          font-size: 0.55rem !important;
        }
        
        .gantt-bar {
          height: 18px !important;
          top: 11px !important;
          font-size: 0.55rem !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-bar--done {
          background: #10b981 !important;
          border: 1px solid #059669 !important;
        }
        
        .gantt-bar--active {
          background: #f59e0b !important;
          border: 1px solid #d97706 !important;
        }
        
        .gantt-bar--upcoming {
          background: #3b82f6 !important;
          border: 1px solid #2563eb !important;
        }
        
        .gantt-bar--no-date {
          background: #f1f5f9 !important;
          border: 1px dashed #cbd5e1 !important;
          color: #64748b !important;
        }
        
        .gantt-weekend-line-saturday {
          background: #fbbf24 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-weekend-line-sunday {
          background: #ef4444 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-today-line {
          background: #ef4444 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .gantt-legend {
          font-size: 0.65rem !important;
          padding: 6px !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .card {
          border: 1px solid #e2e8f0 !important;
          box-shadow: none !important;
          break-inside: avoid;
          margin-bottom: 0.8rem !important;
        }
        
        .card-header {
          background: #1e293b !important;
          color: #f1f5f9 !important;
          border-bottom: 1px solid #334155 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          padding: 0.5rem 0.75rem !important;
        }
        
        .report-header {
          border-bottom: 2px solid #0f172a !important;
          margin-bottom: 1rem !important;
          padding-bottom: 0.5rem !important;
        }
        
        .report-section-title {
          font-size: 0.9rem !important;
          font-weight: 700 !important;
          color: #1e3a8a !important;
          border-bottom: 1px solid #e2e8f0 !important;
          padding-bottom: 0.25rem !important;
          margin: 0.8rem 0 0.5rem !important;
        }
        
        .report-stat-mini {
          border: 1px solid #e2e8f0 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .badge {
          padding: 2px 8px !important;
          font-weight: 600 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        
        .table th {
          background: #0f172a !important;
          color: #f1f5f9 !important;
          border: 1px solid #e2e8f0 !important;
          padding: 6px 8px !important;
          font-size: 0.7rem !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .table td {
          border: 1px solid #e2e8f0 !important;
          padding: 5px 8px !important;
          font-size: 0.7rem !important;
          background: #ffffff !important;
          color: #0f172a !important;
        }
        
        .table tbody tr:nth-child(even) td {
          background: #f8fafc !important;
        }
        
        .report-footer {
          display: none !important;
        }
        
        .signature-box {
          border: 1px solid #e2e8f0 !important;
          page-break-inside: avoid;
        }
        
        .flow-guard-banner {
          page-break-inside: avoid;
        }
        
        img { max-width: 100% !important; }
        a[href]:after { content: none !important; }
      }
    </style>

    <div class="gantt-wrapper">
      <table class="gantt-table">
        <thead>
          <tr>
            <th class="gantt-label-header" rowspan="2">Tahapan Pekerjaan</th>`;
    
    months.forEach(month => {
      const monthDays = days.filter(d => d.date >= month.startDate && d.date <= month.endDate);
      const colspan = monthDays.length;
      if (colspan > 0) {
        html += `<th class="gantt-month-header" colspan="${colspan}">${month.label}</th>`;
      }
    });
    
    html += `</tr></thead><tbody>`;

    scheduleItems.forEach((item, idx) => {
      const taskLabel = item.work_stage || item.work_process || 'Tahapan';
      
      // Siapkan info tanggal untuk label
      let dateDisplay = '';
      if (item.start_date && item.end_date) {
        const startLabel = new Date(item.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const endLabel = new Date(item.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        dateDisplay = `${startLabel} — ${endLabel}`;
      } else {
        dateDisplay = 'Belum dijadwalkan';
      }
      
      let barClass = 'gantt-bar--upcoming';
      if (item.start_date && item.end_date) {
        const start = new Date(item.start_date); start.setHours(0,0,0,0);
        const end = new Date(item.end_date); end.setHours(0,0,0,0);
        if (end < today) barClass = 'gantt-bar--done';
        else if (start <= today && end >= today) barClass = 'gantt-bar--active';
      } else {
        barClass = 'gantt-bar--no-date';
      }

      const itemStart = item.start_date ? new Date(item.start_date) : null;
      const itemEnd = item.end_date ? new Date(item.end_date) : null;
      
      if (itemStart) itemStart.setHours(0,0,0,0);
      if (itemEnd) itemEnd.setHours(0,0,0,0);
      
      const chartStart = new Date(chartStartDate); chartStart.setHours(0,0,0,0);
      
      let leftPercent = 0;
      let widthPercent = 0;
      let barLabel = '';
      
      if (itemStart && itemEnd) {
        const startOffset = Math.max(0, (itemStart - chartStart) / (1000 * 60 * 60 * 24));
        const duration = (itemEnd - itemStart) / (1000 * 60 * 60 * 24) + 1;
        
        leftPercent = (startOffset / totalDays) * 100;
        widthPercent = Math.max(2, (duration / totalDays) * 100);
        
        const startLabel = itemStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const endLabel = itemEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        barLabel = `${startLabel} — ${endLabel}`;
      } else {
        leftPercent = 5;
        widthPercent = 90;
        barLabel = 'Belum dijadwalkan';
      }

      html += `<tr>`;
      
      // KOLOM LABEL: Nama tahapan + tanggal di bawahnya
      html += `
        <td class="gantt-task-label" title="${UtilityService.escapeHtml(taskLabel)} — ${dateDisplay}">
          <div class="gantt-task-label__name">${idx + 1}. ${UtilityService.escapeHtml(taskLabel)}</div>
          <div class="gantt-task-label__date">${dateDisplay}</div>
        </td>`;

      html += `
        <td class="gantt-bar-cell" colspan="${days.length}" style="position:relative;">`;

      days.forEach((day, dayIdx) => {
        const dayLeftPercent = (dayIdx / totalDays) * 100;
        if (day.isSaturday) {
          html += `<div class="gantt-weekend-line-saturday" style="left:${dayLeftPercent}%;width:${(1/totalDays)*100}%;"></div>`;
        }
        if (day.isSunday) {
          html += `<div class="gantt-weekend-line-sunday" style="left:${dayLeftPercent}%;width:${(1/totalDays)*100}%;"></div>`;
        }
      });

      const todayOffset = (today - chartStart) / (1000 * 60 * 60 * 24);
      if (todayOffset >= 0 && todayOffset <= totalDays) {
        html += `<div class="gantt-today-line" style="left:${(todayOffset / totalDays) * 100}%;"></div>`;
      }

      html += `
          <div class="gantt-bar ${barClass}" 
               style="left:${leftPercent}%; width:${widthPercent}%;"
               title="${itemStart && itemEnd ? itemStart.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}) + ' — ' + itemEnd.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}) : 'Belum dijadwalkan'}">
            ${barLabel}
          </div>
        </td>`;

      html += `</tr>`;
    });

    html += `</tbody></table></div>

    <div class="gantt-legend no-print">
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#10b981;"></span> Selesai
      </div>
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#f59e0b;"></span> Berlangsung
      </div>
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#3b82f6;"></span> Mendatang
      </div>
      <div class="gantt-legend__item">
        <span class="gantt-legend__color" style="background:#f1f5f9; border:1px dashed #cbd5e1;"></span> Belum dijadwalkan
      </div>
      <div class="gantt-legend__item">
        <span style="display:inline-block;width:2px;height:12px;background:#fbbf24;border-radius:1px;"></span> Sabtu
      </div>
      <div class="gantt-legend__item">
        <span style="display:inline-block;width:2px;height:12px;background:#ef4444;border-radius:1px;"></span> Minggu
      </div>
      <div class="gantt-legend__item">
        <span style="display:inline-block;width:2px;height:12px;background:#ef4444;border-radius:1px;opacity:0.8;"></span> Hari ini
      </div>
    </div>
    </div>`;

    return html;
  },

  // ============================================================
  // JSA REPORT
  // ============================================================
  buildJSAReport(projectId, company) {
    let list=[...this._data.jsa];
    if(projectId) list=list.filter(j=>j.project_id===projectId);
    if(!list.length) return '<div class="alert alert-info">Tidak ada data JSA untuk filter yang dipilih.</div>';
    const permitLabels={hot_work:'🔥 Hot Work',confined_space:'🚧 Confined Space',working_height:'📐 Ketinggian',electrical:'⚡ Isolasi Listrik',lifting:'🏗️ Lifting',excavation:'⛏️ Excavation',pressure_test:'🔧 Pressure Test',radiation:'☢️ Radiasi'};
    const project = projectId ? this._data.projects.find(p=>p.id===projectId) : null;
    let html='';
    html+=this.buildReportHeader(company,'JOB SAFETY ANALYSIS','bi-journal-check');
    
    if (project) {
      html += this.buildProjectInfoSection(project, false);
    }
    
    list.forEach((jsa,index)=>{
      const proj=this._data.projects.find(p=>p.id===jsa.project_id);
      if(index>0) html+=`<hr style="border:2px dashed var(--color-border);margin:24px 0;">`;
      html+=`<div class="page-break-inside-avoid">`;
      
      html+=`<div class="report-section-title"><i class="bi bi-file-text"></i> Detail Dokumen JSA</div>`;
      html+=`<table class="table table-bordered table-sm"><tbody>
        ${this.createReportRow('No. Dokumen JSA',`<strong>${UtilityService.escapeHtml(jsa.document_number)}</strong>`)}
        ${this.createReportRow('Revisi',UtilityService.escapeHtml(jsa.revision||'0'))}
        ${this.createReportRow('Tanggal Pembuatan',UtilityService.formatDate(jsa.date))}
      </tbody></table>`;
      
      const apdItems=[...((jsa.ppe?.selected_items)||[]),...((jsa.ppe?.custom_items)||[]).filter(Boolean)];
      html+=`<div class="report-section-title"><i class="bi bi-shield-check"></i> 1. Alat Pelindung Diri (APD)</div>
      <div class="mb-3">${apdItems.length?apdItems.map(i=>`<span class="badge bg-light text-dark me-1 mb-1">${UtilityService.escapeHtml(i)}</span>`).join(''):'<span class="text-muted">Tidak ada APD yang dipilih</span>'}</div>`;
      
      const hazards=jsa.hazard_identification||[];
      html+=`<div class="report-section-title"><i class="bi bi-exclamation-triangle"></i> 2. Identifikasi Bahaya & Pengendalian Risiko</div>
      <table class="table table-bordered table-sm"><thead><tr><th class="col-width-40">No</th><th>Tahapan Pekerjaan</th><th>Potensi Bahaya</th><th>Dampak</th><th>Pengendalian Risiko</th></tr></thead><tbody>`;
      if(hazards.length) hazards.forEach((h,i)=>{ html+=`<tr><td class="text-center">${i+1}</td><td>${UtilityService.escapeHtml(h.step||'-')}</td><td>${UtilityService.escapeHtml(h.danger||'-')}</td><td>${UtilityService.escapeHtml(h.impact||'-')}</td><td>${UtilityService.escapeHtml(h.control||'-')}</td>`; });
      else html+=`<tr><td colspan="5" class="text-center text-muted">Tidak ada data identifikasi bahaya</td></tr>`;
      html+=`</tbody></table>`;
      
      let sn=3;
      const em=jsa.emergency||{};
      if(em.type||em.procedure||em.assembly_point||em.emergency_number){ 
        html+=`<div class="report-section-title"><i class="bi bi-exclamation-octagon"></i> ${sn}. Prosedur Tanggap Darurat</div>
        <table class="table table-bordered table-sm"><tbody>
          ${this.createReportRow('Jenis Keadaan Darurat',UtilityService.escapeHtml(em.type||'-'))}
          ${this.createReportRow('Prosedur Penanganan',UtilityService.escapeHtml(em.procedure||'-'))}
          ${this.createReportRow('Titik Kumpul',UtilityService.escapeHtml(em.assembly_point||'-'))}
          ${this.createReportRow('Nomor Telepon Darurat',UtilityService.escapeHtml(em.emergency_number||'-'))}
        </tbody></table>`; sn++; 
      }
      
      const activePermits=Object.entries(jsa.permits||{}).filter(([,v])=>v===true).map(([k])=>permitLabels[k]||k);
      if(activePermits.length){ 
        html+=`<div class="report-section-title"><i class="bi bi-patch-check"></i> ${sn}. Permit to Work yang Diperlukan</div>
        <div class="mb-3">${activePermits.map(p=>`<span class="badge bg-warning text-dark me-1 mb-1">${UtilityService.escapeHtml(p)}</span>`).join('')}</div>`; sn++; 
      }
      
      html+=this.buildApprovalSection(jsa.prepared_by, jsa.reviewed_by, jsa.approved_by);
      html+=`</div>`;
    });
    return html;
  },

  // ============================================================
  // WORK METHOD REPORT
  // ============================================================
  buildWMReport(projectId, company) {
    let list=[...this._data.wm];
    if(projectId) list=list.filter(w=>w.project_id===projectId);
    if(!list.length) return '<div class="alert alert-info">Tidak ada data Metode Kerja untuk filter yang dipilih.</div>';
    const project = projectId ? this._data.projects.find(p=>p.id===projectId) : null;
    let html='';
    html+=this.buildReportHeader(company,'METODE KERJA','bi-diagram-3');
    
    if (project) {
      html += this.buildProjectInfoSection(project, false);
    }
    
    list.forEach((wm,index)=>{
      const proj=this._data.projects.find(p=>p.id===wm.project_id);
      if(index>0) html+=`<hr style="border:2px dashed var(--color-border);margin:24px 0;">`;
      html+=`<div class="page-break-inside-avoid">`;
      
      html+=`<div class="report-section-title"><i class="bi bi-file-text"></i> Detail Dokumen Metode Kerja</div>`;
      html+=`<table class="table table-bordered table-sm"><tbody>
        ${this.createReportRow('No. Dokumen',`<strong>${UtilityService.escapeHtml(wm.document_number)}</strong>`)}
        ${this.createReportRow('Revisi',UtilityService.escapeHtml(wm.revision||'0'))}
        ${this.createReportRow('Tanggal Pembuatan',UtilityService.formatDate(wm.date))}
      </tbody></table>`;
      
      const steps=wm.work_steps||[];
      html+=`<div class="report-section-title"><i class="bi bi-list-ol"></i> 1. Uraian Langkah Kerja</div>
      <table class="table table-bordered table-sm"><thead><tr><th class="col-width-40">No</th><th>Tahapan Kerja</th><th>Alat Kerja</th><th>Proses / Kegiatan Pekerjaan</th></tr></thead><tbody>`;
      if(steps.length) steps.forEach((s,i)=>{ html+=`<tr><td class="text-center">${i+1}</td><td>${UtilityService.escapeHtml(s.work_stage||'-')}</td><td>${UtilityService.escapeHtml(s.tools||'-')}</td><td>${UtilityService.escapeHtml(s.work_process||'-')}</td>`; });
      else html+=`<tr><td colspan="4" class="text-center text-muted">Tidak ada langkah kerja</td></tr>`;
      html+=`</tbody></table>`;
      
      html+=this.buildApprovalSection(wm.prepared_by, wm.reviewed_by, wm.approved_by);
      html+=`</div>`;
    });
    return html;
  },

  // ============================================================
  // COST PROJECT REPORT
  // ============================================================
  buildPOReport(projectId, company) {
    let list=[...this._data.po];
    if(projectId) list=list.filter(p=>p.project_id===projectId);
    if(!list.length) return '<div class="alert alert-info">Tidak ada data Pembelian untuk filter yang dipilih.</div>';
    const project=projectId?this._data.projects.find(p=>p.id===projectId):null;
    const grandTotal=list.reduce((s,p)=>s+(p.total_price||0),0);
    let html='';
    html+=this.buildReportHeader(company,'COST PROJECT','bi-cart');
    
    if(project) {
      html+=this.buildProjectInfoSection(project, true);
    }
    
    html+=`<div class="report-section-title"><i class="bi bi-cart-check"></i> Daftar Item Pembelian</div>
    <table class="table table-bordered table-sm"><thead><tr>
      <th class="col-width-30">No</th>
      <th>Nama Material</th>
      <th>Spesifikasi</th>
      <th>Toko / Supplier</th>
      <th class="col-width-50">Qty</th>
      <th class="col-width-50">Unit</th>
      <th class="col-width-100">Harga Satuan</th>
      <th class="col-width-100">Total Harga</th>
      <th class="col-width-90">Tanggal</th>
    </tr></thead><tbody>`;
    
    list.forEach((po,i)=>{ 
      html+=`<tr>
        <td class="text-center">${i+1}</td>
        <td><strong>${UtilityService.escapeHtml(po.material_name||'-')}</strong></td>
        <td>${UtilityService.escapeHtml(po.specification||'-')}</td>
        <td>${UtilityService.escapeHtml(po.supplier||'-')}</td>
        <td class="text-center">${po.quantity||0}</td>
        <td class="text-center">${UtilityService.escapeHtml(po.unit||'-')}</td>
        <td class="text-end">${UtilityService.formatCurrency(po.unit_price)}</td>
        <td class="text-end"><strong>${UtilityService.formatCurrency(po.total_price)}</strong></td>
        <td class="text-center">${UtilityService.formatDate(po.date)}</td>
      </tr>`; 
    });
    
    html+=`</tbody><tfoot><tr class="fw-bold" style="background:#f0f9ff;">
      <td colspan="7" class="text-end">TOTAL KESELURUHAN:</td>
      <td class="text-end"><strong class="text-success">${UtilityService.formatCurrency(grandTotal)}</strong></td>
      <td></td>
    </tr></tfoot></table>`;
    
    html+=`<div class="report-summary-box"><div class="row">
      <div class="col-6"><strong>Total Item:</strong> ${list.length}</div>
      <div class="col-6 text-end"><strong>Grand Total:</strong> <span class="text-success" style="font-size:1.1rem;">${UtilityService.formatCurrency(grandTotal)}</span></div>
    </div></div>`;

    let projects=[...this._data.projects];
    if(projectId) projects=projects.filter(p=>p.id===projectId);
    
    if(projects.length) {
      let totalBudget=0, totalSpent=0;

      html += `<div class="page-break"></div>`;
      html += `<div class="report-section-title"><i class="bi bi-cash-stack"></i> Keuangan Proyek</div>`;

      projects.forEach((project, index) => {
        const poList = this._data.po.filter(p => p.project_id === project.id);
        const totalPO = poList.reduce((s, p) => s + (p.total_price || 0), 0);
        const budget = project.contract_value || 0;
        const remaining = budget - totalPO;
        const pct = budget > 0 ? Math.round((totalPO / budget) * 100) : (totalPO > 0 ? 100 : 0);
        const pctDisplay = budget > 0 ? `${pct}%` : (totalPO > 0 ? 'Melebihi Anggaran' : '0%');
        totalBudget += budget;
        totalSpent += totalPO;

        if (index > 0) html += `<hr style="border:2px dashed var(--color-border);margin:24px 0;">`;
        html += `<div class="page-break-inside-avoid">`;
        html += `<h5 class="text-primary mb-3"><i class="bi bi-building"></i> ${UtilityService.escapeHtml(project.name)}</h5>`;
        html += `<div class="row g-3 mb-3">
              <div class="col-4">
                <div class="report-finance-card report-finance-card--info">
                  <div class="report-finance-card__label">Nilai Kontrak</div>
                  <div class="report-finance-card__value">${UtilityService.formatCurrency(budget)}</div>
                </div>
              </div>
              <div class="col-4">
                <div class="report-finance-card report-finance-card--warning">
                  <div class="report-finance-card__label">Total Pembelian</div>
                  <div class="report-finance-card__value">${UtilityService.formatCurrency(totalPO)}</div>
                </div>
              </div>
              <div class="col-4">
                <div class="report-finance-card ${remaining >= 0 ? 'report-finance-card--success' : 'report-finance-card--danger'}">
                  <div class="report-finance-card__label">Sisa Anggaran</div>
                  <div class="report-finance-card__value">${UtilityService.formatCurrency(remaining)}</div>
                </div>
              </div>
            </div>`;
        html += `<div class="progress progress--md mb-3">
              <div class="progress-bar" style="width:${Math.max(3, Math.min(pct, 100))}%;background:${pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981'};min-width:40px;">
                <strong>${pctDisplay}</strong>
              </div>
            </div>`;
        html += `<table class="table table-bordered table-sm"><tbody>
              ${this.createReportRow('Nama Proyek', `<strong>${UtilityService.escapeHtml(project.name)}</strong>`)}
              ${this.createReportRow('Client', UtilityService.escapeHtml(project.client))}
              ${this.createReportRow('Nilai Kontrak', UtilityService.formatCurrency(budget))}
              ${this.createReportRow('Total Pengeluaran', UtilityService.formatCurrency(totalPO))}
              ${this.createReportRow('Persentase Penggunaan', pctDisplay)}
              ${this.createReportRow('Sisa Anggaran', `<strong class="${remaining >= 0 ? 'text-success' : 'text-danger'}">${UtilityService.formatCurrency(remaining)}</strong>`)}
            </tbody></table>`;
        html += `</div>`;
      });

      if (!projectId && projects.length > 1) {
        const totalRem = totalBudget - totalSpent;
        const totalPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : (totalSpent > 0 ? 100 : 0);
        const totalPctDisplay = totalBudget > 0 ? `${totalPct}%` : (totalSpent > 0 ? 'Melebihi Anggaran' : '0%');
        html += `<div class="page-break-inside-avoid">
              <div class="report-section-title"><i class="bi bi-pie-chart"></i> Rekapitulasi Seluruh Proyek</div>
              <div class="row g-3 mb-3">
                <div class="col-4">
                  <div class="report-finance-card report-finance-card--info">
                    <div class="report-finance-card__label">Total Nilai Kontrak</div>
                    <div class="report-finance-card__value" style="font-size:1.1rem;">${UtilityService.formatCurrency(totalBudget)}</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="report-finance-card report-finance-card--warning">
                    <div class="report-finance-card__label">Total Pembelian</div>
                    <div class="report-finance-card__value" style="font-size:1.1rem;">${UtilityService.formatCurrency(totalSpent)}</div>
                  </div>
                </div>
                <div class="col-4">
                  <div class="report-finance-card ${totalRem >= 0 ? 'report-finance-card--success' : 'report-finance-card--danger'}">
                    <div class="report-finance-card__label">Sisa Total Anggaran</div>
                    <div class="report-finance-card__value" style="font-size:1.1rem;">${UtilityService.formatCurrency(totalRem)}</div>
                  </div>
                </div>
              </div>
              <div class="progress progress--md mb-3">
                <div class="progress-bar" style="width:${Math.max(3, Math.min(totalPct, 100))}%;background:${totalPct > 80 ? '#ef4444' : totalPct > 50 ? '#f59e0b' : '#10b981'};min-width:40px;">
                  <strong>${totalPctDisplay}</strong>
                </div>
              </div>
            </div>`;
      }
    }

    return html;
  },

  // ============================================================
  // MANPOWER REPORT
  // ============================================================
  buildManpowerReport(projectId, company) {
    const E = UtilityService.escapeHtml.bind(UtilityService);
    const fmtDate = UtilityService.formatDate.bind(UtilityService);

    function calcAge(birthDate) {
      if (!birthDate) return '-';
      const dob = new Date(birthDate);
      if (isNaN(dob)) return '-';
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
      return age + ' thn';
    }

    let projects = [...this._data.projects];
    if (projectId) projects = projects.filter(p => p.id === projectId);
    if (!projects.length) return '<div class="alert alert-info">Tidak ada data Proyek untuk filter yang dipilih.</div>';

    const personnelMap = {};
    this._data.personnel.forEach(p => { personnelMap[p.id] = p; });

    const assignByProject = {};
    this._data.manpower.forEach(m => {
      if (!assignByProject[m.project_id]) assignByProject[m.project_id] = [];
      assignByProject[m.project_id].push(m.personnel_id);
    });

    let html = '';
    html += this.buildReportHeader(company, 'MAN POWER', 'bi-people');

    projects.forEach((project, index) => {
      const pIds     = assignByProject[project.id] || [];
      const workers  = pIds.map(id => personnelMap[id]).filter(Boolean);
      
      if (index > 0) html += '<hr style="border:2px dashed var(--color-border);margin:24px 0;">';
      html += '<div class="page-break-inside-avoid">';
      
      html += this.buildProjectInfoSection(project, false);

      if (!workers.length) {
        html += '<div class="alert alert-warning"><i class="bi bi-person-x"></i> Belum ada personel yang ditugaskan untuk proyek ini.</div>';
      } else {
        html += `<div class="report-section-title"><i class="bi bi-people-fill"></i> Daftar Personel</div>`;
        html += '<table class="table table-bordered table-sm">'
          + '<thead><tr>'
          + '<th class="col-width-40 text-center">No</th>'
          + '<th>Nama Lengkap</th>'
          + '<th>NIK</th>'
          + '<th>Tanggal Lahir</th>'
          + '<th class="col-width-60 text-center">Umur</th>'
          + '<th>Jabatan</th>'
          + '<th>Alamat</th>'
          + '</tr></thead><tbody>';
        workers.forEach((w, i) => {
          html += '<tr>'
            + '<td class="text-center">' + (i+1) + '</td>'
            + '<td><strong>' + E(w.name) + '</strong></td>'
            + '<td style="font-family:monospace;">' + E(w.nik||'—') + '</td>'
            + '<td>' + (w.birth_date ? fmtDate(w.birth_date) : '—') + '</td>'
            + '<td class="text-center"><span class="badge bg-info text-dark">' + calcAge(w.birth_date) + '</span></td>'
            + '<td>' + E(w.position||'-') + '</td>'
            + '<td>' + E(w.address||'—') + '</td>'
            + '</tr>';
        });
        html += '</tbody></table>';
        html += '<div class="report-summary-box"><div class="row">'
          + '<div class="col-6"><strong>Total Personel:</strong> ' + workers.length + ' orang</div>'
          + '<div class="col-6 text-end"><strong>Tanggal Cetak:</strong> '
          + fmtDate(new Date().toISOString()) + '</div>'
          + '</div></div>';
      }
      html += '</div>';
    });

    if (!projectId && projects.length > 1) {
      const totalWorkers = new Set(
        Object.values(assignByProject).flat()
      ).size;
      html += '<hr style="border:2px solid var(--color-border);margin:24px 0;">';
      html += '<div class="page-break-inside-avoid">';
      html += '<div class="report-section-title"><i class="bi bi-pie-chart"></i> Rekapitulasi Man Power</div>';
      html += '<table class="table table-bordered table-sm"><thead><tr>'
        + '<th class="col-width-40">No</th><th>Nama Proyek</th>'
        + '<th class="text-center col-width-80">Jml Personel</th>'
        + '</tr></thead><tbody>';
      projects.forEach((project, i) => {
        const cnt = (assignByProject[project.id]||[]).length;
        html += '<tr><td class="text-center">' + (i+1) + '</td>'
          + '<td>' + E(project.name) + '</td>'
          + '<td class="text-center"><strong>' + cnt + '</strong></td></tr>';
      });
      html += '</tbody><tfoot><tr class="fw-bold" style="background:#f0f9ff;">'
        + '<td colspan="2" class="text-end">Total Personel Unik:</td>'
        + '<td class="text-center">' + totalWorkers + '</td>'
        + '</tr></tfoot></table>';
      html += '</div>';
    }

    return html;
  }
};