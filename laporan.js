// laporan.js — Report Page (async Google Sheets) - UPDATED with Lazy Loading Gantt Chart
import { StorageService, DataAccess } from './db.js';
import { AppError } from './error-handler.js';
import { UtilityService, UIService } from './main.js';

const ReportPage = {
  _currentReportType: 'jsa',
  _loadedTabs: new Set(),
  _data: { projects:[], jsa:[], wm:[], po:[], personnel:[], manpower:[], company:null, schedule:[] },
  _ganttRenderer: null, // Cache untuk Gantt Renderer yang di-load secara lazy

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
    this._ganttRenderer = null; // Reset Gantt renderer cache

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

  async printReport() {
    // Jika tab Jadwal aktif, pastikan Gantt sudah selesai render
    if (this._currentReportType === 'schedule') {
      const container = document.getElementById('ganttChartContainer');
      const isLoading = container?.querySelector('.skeleton-loading');
      if (isLoading) {
        UIService.showToast('Mohon tunggu, Timeline sedang dimuat...', 'info');
        // Polling hingga skeleton hilang atau timeout 8 detik
        await new Promise(resolve => {
          const start = Date.now();
          const check = () => {
            const stillLoading = document.getElementById('ganttChartContainer')?.querySelector('.skeleton-loading');
            if (!stillLoading || Date.now() - start > 8000) return resolve();
            requestAnimationFrame(check);
          };
          check();
        });
        // Beri waktu browser satu frame untuk paint final
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Tunggu semua gambar (logo) selesai load
    const images = document.querySelectorAll('#reportOutput img, .report-header img');
    await Promise.allSettled(
      Array.from(images).map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
      )
    );

    window.print();
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

    const isSchedule = this._currentReportType === 'schedule';
    let html = `<div class="report-container${isSchedule ? ' report-container--landscape' : ''}">`;
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

  /**
   * Membangun header laporan.
   * Menggunakan tabel dengan <thead> agar header OTOMATIS BERULANG di setiap halaman cetak.
   * Semua build*Report harus diawali dengan buildReportHeader() dan
   * diakhiri dengan buildReportFooter() agar struktur tabel tertutup dengan benar.
   */
  buildReportHeader(company, title, titleIcon='bi-file-earmark-pdf') {
    const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    let headerInner;
    if (!company) {
      headerInner = `
        <div class="report-header__layout">
          <div class="report-header__left">
            <div class="report-header__company-info">
              <div class="report-header__doc-type"><i class="bi ${titleIcon}"></i> ${UtilityService.escapeHtml(title)}</div>
            </div>
          </div>
          <div class="report-header__right">
            <div class="report-header__date">Dicetak: ${printDate}</div>
          </div>
        </div>`;
    } else {
      headerInner = `
        <div class="report-header__layout">
          <div class="report-header__left">
            <div class="report-header__logo-section"><img src="logo.png" alt="Logo" style="width:100%;height:100%"></div>
            <div class="report-header__company-info">
              <div class="report-header__company-name">${UtilityService.escapeHtml(company.name)}</div>
              ${company.address ? `<div class="report-header__company-detail">${UtilityService.escapeHtml(company.address)}</div>` : ''}
              <div class="report-header__company-contact">
                ${company.contact ? `<span><i class="bi bi-telephone"></i> ${UtilityService.escapeHtml(company.contact)}</span>` : ''}
                ${company.email   ? `<span><i class="bi bi-envelope"></i> ${UtilityService.escapeHtml(company.email)}</span>` : ''}
                ${company.website ? `<span><i class="bi bi-globe"></i> ${UtilityService.escapeHtml(company.website)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="report-header__right">
            <div class="report-header__doc-type">${UtilityService.escapeHtml(title)}</div>
            <div class="report-header__date">Dicetak: ${printDate}</div>
          </div>
        </div>`;
    }

    // Tabel pembungkus: <thead> berisi header → browser mengulanginya di setiap halaman cetak
    // <tbody> dibuka di sini dan DITUTUP oleh buildReportFooter()
    return `
      <table class="report-page-table">
        <thead>
          <tr>
            <th>
              <div class="report-header">${headerInner}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr><td>`;
  },

  /** Menutup struktur tabel yang dibuka oleh buildReportHeader() */
  buildReportFooter() {
    return `</td></tr></tbody></table>`;
  },

  buildProjectInfoSection(project, includeAllFields=true) {
    if(!project) return '';
    let h=`<div class="report-section-title"><i></i>Informasi Proyek</div>
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

    html += `<div class="report-section-title"><i></i>Timeline Schedule</div>`;

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
      // Tampilkan skeleton Gantt dulu, lalu render async
      html += `<div id="ganttChartContainer" class="gantt-print-landscape">
        <div class="skeleton-loading">
          <div class="text-center mb-4">
            <div class="page-loading-spinner" style="margin: 0 auto 1rem;"></div>
            <h5 style="color: #64748b;"><i class="bi bi-bar-chart-steps"></i> Memuat Timeline...</h5>
          </div>
          <div class="skeleton-card">
            <div class="skeleton-line w-75"></div>
            <div class="skeleton-line w-50"></div>
            <div class="skeleton-line w-100"></div>
            <div class="skeleton-line w-100"></div>
          </div>
        </div>
      </div>`;

      // Render Gantt chart secara asynchronous setelah DOM selesai
      setTimeout(async () => {
        try {
          const ganttHTML = await this.buildGanttChart(scheduleData, project);
          const container = document.getElementById('ganttChartContainer');
          if (container) {
            container.innerHTML = ganttHTML;
          }
        } catch (err) {
          console.error('[ReportPage] Gagal render Gantt:', err);
          const container = document.getElementById('ganttChartContainer');
          if (container) {
            container.innerHTML = '<div class="alert alert-danger">Gagal memuat Timeline Chart</div>';
          }
        }
      }, 50);
    }

    return html + this.buildReportFooter();
  },

  // ============================================================
  // GANTT CHART - LAZY LOADING IMPLEMENTATION
  // ============================================================
  async buildGanttChart(scheduleItems, project) {
    // Dynamic import sub-module Gantt saat pertama kali dibutuhkan
    if (!this._ganttRenderer) {
      try {
        console.log('[ReportPage] Loading Gantt renderer module...');
        const module = await import('./gantt-renderer.js');
        this._ganttRenderer = module.GanttRenderer;
        console.log('[ReportPage] Gantt renderer loaded successfully');
      } catch (err) {
        console.error('[ReportPage] Gagal memuat Gantt renderer:', err);
        return `<div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle-fill"></i> 
          Gagal memuat komponen Gantt Chart. Silakan muat ulang halaman.
          <p class="mt-2"><small class="text-muted">Error: ${UtilityService.escapeHtml(err.message)}</small></p>
        </div>`;
      }
    }
    return this._ganttRenderer.render(scheduleItems, project);
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
      html+=`<div class="report-doc-block">`;

      // Header dokumen (nomor, APD) — dilindungi dari page-break
      html+=`<div class="report-doc-block__header">`;
      html+=`<div class="report-section-title"><i></i>Detail Dokumen JSA</div>`;
      html+=`<table class="table table-bordered table-sm"><tbody>
        ${this.createReportRow('No. Dokumen JSA',`<strong>${UtilityService.escapeHtml(jsa.document_number)}</strong>`)}
        ${this.createReportRow('Revisi',UtilityService.escapeHtml(jsa.revision||'0'))}
        ${this.createReportRow('Tanggal Pembuatan',UtilityService.formatDate(jsa.date))}
      </tbody></table>`;
      
      const apdItems=[...((jsa.ppe?.selected_items)||[]),...((jsa.ppe?.custom_items)||[]).filter(Boolean)];
      html+=`<div class="report-section-title"><i></i>1. Alat Pelindung Diri (APD)</div>
      <div class="mb-3">${apdItems.length?apdItems.map(i=>`<span class="badge bg-primary text-white me-1 mb-1">${UtilityService.escapeHtml(i)}</span>`).join(''):'<span class="text-muted">Tidak ada APD yang dipilih</span>'}</div>`;
      html+=`</div>`; // tutup report-doc-block__header

      // Tabel bahaya — bebas mengalir antar halaman
      const hazards=jsa.hazard_identification||[];
      html+=`<div class="report-section-title"><i></i> 2. Identifikasi Bahaya & Pengendalian Risiko</div>
      <table class="table table-bordered table-sm table--data-flow"><thead><tr><th class="col-width-40">No</th><th>Tahapan Pekerjaan</th><th>Potensi Bahaya</th><th>Dampak</th><th>Pengendalian Risiko</th></tr></thead><tbody>`;
      if(hazards.length) hazards.forEach((h,i)=>{ html+=`<tr><td class="text-center">${i+1}</td><td>${UtilityService.escapeHtml(h.step||'-')}</td><td>${UtilityService.escapeHtml(h.danger||'-')}</td><td>${UtilityService.escapeHtml(h.impact||'-')}</td><td>${UtilityService.escapeHtml(h.control||'-')}</td></tr>`; });
      else html+=`<tr><td colspan="5" class="text-center text-muted">Tidak ada data identifikasi bahaya</td></tr>`;
      html+=`</tbody></table>`;
      
      let sn=3;
      const em=jsa.emergency||{};
      if(em.type||em.procedure||em.assembly_point||em.emergency_number){ 
        html+=`<div class="report-section-title"><i></i> ${sn}. Prosedur Tanggap Darurat</div>
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
      html+=`</div>`; // tutup report-doc-block
    });
    return html + this.buildReportFooter();
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
      html+=`<div class="report-doc-block">`;

      // Header dokumen — dilindungi dari page-break
      html+=`<div class="report-doc-block__header">`;
      html+=`<div class="report-section-title"><i></i>Detail Dokumen Metode Kerja</div>`;
      html+=`<table class="table table-bordered table-sm"><tbody>
        ${this.createReportRow('No. Dokumen',`<strong>${UtilityService.escapeHtml(wm.document_number)}</strong>`)}
        ${this.createReportRow('Revisi',UtilityService.escapeHtml(wm.revision||'0'))}
        ${this.createReportRow('Tanggal Pembuatan',UtilityService.formatDate(wm.date))}
      </tbody></table>`;
      html+=`</div>`; // tutup report-doc-block__header

      // Tabel langkah kerja — bebas mengalir antar halaman
      const steps=wm.work_steps||[];
      html+=`<div class="report-section-title"><i class="bi bi-list-ol"></i> 1. Uraian Langkah Kerja</div>
      <table class="table table-bordered table-sm table--data-flow"><thead><tr><th class="col-width-40">No</th><th>Tahapan Kerja</th><th>Alat Kerja</th><th>Proses / Kegiatan Pekerjaan</th></tr></thead><tbody>`;
      if(steps.length) steps.forEach((s,i)=>{ html+=`<tr><td class="text-center">${i+1}</td><td>${UtilityService.escapeHtml(s.work_stage||'-')}</td><td>${UtilityService.escapeHtml(s.tools||'-')}</td><td>${UtilityService.escapeHtml(s.work_process||'-')}</td></tr>`; });
      else html+=`<tr><td colspan="4" class="text-center text-muted">Tidak ada langkah kerja</td></tr>`;
      html+=`</tbody></table>`;
      
      html+=this.buildApprovalSection(wm.prepared_by, wm.reviewed_by, wm.approved_by);
      html+=`</div>`; // tutup report-doc-block
    });
    return html + this.buildReportFooter();
  },

  // ============================================================
  // COST PROJECT REPORT (DIPERBAIKI - Tanpa Tabel Detail Keuangan)
  // ============================================================
  buildPOReport(projectId, company) {
    let list=[...this._data.po];
    if(projectId) list=list.filter(p=>p.project_id===projectId);
    
    const project=projectId?this._data.projects.find(p=>p.id===projectId):null;
    
    let html='';
    html+=this.buildReportHeader(company,'COST PROJECT','bi-cart');
    
    if(project) {
      html+=this.buildProjectInfoSection(project, true);
    }

    if(!list.length) {
      html+=`<div class="flow-guard-banner">
        <div class="flow-guard-banner__icon"><i class="bi bi-cart-x"></i></div>
        <h5 class="flow-guard-banner__title">Belum Ada Data Pembelian</h5>
        <p class="flow-guard-banner__description">Silakan tambahkan item pembelian melalui menu <strong>Cost Project</strong> terlebih dahulu.</p>
        <button class="btn btn--primary no-print" onclick="UIService.navigate('pembelian')">
          <i class="bi bi-cart"></i> Buka Cost Project
        </button>
      </div>`;
    } else {
      const grandTotal=list.reduce((s,p)=>s+(p.total_price||0),0);
      
      html+=`<div class="report-section-title"><i class="bi bi-cart-check"></i> Daftar Item Pembelian</div>
      <table class="table table-bordered table-sm"><thead><tr>
        <th class="col-width-30">No</th>
        <th>Nama Material</th>
        <th>Spesifikasi</th>
        <th>Toko / Supplier</th>
        <th class="col-width-70 text-center">Qty / Unit</th>
        <th class="col-width-100">Harga Satuan</th>
        <th class="col-width-100">Total Harga</th>
        <th class="col-width-80 no-print">Tanggal</th>
      </tr></thead><tbody>`;
      
      list.forEach((po,i)=>{ 
        html+=`<tr>
          <td class="text-center">${i+1}</td>
          <td><strong>${UtilityService.escapeHtml(po.material_name||'-')}</strong></td>
          <td>${UtilityService.escapeHtml(po.specification||'-')}</td>
          <td>${UtilityService.escapeHtml(po.supplier||'-')}</td>
          <td class="text-center">${po.quantity||0} ${UtilityService.escapeHtml(po.unit||'')}</td>
          <td class="text-end">${UtilityService.formatCurrency(po.unit_price)}</td>
          <td class="text-end"><strong>${UtilityService.formatCurrency(po.total_price)}</strong></td>
          <td class="text-center no-print">${UtilityService.formatDate(po.date)}</td>
        </tr>`; 
      });
      
      html+=`</tbody><tfoot><tr class="fw-bold" style="background:#f0f9ff;">
        <td colspan="6" class="text-end">TOTAL KESELURUHAN:</td>
        <td class="text-end"><strong class="text-success">${UtilityService.formatCurrency(grandTotal)}</strong></td>
        <td class="no-print"></td>
      </tr></tfoot></table>`;
      
      html+=`<div class="report-summary-box"><div class="row">
        <div class="col-6"><strong>Total Item:</strong> ${list.length}</div>
        <div class="col-6 text-end"><strong>Grand Total:</strong> <span class="text-success" style="font-size:1.1rem;">${UtilityService.formatCurrency(grandTotal)}</span></div>
      </div></div>`;
    }

    // ============================================================
    // RINGKASAN KEUANGAN PROYEK (HANYA Kartu + Progress Bar)
    // ============================================================
    if(project) {
      const budget = project.contract_value || 0;
      const totalPO = list.reduce((s, p) => s + (p.total_price || 0), 0);
      const remaining = budget - totalPO;
      const pct = budget > 0 ? Math.round((totalPO / budget) * 100) : (totalPO > 0 ? 100 : 0);
      const pctDisplay = budget > 0 ? `${pct}%` : (totalPO > 0 ? 'Melebihi Anggaran' : '0%');

      html += `<div class="page-break"></div>`;
      html += `<div class="page-break-inside-avoid">`;
      html += `<div class="report-section-title"><i class="bi bi-cash-stack"></i> Ringkasan Keuangan Proyek</div>`;
      
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
      
      html += `</div>`;
    }
    
    return html + this.buildReportFooter();
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
        html += `<div class="report-section-title"><i></i>Daftar Personel</div>`;
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
      html += '<div class="report-section-title"><i></i>Rekapitulasi Man Power</div>';
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

    return html + this.buildReportFooter();
  }
};

// Export untuk dynamic import
export { ReportPage };