// download.js — Fitur Download PDF untuk Laporan

const DownloadPage = {
  _selectedProjectId: null,
  _data: null,
  _currentModal: null,

  render() {
    return `
      <div class="page-header no-print">
        <h2 class="page-title">
          <span class="page-title__icon"><i class="bi bi-building-gear"></i></span>
          KPT Project Management Portal
        </h2>
      </div>
      
      <div class="card">
        <div class="card-header">
          <i class="bi bi-download"></i> Download PDF Laporan
        </div>
        <div class="card-body">
          <div class="flow-guard-banner">
            <div class="flow-guard-banner__icon">
              <i class="bi bi-file-earmark-pdf" style="color: var(--color-danger);"></i>
            </div>
            <h5 class="flow-guard-banner__title">Download Dokumen dalam Format PDF</h5>
            <p class="flow-guard-banner__description">
              Unduh dokumen proyek dalam format PDF siap cetak. Pilih proyek terlebih dahulu, 
              lalu pilih jenis dokumen yang ingin diunduh.
            </p>
            <button class="btn btn--primary" onclick="DownloadPage.showProjectModal()">
              <i class="bi bi-building"></i> Pilih Proyek
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Pilih Proyek -->
      <div class="modal fade" id="downloadProjectModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-building"></i> Pilih Proyek untuk Download PDF
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" onclick="DownloadPage.closeModal('downloadProjectModal')"></button>
            </div>
            <div class="modal-body">
              <div id="projectListContainer">
                <div class="text-center py-4">
                  <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Memuat...</span>
                  </div>
                  <p class="mt-2 text-muted">Memuat daftar proyek...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Pilih Dokumen -->
      <div class="modal fade" id="downloadDocModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="downloadDocTitle">
                <i class="bi bi-file-earmark-pdf"></i> Pilih Dokumen untuk Diunduh
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" onclick="DownloadPage.closeModal('downloadDocModal')"></button>
            </div>
            <div class="modal-body">
              <div id="selectedProjectInfo" class="mb-4 p-3" style="background: var(--color-bg); border-radius: var(--radius-md);">
                <div class="d-flex align-items-center gap-2">
                  <i class="bi bi-building text-primary" style="font-size: 1.2rem;"></i>
                  <div>
                    <div class="fw-semibold" id="docModalProjectName">-</div>
                    <div class="text-muted" style="font-size: 0.78rem;" id="docModalProjectDetail">-</div>
                  </div>
                </div>
              </div>
              
              <div id="documentListContainer">
                <div class="text-center py-4">
                  <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Memuat...</span>
                  </div>
                  <p class="mt-2 text-muted">Memuat daftar dokumen...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Preview PDF -->
      <div class="modal fade" id="downloadPreviewModal" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="downloadPreviewTitle">
                <i class="bi bi-file-earmark-pdf"></i> Preview & Download PDF
              </h5>
              <div>
                <button type="button" class="btn btn--primary btn-sm me-2" onclick="DownloadPage.downloadCurrentPDF()">
                  <i class="bi bi-download"></i> Download PDF
                </button>
                <button type="button" class="btn-close" data-bs-dismiss="modal" onclick="DownloadPage.closeModal('downloadPreviewModal')"></button>
              </div>
            </div>
            <div class="modal-body p-0" id="downloadPreviewContent" style="min-height: 70vh;">
              <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Memuat...</span>
                </div>
                <p class="mt-2 text-muted">Menyiapkan pratinjau dokumen...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async init() {
    this._selectedProjectId = null;
    this._data = null;
  },

  // ============================================================
  // MODAL MANAGEMENT
  // ============================================================
  closeModal(modalId) {
    const modalEl = document.getElementById(modalId);
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) {
        modal.hide();
        // Bersihkan backdrop jika masih ada
        setTimeout(() => {
          const backdrops = document.querySelectorAll('.modal-backdrop');
          backdrops.forEach(b => b.remove());
          document.body.classList.remove('modal-open');
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
        }, 200);
      }
    }
  },

  async showProjectModal() {
    const modalEl = document.getElementById('downloadProjectModal');
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    });
    modal.show();

    try {
      const projects = await DataAccess.getAllProjects();
      
      const container = document.getElementById('projectListContainer');
      if (!container) return;

      if (!projects || projects.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon"><i class="bi bi-clipboard-x"></i></div>
            <p>Tidak ada proyek yang tersedia</p>
            <button class="btn btn--primary" onclick="UIService.navigate('proyek'); DownloadPage.closeModal('downloadProjectModal');">
              <i class="bi bi-plus-lg"></i> Buat Proyek Baru
            </button>
          </div>`;
        return;
      }

      projects.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

      container.innerHTML = `
        <div class="table-responsive">
          <table class="table table--hover mb-0">
            <thead>
              <tr>
                <th class="col-width-40">No</th>
                <th>Nama Proyek</th>
                <th>Client</th>
                <th>Lokasi</th>
                <th class="text-center col-width-100">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${projects.map((p, i) => `
                <tr>
                  <td class="text-center text-muted">${i + 1}</td>
                  <td><strong>${UtilityService.escapeHtml(p.name)}</strong></td>
                  <td>${UtilityService.escapeHtml(p.client || '-')}</td>
                  <td>${UtilityService.escapeHtml(p.location || '-')}</td>
                  <td class="text-center">
                    <button class="btn btn--primary btn--xs" onclick="DownloadPage.selectProject('${p.id}')">
                      <i class="bi bi-check-lg"></i> Pilih
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="text-muted mt-3" style="font-size: 0.78rem;">
          <i class="bi bi-info-circle"></i> Klik <strong>Pilih</strong> pada proyek untuk melanjutkan ke pemilihan dokumen.
        </div>`;
    } catch (err) {
      AppError.handle(err, 'Memuat daftar proyek untuk download');
      const container = document.getElementById('projectListContainer');
      if (container) {
        container.innerHTML = `
          <div class="alert alert-danger">
            <i class="bi bi-exclamation-triangle"></i> Gagal memuat daftar proyek. Silakan coba lagi.
          </div>`;
      }
    }
  },

  async selectProject(projectId) {
    this.closeModal('downloadProjectModal');
    this._selectedProjectId = projectId;

    // Tampilkan modal pemilihan dokumen
    const docModalEl = document.getElementById('downloadDocModal');
    if (!docModalEl) return;

    const docModal = new bootstrap.Modal(docModalEl, {
      backdrop: 'static',
      keyboard: false
    });
    docModal.show();

    // Tampilkan info proyek
    try {
      const project = await DataAccess.getProjectById(projectId);
      if (project) {
        document.getElementById('docModalProjectName').textContent = project.name || '-';
        document.getElementById('docModalProjectDetail').textContent = 
          `${project.client ? 'Client: ' + project.client + ' | ' : ''}${project.location || ''}`;
      }

      // Load data untuk menghitung jumlah dokumen
      const [jsaList, wmList, scheduleList, poList, manpowerList] = await Promise.all([
        DataAccess.getJSAByProject(projectId),
        DataAccess.getWorkMethodsByProject(projectId),
        DataAccess.getScheduleByProject(projectId),
        DataAccess.getPOByProject(projectId),
        DataAccess.getManpowerByProject(projectId)
      ]);

      // Load personnel untuk manpower
      const personnelList = await DataAccess.getAllPersonnel();
      const personnelMap = {};
      personnelList.forEach(p => { personnelMap[p.id] = p; });
      const personnelInProject = manpowerList
        .map(m => personnelMap[m.personnel_id])
        .filter(Boolean);

      const docTypes = [
        {
          id: 'jsa',
          icon: 'bi-journal-check',
          color: 'amber',
          title: 'JSA (Job Safety Analysis)',
          description: 'Analisis Keselamatan Kerja',
          count: jsaList.length,
          data: jsaList
        },
        {
          id: 'wm',
          icon: 'bi-diagram-3',
          color: 'indigo',
          title: 'Metode Kerja',
          description: 'Prosedur dan Langkah Kerja',
          count: wmList.length,
          data: wmList
        },
        {
          id: 'schedule',
          icon: 'bi-calendar-week',
          color: 'cyan',
          title: 'Jadwal Kerja',
          description: 'Timeline dan Gantt Chart',
          count: scheduleList.length,
          data: scheduleList
        },
        {
          id: 'manpower',
          icon: 'bi-people',
          color: 'green',
          title: 'Man Power',
          description: 'Daftar Personel yang Ditugaskan',
          count: personnelInProject.length,
          data: personnelInProject
        },
        {
          id: 'po',
          icon: 'bi-cart',
          color: 'red',
          title: 'Cost Project',
          description: 'Laporan Biaya dan Pembelian',
          count: poList.length,
          data: poList
        }
      ];

      const container = document.getElementById('documentListContainer');
      if (!container) return;

      const colorMap = {
        amber: { bg: '#fffbeb', border: '#f59e0b', icon: '#f59e0b', badge: 'bg-warning text-dark' },
        indigo: { bg: '#eef2ff', border: '#6366f1', icon: '#6366f1', badge: 'bg-indigo' },
        cyan: { bg: '#ecfeff', border: '#06b6d4', icon: '#06b6d4', badge: 'bg-info' },
        green: { bg: '#f0fdf4', border: '#16a34a', icon: '#16a34a', badge: 'bg-success' },
        red: { bg: '#fff1f2', border: '#e11d48', icon: '#e11d48', badge: 'bg-danger' }
      };

      container.innerHTML = `
        <div class="apd-category-grid">
          ${docTypes.map(doc => {
            const colors = colorMap[doc.color] || colorMap.amber;
            const isAvailable = doc.count > 0;
            
            return `
              <div class="apd-category" style="cursor: ${isAvailable ? 'pointer' : 'default'}; opacity: ${isAvailable ? '1' : '0.6'};"
                   ${isAvailable ? `onclick="DownloadPage.previewDocument('${doc.id}', '${projectId}')"` : ''}>
                <div class="apd-category__header">
                  <div class="apd-category__icon" style="color: ${colors.icon};">
                    <i class="bi ${doc.icon}"></i>
                  </div>
                  <div class="apd-category__title">${doc.title}</div>
                  <span class="badge ${colors.badge} ms-auto">${doc.count} dokumen</span>
                </div>
                <div style="padding: 0.5rem 1rem 1rem 1rem;">
                  <p class="text-muted" style="font-size: 0.82rem; margin: 0;">
                    <i class="bi ${doc.icon} me-1"></i>
                    ${doc.description}
                  </p>
                  ${isAvailable ? `
                    <button class="btn btn--primary btn-sm mt-2 w-100">
                      <i class="bi bi-eye"></i> Preview & Download
                    </button>
                  ` : `
                    <button class="btn btn--outline-secondary btn-sm mt-2 w-100" disabled>
                      <i class="bi bi-x-circle"></i> Belum Tersedia
                    </button>
                  `}
                </div>
              </div>`;
          }).join('')}
        </div>

        <div class="text-muted mt-3" style="font-size: 0.78rem;">
          <i class="bi bi-info-circle"></i> Klik pada jenis dokumen untuk melihat pratinjau dan mengunduh PDF.
        </div>`;
    } catch (err) {
      AppError.handle(err, 'Memuat data dokumen untuk download');
    }
  },

  async previewDocument(docType, projectId) {
    this.closeModal('downloadDocModal');

    const previewModalEl = document.getElementById('downloadPreviewModal');
    if (!previewModalEl) return;

    const previewModal = new bootstrap.Modal(previewModalEl, {
      backdrop: 'static',
      keyboard: false,
      size: 'xl'
    });
    previewModal.show();

    const contentEl = document.getElementById('downloadPreviewContent');
    const titleEl = document.getElementById('downloadPreviewTitle');
    if (!contentEl || !titleEl) return;

    try {
      // Load data yang dibutuhkan
      const [company, project, allProjects] = await Promise.all([
        DataAccess.getCompany(),
        DataAccess.getProjectById(projectId),
        DataAccess.getAllProjects()
      ]);

      // Set title modal
      const docLabels = {
        jsa: 'JSA (Job Safety Analysis)',
        wm: 'Metode Kerja',
        schedule: 'Jadwal Kerja',
        manpower: 'Man Power',
        po: 'Cost Project'
      };
      titleEl.innerHTML = `<i class="bi bi-file-earmark-pdf"></i> Preview: ${docLabels[docType] || docType} — ${UtilityService.escapeHtml(project?.name || '')}`;

      // Load data spesifik
      let reportData = { projects: allProjects, jsa: [], wm: [], po: [], personnel: [], manpower: [], company, schedule: [] };

      if (docType === 'jsa') {
        reportData.jsa = await DataAccess.getJSAByProject(projectId);
      } else if (docType === 'wm') {
        reportData.wm = await DataAccess.getWorkMethodsByProject(projectId);
      } else if (docType === 'schedule') {
        reportData.wm = await DataAccess.getWorkMethodsByProject(projectId);
        reportData.schedule = await DataAccess.getScheduleByProject(projectId);
      } else if (docType === 'manpower') {
        reportData.personnel = await DataAccess.getAllPersonnel();
        reportData.manpower = await DataAccess.getManpowerByProject(projectId);
      } else if (docType === 'po') {
        reportData.po = await DataAccess.getPOByProject(projectId);
      }

      // Gunakan ReportPage untuk generate konten
      const tempReportPage = { ...ReportPage, _data: reportData };
      let reportHTML = '';

      // Set selectReportProject value sementara
      const selEl = document.getElementById('selectReportProject');
      if (selEl) selEl.value = projectId;

      switch (docType) {
        case 'jsa':
          reportHTML = tempReportPage.buildJSAReport(projectId, company);
          break;
        case 'wm':
          reportHTML = tempReportPage.buildWMReport(projectId, company);
          break;
        case 'schedule':
          reportHTML = tempReportPage.buildScheduleReport(projectId, company);
          break;
        case 'manpower':
          reportHTML = tempReportPage.buildManpowerReport(projectId, company);
          break;
        case 'po':
          reportHTML = tempReportPage.buildPOReport(projectId, company);
          break;
        default:
          reportHTML = '<div class="alert alert-info">Dokumen tidak tersedia.</div>';
      }

      // Wrap dengan container untuk print
      contentEl.innerHTML = `
        <div class="report-container" id="printableContent">
          ${reportHTML}
        </div>
        <div class="text-center py-3 no-print" style="background: var(--color-bg); border-top: 1px solid var(--color-border);">
          <button class="btn btn--primary" onclick="DownloadPage.downloadCurrentPDF()">
            <i class="bi bi-download"></i> Download PDF
          </button>
          <button class="btn btn--outline-secondary ms-2" onclick="DownloadPage.closeModal('downloadPreviewModal')">
            <i class="bi bi-x-lg"></i> Tutup
          </button>
        </div>
        <style>
          @media print {
            body * { visibility: hidden; }
            #downloadPreviewContent, #downloadPreviewContent * { visibility: visible; }
            #downloadPreviewContent { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
            .modal-backdrop { display: none !important; }
            .modal { position: absolute !important; }
          }
        </style>`;

      // Simpan reference untuk download
      this._currentReportData = {
        docType,
        projectId,
        project,
        company,
        reportHTML
      };

    } catch (err) {
      AppError.handle(err, 'Memuat pratinjau dokumen');
      if (contentEl) {
        contentEl.innerHTML = `
          <div class="text-center py-5">
            <i class="bi bi-exclamation-triangle text-danger" style="font-size: 3rem;"></i>
            <p class="mt-2">Gagal memuat pratinjau dokumen.</p>
            <button class="btn btn--primary" onclick="DownloadPage.closeModal('downloadPreviewModal')">
              <i class="bi bi-x-lg"></i> Tutup
            </button>
          </div>`;
      }
    }
  },

  downloadCurrentPDF() {
    const contentEl = document.getElementById('printableContent');
    if (!contentEl) {
      UIService.showToast('Tidak ada konten untuk diunduh.', 'warning');
      return;
    }

    // Buat window baru untuk print
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      UIService.showToast('Pop-up diblokir. Izinkan pop-up untuk mendownload PDF.', 'warning');
      return;
    }

    const docType = this._currentReportData?.docType || 'dokumen';
    const projectName = this._currentReportData?.project?.name || 'Proyek';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${docType.toUpperCase()} - ${projectName}</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
        <link href="style.css" rel="stylesheet">
        <style>
          @page {
            size: A4;
            margin: 1.5cm 2cm;
          }
          body {
            background: white !important;
            font-size: 11pt !important;
          }
          body::before { display: none !important; }
          .report-container {
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${contentEl.outerHTML}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 1000);
            }, 500);
          };
        <\/script>
      </body>
      </html>
    `);

    printWindow.document.close();
    UIService.showToast('Membuka jendela cetak... Simpan sebagai PDF melalui dialog cetak.', 'info');
  }
};

// Export ke global scope
window.DownloadPage = DownloadPage;