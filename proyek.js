// proyek.js — ES6 Module
import { ROUTES, TOAST, ERR } from './constants.js';
import { DataAccess } from './db.js';
import { AppError } from './error-handler.js';
import { UtilityService, UIService } from './main.js';

const ProjectPage = {
  _tableClickHandler: null,
  _cardClickHandler: null,

  render() {
    return `
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
        <button class="btn btn--primary" onclick="ProjectPage.showProjectForm()"><i class="bi bi-plus-lg"></i>Proyek Baru</button>
      </div>
    <div id="projectFormCard" class="card" style="display:none;">
      <div class="card-header" id="formCardTitle"><i class="bi bi-plus-circle"></i> Tambah Proyek Baru</div>
      <div class="card-body">
        <form id="projectForm" onsubmit="return false;">
          <input type="hidden" id="inputProjectId">
          <div class="row g-3">
            <div class="col-12">
              <label class="form-label">Nama Proyek <span class="text-danger">*</span></label>
              <input type="text" class="form-control" id="inputProjectName" required placeholder="Pembangunan Gedung A">
            </div>
            <div class="col-sm-6"><label class="form-label">Client / Perusahaan</label><input type="text" class="form-control" id="inputProjectClient"></div>
            <div class="col-sm-6"><label class="form-label">Lokasi / Alamat</label><input type="text" class="form-control" id="inputProjectLocation"></div>
            <div class="col-sm-4"><label class="form-label">PIC</label><input type="text" class="form-control" id="inputProjectPic"></div>
            <div class="col-sm-4"><label class="form-label">Tgl Mulai</label><input type="date" class="form-control" id="inputProjectStartDate"></div>
            <div class="col-sm-4"><label class="form-label">Tgl Selesai</label><input type="date" class="form-control" id="inputProjectEndDate"></div>
            <div class="col-sm-3"><label class="form-label">Nilai Proyek</label><input type="number" class="form-control" id="inputProjectContractValue"></div>
          </div>
          <div class="d-flex justify-content-end gap-2 mt-4">
            <button type="button" class="btn btn--outline-secondary" onclick="ProjectPage.hideProjectForm()">Batal</button>
            <button type="button" class="btn btn--primary" onclick="ProjectPage.saveProject()"><i class="bi bi-save"></i> Simpan</button>
          </div>
        </form>
      </div>
    </div>
    <div id="projectTableContainer">
      <div class="card d-none d-md-block">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table--hover mb-0">
              <thead><tr><th>Nama Proyek</th><th>Client</th><th>Lokasi</th><th>Pelaksanaan</th><th>Nilai Proyek</th><th class="text-center">Aksi</th></tr></thead>
              <tbody id="projectTableBody"><tr><td colspan="6" class="text-center py-4">Memuat…</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="projectCardList" class="d-md-none"></div>
    </div>`;
  },

  async init() {
    this._attachDelegatedListeners();
    await this.loadProjectTable();
  },

  // ============================================================
  // EVENT DELEGATION — Pasang listener SEKALI pada parent statis
  // ============================================================
  _attachDelegatedListeners() {
    const tableContainer = document.getElementById('projectTableContainer');
    if (tableContainer) {
      // Hapus listener lama (jika ada) untuk mencegah duplikasi
      if (this._tableClickHandler) {
        tableContainer.removeEventListener('click', this._tableClickHandler);
      }
      this._tableClickHandler = async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit') await ProjectPage.editProject(id);
        if (action === 'delete') await ProjectPage.deleteProject(id);
      };
      tableContainer.addEventListener('click', this._tableClickHandler);
    }
  },

  async loadProjectTable() {
    try {
      let projects = await DataAccess.getAllProjects();
      projects = [...projects].reverse();

      const tableBody = document.getElementById('projectTableBody');
      if (tableBody) {
        if (!projects.length) {
          tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-5"><div class="empty-state"><div class="empty-state__icon"><i class="bi bi-clipboard-x"></i></div><p>Tidak ada proyek ditemukan</p></div></td></tr>`;
        } else {
          tableBody.innerHTML = projects.map(p => {
            const clientDisplay = p.client || '';
            const picDisplay = p.pic || '';
            const combinedClient = clientDisplay && picDisplay
              ? `${UtilityService.escapeHtml(clientDisplay)} (PIC: ${UtilityService.escapeHtml(picDisplay)})`
              : UtilityService.escapeHtml(clientDisplay || picDisplay || '-');
            const startDate = p.start_date ? UtilityService.formatDate(p.start_date) : '?';
            const endDate = p.end_date ? UtilityService.formatDate(p.end_date) : '?';
            const periodDisplay = `${startDate} — ${endDate}`;

            return `<tr>
              <td><strong>${UtilityService.escapeHtml(p.name)}</strong></td>
              <td>${combinedClient}</td>
              <td>${UtilityService.escapeHtml(p.location||'-')}</td>
              <td style="font-size:.78rem;">${periodDisplay}</td>
              <td>${UtilityService.formatCurrency(p.contract_value)}</td>
              <td class="text-center">
                <button class="btn btn--xs btn--outline-warning me-1" data-action="edit" data-id="${p.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn--xs btn--outline-danger" data-action="delete" data-id="${p.id}"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`;
          }).join('');
          // TIDAK perlu cloneNode lagi — listener sudah terpasang di parent
        }
      }

      const cardList = document.getElementById('projectCardList');
      if (cardList) {
        if (!projects.length) {
          cardList.innerHTML = '<div class="empty-state"><div class="empty-state__icon"><i class="bi bi-clipboard-x"></i></div><p>Tidak ada proyek ditemukan</p></div>';
        } else {
          cardList.innerHTML = projects.map(p => {
            const clientDisplay = p.client || '';
            const picDisplay = p.pic || '';
            const combinedClient = clientDisplay && picDisplay
              ? `${UtilityService.escapeHtml(clientDisplay)} (PIC: ${UtilityService.escapeHtml(picDisplay)})`
              : UtilityService.escapeHtml(clientDisplay || picDisplay || '-');
            const startDate = p.start_date ? UtilityService.formatDate(p.start_date) : '?';
            const endDate = p.end_date ? UtilityService.formatDate(p.end_date) : '?';
            const periodDisplay = `${startDate} — ${endDate}`;

            return `<div class="card"><div class="card-body py-3">
              <div class="fw-bold" style="font-size:.9rem;">${UtilityService.escapeHtml(p.name)}</div>
              <div class="text-muted" style="font-size:.76rem;">${combinedClient}</div>
              <div class="text-muted" style="font-size:.72rem;"><i class="bi bi-calendar"></i> ${periodDisplay}</div>
              <div class="text-success fw-semibold" style="font-size:.76rem;">${UtilityService.formatCurrency(p.contract_value)}</div>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn--xs btn--outline-warning" data-action="edit" data-id="${p.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn--xs btn--outline-danger ms-auto" data-action="delete" data-id="${p.id}"><i class="bi bi-trash"></i></button>
              </div>
            </div></div>`;
          }).join('');
          // TIDAK perlu cloneNode lagi — listener sudah terpasang di parent
        }
      }
    } catch (err) {
      AppError.handle(err, 'Memuat daftar proyek');
    }
  },

  showProjectForm(data = null) {
    const formCard = document.getElementById('projectFormCard');
    const tableContainer = document.getElementById('projectTableContainer');
    if (tableContainer) tableContainer.style.display = 'none';

    document.getElementById('inputProjectId').value = '';
    if (data) {
      document.getElementById('formCardTitle').innerHTML = '<i class="bi bi-pencil-square"></i> Edit Proyek';
      document.getElementById('inputProjectId').value = data.id;
      document.getElementById('inputProjectName').value = data.name || '';
      document.getElementById('inputProjectClient').value = data.client || '';
      document.getElementById('inputProjectLocation').value = data.location || '';
      document.getElementById('inputProjectPic').value = data.pic || '';
      document.getElementById('inputProjectStartDate').value = UtilityService.toDateInput(data.start_date);
      document.getElementById('inputProjectEndDate').value = UtilityService.toDateInput(data.end_date);
      document.getElementById('inputProjectContractValue').value = data.contract_value || '';
    } else {
      document.getElementById('formCardTitle').innerHTML = '<i class="bi bi-plus-circle"></i> Tambah Proyek Baru';
      ['inputProjectName','inputProjectClient','inputProjectLocation','inputProjectPic','inputProjectStartDate','inputProjectEndDate','inputProjectContractValue']
        .forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    }
    formCard.style.display = 'block';
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  hideProjectForm() {
    document.getElementById('projectFormCard').style.display = 'none';
    const tableContainer = document.getElementById('projectTableContainer');
    if (tableContainer) tableContainer.style.display = 'block';
  },

  async editProject(id) {
    const p = await DataAccess.getProjectById(id);
    if (p) this.showProjectForm(p);
  },

  async saveProject() {
    const name = document.getElementById('inputProjectName').value.trim();
    if (!name) { UIService.showToast(ERR.REQUIRED_FIELD('Nama proyek'), TOAST.WARNING); return; }
    const startDate = document.getElementById('inputProjectStartDate').value;
    const endDate = document.getElementById('inputProjectEndDate').value;
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      UIService.showToast('Tanggal mulai tidak boleh lebih besar dari tanggal selesai!', TOAST.WARNING); return;
    }
    const existingId = document.getElementById('inputProjectId').value;
    const isNew = !existingId;
    const data = {
      id: existingId || ('proj_' + Date.now()),
      name,
      client: document.getElementById('inputProjectClient').value.trim(),
      location: document.getElementById('inputProjectLocation').value.trim(),
      pic: document.getElementById('inputProjectPic').value.trim(),
      start_date: startDate,
      end_date: endDate,
      contract_value: parseFloat(document.getElementById('inputProjectContractValue').value) || 0
    };
    try {
      await DataAccess.saveProject(data);
      this.hideProjectForm();
      await this.loadProjectTable();
      UIService.invalidateGuardCache();
      UIService.showToast('Proyek berhasil disimpan!', TOAST.SUCCESS);
      if (isNew) {
        const all = await DataAccess.getAllProjects();
        if (all.length === 1) setTimeout(() => UIService.showToast('Proyek dibuat! Sekarang buat Metode Kerja, JSA, atau input Man Power.', TOAST.INFO), 800);
      }
    } catch (err) { AppError.handle(err, 'Menyimpan proyek'); }
  },

  async deleteProject(id) {
    let p;
    try { p = await DataAccess.getProjectById(id); }
    catch (err) { AppError.handle(err, 'Memuat proyek'); return; }
    if (!p) return;
    UtilityService.showConfirmDialog(
      `Hapus proyek "${p.name}"? Semua data terkait juga akan dihapus.`,
      async () => {
        try {
          await DataAccess.deleteProject(id);
          await this.loadProjectTable();
          UIService.showToast('Proyek beserta data terkait dihapus.', TOAST.WARNING);
        } catch (err) { AppError.handle(err, 'Menghapus proyek'); }
      }
    );
  }
};
export { ProjectPage };