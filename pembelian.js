// pembelian.js — ES6 Module — Procurement & Operational Cost
import { ROUTES, TOAST, ERR, SHEETS } from './constants.js';
import { DB, DataAccess } from './db.js';
import { AppError } from './error-handler.js';
import { UtilityService, UIService } from './main.js';

// Kategori untuk Cost Operasional
const OPERATIONAL_CATEGORIES = [
  { value: 'labor', label: '🧑‍🔧 Tenaga Kerja', icon: 'bi-people' },
  { value: 'equipment', label: '🏗️ Peralatan', icon: 'bi-tools' },
  { value: 'transport', label: '🚛 Transportasi', icon: 'bi-truck' },
  { value: 'accommodation', label: '🏠 Akomodasi', icon: 'bi-house' },
  { value: 'administration', label: '📋 Administrasi', icon: 'bi-file-text' },
  { value: 'communication', label: '📱 Komunikasi', icon: 'bi-phone' },
  { value: 'safety', label: '🩺 K3 & Keamanan', icon: 'bi-shield-check' },
  { value: 'other', label: '📦 Lain-lain', icon: 'bi-box' }
];

const ProcurementPage = {
  _cachedProjects: [],
  _currentProjectId: null,
  _currentTab: 'material', // 'material' or 'operational'
  
  // Material items
  _pendingItems: [],
  _editedItems: {},
  
  // Operational items
  _pendingOperational: [],
  _editedOperational: {},
  
  _listClickHandler: null,
  _inlineChangeHandler: null,

  render() {
    return `
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
        <div class="page-header__filter">
          <select class="form-select" id="selectFilterPOProject" onchange="ProcurementPage.onProjectChange()">
            <option value="">Semua Proyek</option>
          </select>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn--primary" onclick="ProcurementPage.queueAddItem()" id="btnAddItem" style="display:none;">
            <i class="bi bi-plus-lg"></i> Tambah
          </button>
          <button class="btn btn--success" onclick="ProcurementPage.saveAllItems()" id="btnSaveAll" style="display:none;">
            <i class="bi bi-save"></i> Simpan Data (<span id="btnSaveCount">0</span>)
          </button>
          <button class="btn btn--outline-info" onclick="ProcurementPage.loadData()" id="btnRefresh">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>

      <!-- TABS -->
      <div class="tab-nav no-print mb-3" id="costTabNav">
        <button class="tab-nav__btn tab-nav__btn--active" onclick="ProcurementPage.switchTab('material')">
          <i class="bi bi-box-seam"></i> Material & Pembelian
        </button>
        <button class="tab-nav__btn" onclick="ProcurementPage.switchTab('operational')">
          <i class="bi bi-calculator-fill"></i> Cost Operasional
        </button>
      </div>

      <!-- TAB MATERIAL -->
      <div id="tabMaterial">
        <div id="procurementListView">
          <div id="poTableContainer">
            <div class="card">
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table--hover mb-0" id="poMainTable">
                    <thead>
                      <tr>
                        <th class="col-width-40">No</th>
                        <th>Tanggal</th>
                        <th>Toko/Supplier</th>
                        <th>Nama Material</th>
                        <th>Spesifikasi</th>
                        <th class="col-width-80">Qty</th>
                        <th class="col-width-80">Unit</th>
                        <th class="col-width-130">Harga Satuan</th>
                        <th class="col-width-130">Total</th>
                        <th class="col-width-80">Aksi</th>
                      </tr>
                    </thead>
                    <tbody id="poTableBody">
                      <tr><td colspan="10" class="text-center py-4 text-muted">Pilih proyek terlebih dahulu</td></tr>
                    </tbody>
                    <tfoot id="poTableFoot" style="display:none;">
                      <tr class="fw-bold" style="background:#f0f9ff;">
                        <td colspan="8" class="text-end">TOTAL MATERIAL:</td>
                        <td class="text-end" id="poGrandTotalCell">Rp 0</td>
                        <td></td>
                       </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB OPERATIONAL -->
      <div id="tabOperational" style="display:none;">
        <div id="operationalListView">
          <div id="opTableContainer">
            <div class="card">
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table--hover mb-0" id="opMainTable">
                    <thead>
                      <tr>
                        <th class="col-width-40">No</th>
                        <th>Tanggal</th>
                        <th>Kategori</th>
                        <th>Deskripsi</th>
                        <th class="col-width-80">Qty</th>
                        <th class="col-width-80">Unit</th>
                        <th class="col-width-130">Harga Satuan</th>
                        <th class="col-width-130">Total</th>
                        <th class="col-width-100">Catatan</th>
                        <th class="col-width-80">Aksi</th>
                      </tr>
                    </thead>
                    <tbody id="opTableBody">
                      <tr><td colspan="10" class="text-center py-4 text-muted">Pilih proyek terlebih dahulu</td></tr>
                    </tbody>
                    <tfoot id="opTableFoot" style="display:none;">
                      <tr class="fw-bold" style="background:#f0f9ff;">
                        <td colspan="8" class="text-end">TOTAL OPERASIONAL:</td>
                        <td class="text-end" id="opGrandTotalCell">Rp 0</td>
                        <td></td>
                       </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RINGKASAN KEUANGAN (TERPISAH) -->
      <div id="financialSummaryContainer" class="mt-4" style="display:none;">
        <div class="card">
          <div class="card-header bg-primary text-white">
            <i class="bi bi-cash-stack"></i> Ringkasan Keuangan Proyek
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4">
                <div class="report-finance-card report-finance-card--info text-center">
                  <div class="report-finance-card__label">Nilai Kontrak</div>
                  <div class="report-finance-card__value" id="summaryContractValue">Rp 0</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="report-finance-card report-finance-card--warning text-center">
                  <div class="report-finance-card__label">Total Material</div>
                  <div class="report-finance-card__value" id="summaryTotalMaterial">Rp 0</div>
                </div>
              </div>
              <div class="col-md-4">
                <div class="report-finance-card report-finance-card--warning text-center">
                  <div class="report-finance-card__label">Total Operasional</div>
                  <div class="report-finance-card__value" id="summaryTotalOperational">Rp 0</div>
                </div>
              </div>
            </div>
            <div class="row g-3 mt-2">
              <div class="col-md-6">
                <div class="report-finance-card report-finance-card--success text-center">
                  <div class="report-finance-card__label">Total Pengeluaran</div>
                  <div class="report-finance-card__value" id="summaryTotalExpense">Rp 0</div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="report-finance-card" id="summaryRemainingCard">
                  <div class="report-finance-card__label">Sisa Anggaran</div>
                  <div class="report-finance-card__value" id="summaryRemaining">Rp 0</div>
                </div>
              </div>
            </div>
            <div class="mt-3">
              <div class="progress" style="height: 25px;">
                <div class="progress-bar" id="summaryProgressBar" style="width:0%; background: #10b981;">
                  <strong id="summaryProgressPercent">0%</strong>
                </div>
              </div>
              <p class="text-muted text-center mt-2 small">
                <i class="bi bi-info-circle"></i> Persentase penggunaan anggaran
              </p>
            </div>
          </div>
        </div>
      </div>

      <div id="poStatusBar" class="mt-2" style="display:none;">
        <div class="flow-alert flow-alert--warning">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <span id="poStatusText">Ada perubahan yang belum disimpan.</span>
        </div>
      </div>
    `;
  },

  async init() {
    this._pendingItems = [];
    this._pendingOperational = [];
    this._editedItems = {};
    this._editedOperational = {};
    this._currentProjectId = null;
    this._cachedProjects = await DataAccess.getAllProjects();
    
    const sel = document.getElementById('selectFilterPOProject');
    if (sel) {
      sel.innerHTML = '<option value="">Semua Proyek</option>';
      this._cachedProjects.forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        sel.appendChild(o);
      });
    }
    
    this._attachDelegatedListeners();
  },

  _attachDelegatedListeners() {
    const listView = document.getElementById('procurementListView');
    if (listView) {
      if (this._listClickHandler) {
        listView.removeEventListener('click', this._listClickHandler);
      }
      this._listClickHandler = async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id, type } = btn.dataset;
        
        // Material actions
        if (action === 'save-inline') await ProcurementPage.saveInlineRow(id);
        if (action === 'edit') await ProcurementPage.editInlineRow(id);
        if (action === 'delete') await ProcurementPage.deletePOConfirm(id);
        if (action === 'cancel-edit') ProcurementPage.cancelEditRow(id);
        if (action === 'queue-add') ProcurementPage.queueAddItem();
        if (action === 'delete-pending') ProcurementPage.removePendingItem(id);
        
        // Operational actions
        if (action === 'save-op-inline') await ProcurementPage.saveInlineOperational(id);
        if (action === 'edit-op') ProcurementPage.editInlineOperational(id);
        if (action === 'delete-op') await ProcurementPage.deleteOperationalConfirm(id);
        if (action === 'cancel-op-edit') ProcurementPage.cancelEditOperational(id);
        if (action === 'queue-op-add') ProcurementPage.queueAddOperational();
        if (action === 'delete-op-pending') ProcurementPage.removePendingOperational(id);
      };
      listView.addEventListener('click', this._listClickHandler);

      if (this._inlineChangeHandler) {
        listView.removeEventListener('input', this._inlineChangeHandler);
      }
      this._inlineChangeHandler = (e) => {
        if (e.target.classList.contains('po-inline-qty') || e.target.classList.contains('po-inline-price')) {
          ProcurementPage.calculateInlineTotal(e.target);
        }
        if (e.target.classList.contains('op-inline-qty') || e.target.classList.contains('op-inline-price')) {
          ProcurementPage.calculateInlineOperationalTotal(e.target);
        }
      };
      listView.addEventListener('input', this._inlineChangeHandler);
    }
  },

  switchTab(tab) {
    this._currentTab = tab;
    document.getElementById('tabMaterial').style.display = tab === 'material' ? '' : 'none';
    document.getElementById('tabOperational').style.display = tab === 'operational' ? '' : 'none';
    
    document.querySelectorAll('#costTabNav .tab-nav__btn').forEach((btn, i) => {
      btn.classList.toggle('tab-nav__btn--active', ['material', 'operational'][i] === tab);
    });
    
    const addBtn = document.getElementById('btnAddItem');
    if (addBtn) {
      addBtn.style.display = this._currentProjectId ? '' : 'none';
      addBtn.innerHTML = tab === 'material' ? '<i class="bi bi-plus-lg"></i> Tambah Material' : '<i class="bi bi-plus-lg"></i> Tambah Operasional';
      addBtn.setAttribute('onclick', tab === 'material' ? 'ProcurementPage.queueAddItem()' : 'ProcurementPage.queueAddOperational()');
    }
    
    if (this._currentProjectId) {
      if (tab === 'material') this.loadMaterialData();
      else this.loadOperationalData();
    }
  },

  async onProjectChange() {
    const projectId = document.getElementById('selectFilterPOProject')?.value || '';
    this._currentProjectId = projectId;
    
    const addBtn = document.getElementById('btnAddItem');
    const saveBtn = document.getElementById('btnSaveAll');
    
    if (!projectId) {
      if (addBtn) addBtn.style.display = 'none';
      if (saveBtn) saveBtn.style.display = 'none';
      document.getElementById('financialSummaryContainer').style.display = 'none';
      document.getElementById('poTableBody').innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">Pilih proyek terlebih dahulu</td></tr>';
      document.getElementById('opTableBody').innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">Pilih proyek terlebih dahulu</td></tr>';
      return;
    }
    
    if (addBtn) addBtn.style.display = '';
    await this.loadData();
    await this.updateFinancialSummary();
  },

  async loadData() {
    await Promise.all([
      this.loadMaterialData(),
      this.loadOperationalData()
    ]);
  },

  async loadMaterialData() {
    if (!this._currentProjectId) return;
    
    try {
      const poList = await DataAccess.getAllPO();
      let list = poList.filter(po => po.project_id === this._currentProjectId);
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      
      this._renderMaterialTable(list);
    } catch (err) {
      AppError.handle(err, 'Memuat data pembelian');
    }
  },

  async loadOperationalData() {
    if (!this._currentProjectId) return;
    
    try {
      const opList = await DataAccess.getAllOperational();
      let list = opList.filter(op => op.project_id === this._currentProjectId);
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      
      this._renderOperationalTable(list);
    } catch (err) {
      AppError.handle(err, 'Memuat data operasional');
    }
  },

  // ============================================================
  // MATERIAL TABLE RENDER
  // ============================================================
  _renderMaterialTable(existingItems) {
    const tbody = document.getElementById('poTableBody');
    const tfoot = document.getElementById('poTableFoot');
    if (!tbody) return;

    let html = '';
    html += this._renderMaterialInlineAddRow();

    const pendingItems = this._pendingItems || [];
    let displayIndex = 0;

    pendingItems.forEach(item => {
      displayIndex++;
      html += this._renderMaterialPendingRow(item, displayIndex);
    });

    if (existingItems.length === 0 && pendingItems.length === 0) {
      html += '<tr id="noDataRow"><td colspan="10" class="text-center py-3 text-muted">Belum ada item material. Gunakan baris di atas untuk menambahkan.</td></tr>';
    } else {
      existingItems.forEach((po) => {
        displayIndex++;
        html += this._renderMaterialDataRow(po, displayIndex);
      });
    }

    tbody.innerHTML = html;
    tfoot.style.display = (existingItems.length > 0 || pendingItems.length > 0) ? 'table-footer-group' : 'none';
    this._updateMaterialGrandTotal();
    this._updateSaveButton();
  },

  _renderMaterialInlineAddRow() {
    const today = new Date().toISOString().split('T')[0];
    return '<tr id="materialInlineAddRow" class="table-active" data-new-item="true">' +
      '<td class="text-center text-muted fw-bold"><i class="bi bi-plus-circle text-primary"></i></td>' +
      '<td><input type="date" class="form-control form-control-sm po-inline-date" value="' + today + '" style="min-width:100px;"></td>' +
      '<td><input type="text" class="form-control form-control-sm po-inline-supplier" placeholder="Toko/Supplier"></td>' +
      '<td><input type="text" class="form-control form-control-sm po-inline-name" placeholder="Nama material *" id="inlineMaterialName"></td>' +
      '<td><input type="text" class="form-control form-control-sm po-inline-spec" placeholder="Spesifikasi"></td>' +
      '<td class="text-center"><input type="number" class="form-control form-control-sm po-inline-qty" value="1" min="0" step="any" style="width:70px;margin:0 auto;"></td>' +
      '<td class="text-center"><input type="text" class="form-control form-control-sm po-inline-unit" placeholder="pcs" style="width:70px;margin:0 auto;"></td>' +
      '<td class="text-end"><input type="number" class="form-control form-control-sm po-inline-price" value="0" min="0" style="width:120px;"></td>' +
      '<td class="text-end"><strong class="row-total">Rp 0</strong></td>' +
      '<td class="text-center"><button class="btn btn--xs btn--primary" data-action="queue-add" title="Tambahkan ke daftar"><i class="bi bi-plus-lg"></i> Tambah</button></td>' +
      '</tr>';
  },

  _renderMaterialPendingRow(item, index) {
    const dateValue = UtilityService.toDateInput(item.date) || '';
    const tempId = item.id;
    return '<tr id="pending-' + tempId + '" class="table-warning" data-pending-id="' + tempId + '" style="background:#fff9db;">' +
      '<td class="text-center"><span class="badge bg-warning text-dark" style="font-size:0.6rem;">BARU</span> ' + index + '</td>' +
      '<td><input type="date" class="form-control form-control-sm edit-value po-inline-date" value="' + dateValue + '" style="min-width:100px;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'date\', this.value)"></td>' +
      '<td><input type="text" class="form-control form-control-sm edit-value po-inline-supplier" value="' + UtilityService.escapeHtml(item.supplier || '') + '" placeholder="Toko/Supplier" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'supplier\', this.value)"></td>' +
      '<td><input type="text" class="form-control form-control-sm edit-value po-inline-name" value="' + UtilityService.escapeHtml(item.material_name || '') + '" placeholder="Nama material" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'material_name\', this.value)"></td>' +
      '<td><input type="text" class="form-control form-control-sm edit-value po-inline-spec" value="' + UtilityService.escapeHtml(item.specification || '') + '" placeholder="Spesifikasi" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'specification\', this.value)"></td>' +
      '<td class="text-center"><input type="number" class="form-control form-control-sm edit-value po-inline-qty" value="' + (item.quantity || 0) + '" min="0" step="any" style="width:70px;margin:0 auto;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'quantity\', parseFloat(this.value)||0); ProcurementPage.recalcPendingTotal(\'' + tempId + '\');"></td>' +
      '<td class="text-center"><input type="text" class="form-control form-control-sm edit-value po-inline-unit" value="' + UtilityService.escapeHtml(item.unit || '') + '" placeholder="pcs" style="width:70px;margin:0 auto;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'unit\', this.value)"></td>' +
      '<td class="text-end"><input type="number" class="form-control form-control-sm edit-value po-inline-price" value="' + (item.unit_price || 0) + '" min="0" style="width:120px;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'unit_price\', parseFloat(this.value)||0); ProcurementPage.recalcPendingTotal(\'' + tempId + '\');"></td>' +
      '<td class="text-end"><strong class="row-total">' + UtilityService.formatCurrency(item.total_price) + '</strong></td>' +
      '<td class="text-center"><button class="btn btn--xs btn--outline-danger" data-action="delete-pending" data-id="' + tempId + '" title="Hapus"><i class="bi bi-trash"></i></button></td>' +
      '</tr>';
  },

  _renderMaterialDataRow(po, index) {
    const dateValue = UtilityService.toDateInput(po.date) || '';
    const itemId = po.id;
    const isEditing = !!this._editedItems[itemId];
    
    const displayStyle = isEditing ? 'display:none;' : '';
    const editStyle = isEditing ? '' : 'display:none;';
    const rowBg = isEditing ? 'background:#fffbeb;border-left:3px solid var(--color-warning);' : '';
    
    let html = '<tr id="row-' + itemId + '" data-item-id="' + itemId + '" style="' + rowBg + '">';
    html += '<td class="text-center">' + index + '</td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.formatDate(po.date) + '</span>';
    html += '<input type="date" class="form-control form-control-sm edit-value po-inline-date" value="' + dateValue + '" style="' + editStyle + 'min-width:100px;">';
    html += '</td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(po.supplier || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-supplier" value="' + UtilityService.escapeHtml(po.supplier || '') + '" style="' + editStyle + '" placeholder="Toko/Supplier">';
    html += '</td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '"><strong>' + UtilityService.escapeHtml(po.material_name || '-') + '</strong></span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-name" value="' + UtilityService.escapeHtml(po.material_name || '') + '" style="' + editStyle + '" placeholder="Nama material">';
    html += '</td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(po.specification || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-spec" value="' + UtilityService.escapeHtml(po.specification || '') + '" style="' + editStyle + '" placeholder="Spesifikasi">';
    html += '</td>';
    
    html += '<td class="text-center">';
    html += '<span class="display-value" style="' + displayStyle + '">' + (po.quantity || 0) + '</span>';
    html += '<input type="number" class="form-control form-control-sm edit-value po-inline-qty" value="' + (po.quantity || 0) + '" min="0" step="any" style="' + editStyle + 'width:70px;margin:0 auto;">';
    html += '</td>';
    
    html += '<td class="text-center">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(po.unit || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-unit" value="' + UtilityService.escapeHtml(po.unit || '') + '" style="' + editStyle + 'width:70px;margin:0 auto;" placeholder="pcs">';
    html += '</td>';
    
    html += '<td class="text-end">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.formatCurrency(po.unit_price) + '</span>';
    html += '<input type="number" class="form-control form-control-sm edit-value po-inline-price" value="' + (po.unit_price || 0) + '" min="0" style="' + editStyle + 'width:120px;">';
    html += '</td>';
    
    html += '<td class="text-end"><strong class="row-total">' + UtilityService.formatCurrency(po.total_price) + '</strong></td>';
    
    html += '<td class="text-center">';
    html += '<button class="btn btn--xs btn--outline-warning me-1 edit-btn" data-action="edit" data-id="' + itemId + '" style="' + displayStyle + '" title="Edit"><i class="bi bi-pencil"></i></button>';
    html += '<button class="btn btn--xs btn--outline-danger delete-btn" data-action="delete" data-id="' + itemId + '" style="' + displayStyle + '" title="Hapus"><i class="bi bi-trash"></i></button>';
    html += '<button class="btn btn--xs btn--success save-btn" data-action="save-inline" data-id="' + itemId + '" style="' + editStyle + '" title="Simpan"><i class="bi bi-check-lg"></i></button>';
    html += '<button class="btn btn--xs btn--outline-secondary cancel-btn" data-action="cancel-edit" data-id="' + itemId + '" style="' + editStyle + '" title="Batal"><i class="bi bi-x-lg"></i></button>';
    html += '</td>';
    html += '</tr>';
    
    return html;
  },

  // ============================================================
  // OPERATIONAL TABLE RENDER
  // ============================================================
  _renderOperationalTable(existingItems) {
    const tbody = document.getElementById('opTableBody');
    const tfoot = document.getElementById('opTableFoot');
    if (!tbody) return;

    let html = '';
    html += this._renderOperationalInlineAddRow();

    const pendingItems = this._pendingOperational || [];
    let displayIndex = 0;

    pendingItems.forEach(item => {
      displayIndex++;
      html += this._renderOperationalPendingRow(item, displayIndex);
    });

    if (existingItems.length === 0 && pendingItems.length === 0) {
      html += '<tr><td colspan="10" class="text-center py-3 text-muted">Belum ada biaya operasional. Gunakan baris di atas untuk menambahkan.</td></tr>';
    } else {
      existingItems.forEach((op) => {
        displayIndex++;
        html += this._renderOperationalDataRow(op, displayIndex);
      });
    }

    tbody.innerHTML = html;
    tfoot.style.display = (existingItems.length > 0 || pendingItems.length > 0) ? 'table-footer-group' : 'none';
    this._updateOperationalGrandTotal();
    this._updateSaveButton();
  },

  _renderOperationalInlineAddRow() {
    const today = new Date().toISOString().split('T')[0];
    const categoryOptions = OPERATIONAL_CATEGORIES.map(cat => 
      `<option value="${cat.value}">${cat.label}</option>`
    ).join('');
    
    return '<tr id="operationalInlineAddRow" class="table-active" data-new-item="true">' +
      '<td class="text-center text-muted fw-bold"><i class="bi bi-plus-circle text-primary"></i></td>' +
      '<td><input type="date" class="form-control form-control-sm op-inline-date" value="' + today + '" style="min-width:100px;"></td>' +
      '<td><select class="form-select form-select-sm op-inline-category" style="min-width:140px;">' + categoryOptions + '</select></td>' +
      '<td><input type="text" class="form-control form-control-sm op-inline-desc" placeholder="Deskripsi *" id="inlineOpDesc"></td>' +
      '<td class="text-center"><input type="number" class="form-control form-control-sm op-inline-qty" value="1" min="0" step="any" style="width:70px;margin:0 auto;"></td>' +
      '<td class="text-center"><input type="text" class="form-control form-control-sm op-inline-unit" placeholder="hari/orang" style="width:80px;margin:0 auto;"></td>' +
      '<td class="text-end"><input type="number" class="form-control form-control-sm op-inline-price" value="0" min="0" style="width:120px;"></td>' +
      '<td class="text-end"><strong class="row-total">Rp 0</strong></td>' +
      '<td><input type="text" class="form-control form-control-sm op-inline-notes" placeholder="Catatan"></td>' +
      '<td class="text-center"><button class="btn btn--xs btn--primary" data-action="queue-op-add" title="Tambahkan"><i class="bi bi-plus-lg"></i> Tambah</button></td>' +
      '</tr>';
  },

  _renderOperationalPendingRow(item, index) {
    const dateValue = UtilityService.toDateInput(item.date) || '';
    const tempId = item.id;
    const categoryLabel = OPERATIONAL_CATEGORIES.find(c => c.value === item.category)?.label || item.category;
    
    return '<tr id="op-pending-' + tempId + '" class="table-warning" data-pending-id="' + tempId + '" style="background:#fff9db;">' +
      '<td class="text-center"><span class="badge bg-warning text-dark" style="font-size:0.6rem;">BARU</span> ' + index + '</td>' +
      '<td><input type="date" class="form-control form-control-sm edit-value op-inline-date" value="' + dateValue + '" onchange="ProcurementPage.updatePendingOperationalField(\'' + tempId + '\', \'date\', this.value)"></td>' +
      '<td>' +
        '<select class="form-select form-select-sm edit-value op-inline-category" onchange="ProcurementPage.updatePendingOperationalField(\'' + tempId + '\', \'category\', this.value)">' +
          OPERATIONAL_CATEGORIES.map(cat => `<option value="${cat.value}" ${item.category === cat.value ? 'selected' : ''}>${cat.label}</option>`).join('') +
        '</select>' +
      '</td>' +
      '<td><input type="text" class="form-control form-control-sm edit-value op-inline-desc" value="' + UtilityService.escapeHtml(item.description || '') + '" placeholder="Deskripsi" onchange="ProcurementPage.updatePendingOperationalField(\'' + tempId + '\', \'description\', this.value)"></td>' +
      '<td class="text-center"><input type="number" class="form-control form-control-sm edit-value op-inline-qty" value="' + (item.quantity || 0) + '" min="0" step="any" style="width:70px;margin:0 auto;" onchange="ProcurementPage.updatePendingOperationalField(\'' + tempId + '\', \'quantity\', parseFloat(this.value)||0); ProcurementPage.recalcPendingOperationalTotal(\'' + tempId + '\');"></td>' +
      '<td class="text-center"><input type="text" class="form-control form-control-sm edit-value op-inline-unit" value="' + UtilityService.escapeHtml(item.unit || '') + '" placeholder="satuan" style="width:80px;margin:0 auto;" onchange="ProcurementPage.updatePendingOperationalField(\'' + tempId + '\', \'unit\', this.value)"></td>' +
      '<td class="text-end"><input type="number" class="form-control form-control-sm edit-value op-inline-price" value="' + (item.unit_price || 0) + '" min="0" style="width:120px;" onchange="ProcurementPage.updatePendingOperationalField(\'' + tempId + '\', \'unit_price\', parseFloat(this.value)||0); ProcurementPage.recalcPendingOperationalTotal(\'' + tempId + '\');"></td>' +
      '<td class="text-end"><strong class="row-total">' + UtilityService.formatCurrency(item.total_price) + '</strong></td>' +
      '<td><input type="text" class="form-control form-control-sm edit-value op-inline-notes" value="' + UtilityService.escapeHtml(item.notes || '') + '" placeholder="Catatan" onchange="ProcurementPage.updatePendingOperationalField(\'' + tempId + '\', \'notes\', this.value)"></td>' +
      '<td class="text-center"><button class="btn btn--xs btn--outline-danger" data-action="delete-op-pending" data-id="' + tempId + '" title="Hapus"><i class="bi bi-trash"></i></button></td>' +
      '</tr>';
  },

  _renderOperationalDataRow(op, index) {
    const dateValue = UtilityService.toDateInput(op.date) || '';
    const itemId = op.id;
    const isEditing = !!this._editedOperational[itemId];
    
    const displayStyle = isEditing ? 'display:none;' : '';
    const editStyle = isEditing ? '' : 'display:none;';
    const rowBg = isEditing ? 'background:#fffbeb;border-left:3px solid var(--color-warning);' : '';
    const categoryLabel = OPERATIONAL_CATEGORIES.find(c => c.value === op.category)?.label || op.category || '-';
    
    let html = '<tr id="op-row-' + itemId + '" data-op-id="' + itemId + '" style="' + rowBg + '">';
    html += '<td class="text-center">' + index + '</td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.formatDate(op.date) + '</span>';
    html += '<input type="date" class="form-control form-control-sm edit-value op-inline-date" value="' + dateValue + '" style="' + editStyle + 'min-width:100px;">';
    html += '</td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '"><span class="badge bg-info">' + UtilityService.escapeHtml(categoryLabel) + '</span></span>';
    html += '<select class="form-select form-select-sm edit-value op-inline-category" style="' + editStyle + 'min-width:140px;">' +
      OPERATIONAL_CATEGORIES.map(cat => `<option value="${cat.value}" ${op.category === cat.value ? 'selected' : ''}>${cat.label}</option>`).join('') +
      '</select>';
    html += '</td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(op.description || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value op-inline-desc" value="' + UtilityService.escapeHtml(op.description || '') + '" style="' + editStyle + '" placeholder="Deskripsi">';
    html += '</td>';
    
    html += '<td class="text-center">';
    html += '<span class="display-value" style="' + displayStyle + '">' + (op.quantity || 0) + '</span>';
    html += '<input type="number" class="form-control form-control-sm edit-value op-inline-qty" value="' + (op.quantity || 0) + '" min="0" step="any" style="' + editStyle + 'width:70px;margin:0 auto;">';
    html += '</td>';
    
    html += '<td class="text-center">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(op.unit || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value op-inline-unit" value="' + UtilityService.escapeHtml(op.unit || '') + '" style="' + editStyle + 'width:80px;margin:0 auto;" placeholder="satuan">';
    html += '</td>';
    
    html += '<td class="text-end">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.formatCurrency(op.unit_price) + '</span>';
    html += '<input type="number" class="form-control form-control-sm edit-value op-inline-price" value="' + (op.unit_price || 0) + '" min="0" style="' + editStyle + 'width:120px;">';
    html += '</td>';
    
    html += '<td class="text-end"><strong class="row-total">' + UtilityService.formatCurrency(op.total_price) + '</strong></td>';
    
    html += '<td>';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(op.notes || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value op-inline-notes" value="' + UtilityService.escapeHtml(op.notes || '') + '" style="' + editStyle + '" placeholder="Catatan">';
    html += '</td>';
    
    html += '<td class="text-center">';
    html += '<button class="btn btn--xs btn--outline-warning me-1 edit-op-btn" data-action="edit-op" data-id="' + itemId + '" style="' + displayStyle + '" title="Edit"><i class="bi bi-pencil"></i></button>';
    html += '<button class="btn btn--xs btn--outline-danger delete-op-btn" data-action="delete-op" data-id="' + itemId + '" style="' + displayStyle + '" title="Hapus"><i class="bi bi-trash"></i></button>';
    html += '<button class="btn btn--xs btn--success save-op-btn" data-action="save-op-inline" data-id="' + itemId + '" style="' + editStyle + '" title="Simpan"><i class="bi bi-check-lg"></i></button>';
    html += '<button class="btn btn--xs btn--outline-secondary cancel-op-btn" data-action="cancel-op-edit" data-id="' + itemId + '" style="' + editStyle + '" title="Batal"><i class="bi bi-x-lg"></i></button>';
    html += '</td>';
    html += '</tr>';
    
    return html;
  },

  // ============================================================
  // MATERIAL PENDING MANAGEMENT
  // ============================================================
  queueAddItem() {
    const row = document.getElementById('materialInlineAddRow');
    if (!row) return;

    if (!this._currentProjectId) {
      UIService.showToast('Pilih proyek terlebih dahulu!', 'warning');
      return;
    }

    const materialName = row.querySelector('.po-inline-name')?.value?.trim();
    if (!materialName) {
      UIService.showToast('Nama material wajib diisi!', 'warning');
      return;
    }

    const dateVal = row.querySelector('.po-inline-date')?.value || new Date().toISOString().split('T')[0];
    const supplier = row.querySelector('.po-inline-supplier')?.value?.trim() || '';
    const specification = row.querySelector('.po-inline-spec')?.value?.trim() || '';
    const quantity = parseFloat(row.querySelector('.po-inline-qty')?.value) || 0;
    const unit = row.querySelector('.po-inline-unit')?.value?.trim() || '';
    const unitPrice = parseFloat(row.querySelector('.po-inline-price')?.value) || 0;

    if (quantity <= 0) {
      UIService.showToast('Qty harus lebih dari 0!', 'warning');
      return;
    }

    const totalPrice = quantity * unitPrice;
    const tempId = 'pending_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    if (!this._pendingItems) this._pendingItems = [];
    this._pendingItems.push({
      id: tempId,
      project_id: this._currentProjectId,
      material_name: materialName,
      specification,
      quantity,
      unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      supplier,
      date: dateVal
    });

    row.querySelector('.po-inline-name').value = '';
    row.querySelector('.po-inline-spec').value = '';
    row.querySelector('.po-inline-qty').value = '1';
    row.querySelector('.po-inline-unit').value = '';
    row.querySelector('.po-inline-price').value = '0';
    row.querySelector('.po-inline-supplier').value = '';
    row.querySelector('.row-total').textContent = 'Rp 0';
    row.querySelector('.po-inline-name').focus();

    this.loadMaterialData();
    this._updateSaveButton();
    this._showStatusBar(this._pendingItems.length + ' item material menunggu disimpan.');
    UIService.showToast('"' + materialName + '" ditambahkan ke daftar (belum disimpan)', 'info');
  },

  removePendingItem(tempId) {
    this._pendingItems = (this._pendingItems || []).filter(item => item.id !== tempId);
    this.loadMaterialData();
    this._updateSaveButton();
    
    const total = (this._pendingItems.length + this._pendingOperational.length + 
                   Object.keys(this._editedItems).length + Object.keys(this._editedOperational).length);
    if (total === 0) {
      this._hideStatusBar();
    } else {
      this._showStatusBar(total + ' item menunggu disimpan.');
    }
  },

  updatePendingField(tempId, field, value) {
    const item = (this._pendingItems || []).find(i => i.id === tempId);
    if (!item) return;
    
    if (field === 'quantity') {
      item.quantity = parseFloat(value) || 0;
      item.total_price = item.quantity * item.unit_price;
    } else if (field === 'unit_price') {
      item.unit_price = parseFloat(value) || 0;
      item.total_price = item.quantity * item.unit_price;
    } else {
      item[field] = value;
    }
    this._updateMaterialGrandTotal();
  },

  recalcPendingTotal(tempId) {
    const item = (this._pendingItems || []).find(i => i.id === tempId);
    if (!item) return;
    item.total_price = item.quantity * item.unit_price;
    
    const totalEl = document.querySelector('#pending-' + tempId + ' .row-total');
    if (totalEl) {
      totalEl.textContent = UtilityService.formatCurrency(item.total_price);
    }
    this._updateMaterialGrandTotal();
  },

  // ============================================================
  // OPERATIONAL PENDING MANAGEMENT
  // ============================================================
  queueAddOperational() {
    const row = document.getElementById('operationalInlineAddRow');
    if (!row) return;

    if (!this._currentProjectId) {
      UIService.showToast('Pilih proyek terlebih dahulu!', 'warning');
      return;
    }

    const description = row.querySelector('.op-inline-desc')?.value?.trim();
    if (!description) {
      UIService.showToast('Deskripsi wajib diisi!', 'warning');
      return;
    }

    const dateVal = row.querySelector('.op-inline-date')?.value || new Date().toISOString().split('T')[0];
    const category = row.querySelector('.op-inline-category')?.value || 'other';
    const quantity = parseFloat(row.querySelector('.op-inline-qty')?.value) || 0;
    const unit = row.querySelector('.op-inline-unit')?.value?.trim() || '';
    const unitPrice = parseFloat(row.querySelector('.op-inline-price')?.value) || 0;
    const notes = row.querySelector('.op-inline-notes')?.value?.trim() || '';

    if (quantity <= 0) {
      UIService.showToast('Qty harus lebih dari 0!', 'warning');
      return;
    }

    const totalPrice = quantity * unitPrice;
    const tempId = 'op_pending_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    if (!this._pendingOperational) this._pendingOperational = [];
    this._pendingOperational.push({
      id: tempId,
      project_id: this._currentProjectId,
      date: dateVal,
      category: category,
      description: description,
      quantity: quantity,
      unit: unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      notes: notes
    });

    row.querySelector('.op-inline-desc').value = '';
    row.querySelector('.op-inline-qty').value = '1';
    row.querySelector('.op-inline-unit').value = '';
    row.querySelector('.op-inline-price').value = '0';
    row.querySelector('.op-inline-notes').value = '';
    row.querySelector('.row-total').textContent = 'Rp 0';
    row.querySelector('.op-inline-desc').focus();

    this.loadOperationalData();
    this._updateSaveButton();
    this._showStatusBar(this._pendingOperational.length + ' item operasional menunggu disimpan.');
    UIService.showToast('"' + description + '" ditambahkan ke daftar (belum disimpan)', 'info');
  },

  removePendingOperational(tempId) {
    this._pendingOperational = (this._pendingOperational || []).filter(item => item.id !== tempId);
    this.loadOperationalData();
    this._updateSaveButton();
    
    const total = (this._pendingItems.length + this._pendingOperational.length + 
                   Object.keys(this._editedItems).length + Object.keys(this._editedOperational).length);
    if (total === 0) {
      this._hideStatusBar();
    } else {
      this._showStatusBar(total + ' item menunggu disimpan.');
    }
  },

  updatePendingOperationalField(tempId, field, value) {
    const item = (this._pendingOperational || []).find(i => i.id === tempId);
    if (!item) return;
    
    if (field === 'quantity') {
      item.quantity = parseFloat(value) || 0;
      item.total_price = item.quantity * item.unit_price;
    } else if (field === 'unit_price') {
      item.unit_price = parseFloat(value) || 0;
      item.total_price = item.quantity * item.unit_price;
    } else {
      item[field] = value;
    }
    this._updateOperationalGrandTotal();
  },

  recalcPendingOperationalTotal(tempId) {
    const item = (this._pendingOperational || []).find(i => i.id === tempId);
    if (!item) return;
    item.total_price = item.quantity * item.unit_price;
    
    const totalEl = document.querySelector('#op-pending-' + tempId + ' .row-total');
    if (totalEl) {
      totalEl.textContent = UtilityService.formatCurrency(item.total_price);
    }
    this._updateOperationalGrandTotal();
  },

  // ============================================================
  // MATERIAL INLINE EDIT
  // ============================================================
  editInlineRow(id) {
    const row = document.getElementById('row-' + id);
    if (!row) return;
    
    this._editedItems[id] = true;
    this._toggleMaterialEditMode(row, true);
    this._updateSaveButton();
    this._showStatusBar('Ada item yang sedang diedit.');
  },

  cancelEditRow(id) {
    delete this._editedItems[id];
    this.loadMaterialData();
    this._updateSaveButton();
    this._checkPendingEdits();
  },

  async saveInlineRow(id) {
    const row = document.getElementById('row-' + id);
    if (!row) return;

    const materialName = row.querySelector('.po-inline-name')?.value?.trim();
    if (!materialName) {
      UIService.showToast('Nama material wajib diisi!', 'warning');
      return;
    }

    delete this._editedItems[id];
    this.loadMaterialData();
    this._updateSaveButton();
    this._checkPendingEdits();
    UIService.showToast('Perubahan dicatat. Klik "Simpan Data" untuk menyimpan ke server.', 'info');
  },

  _toggleMaterialEditMode(row, isEditing) {
    row.querySelectorAll('.display-value').forEach(el => el.style.display = isEditing ? 'none' : '');
    row.querySelectorAll('.edit-value').forEach(el => el.style.display = isEditing ? '' : 'none');
    row.querySelector('.edit-btn').style.display = isEditing ? 'none' : '';
    row.querySelector('.delete-btn').style.display = isEditing ? 'none' : '';
    row.querySelector('.save-btn').style.display = isEditing ? '' : 'none';
    row.querySelector('.cancel-btn').style.display = isEditing ? '' : 'none';
    row.style.background = isEditing ? '#fffbeb' : '';
    row.style.borderLeft = isEditing ? '3px solid var(--color-warning)' : '';
  },

  // ============================================================
  // OPERATIONAL INLINE EDIT
  // ============================================================
  editInlineOperational(id) {
    const row = document.getElementById('op-row-' + id);
    if (!row) return;
    
    this._editedOperational[id] = true;
    this._toggleOperationalEditMode(row, true);
    this._updateSaveButton();
    this._showStatusBar('Ada item operasional yang sedang diedit.');
  },

  cancelEditOperational(id) {
    delete this._editedOperational[id];
    this.loadOperationalData();
    this._updateSaveButton();
    this._checkPendingEdits();
  },

  async saveInlineOperational(id) {
    const row = document.getElementById('op-row-' + id);
    if (!row) return;

    const description = row.querySelector('.op-inline-desc')?.value?.trim();
    if (!description) {
      UIService.showToast('Deskripsi wajib diisi!', 'warning');
      return;
    }

    delete this._editedOperational[id];
    this.loadOperationalData();
    this._updateSaveButton();
    this._checkPendingEdits();
    UIService.showToast('Perubahan dicatat. Klik "Simpan Data" untuk menyimpan ke server.', 'info');
  },

  _toggleOperationalEditMode(row, isEditing) {
    row.querySelectorAll('.display-value').forEach(el => el.style.display = isEditing ? 'none' : '');
    row.querySelectorAll('.edit-value').forEach(el => el.style.display = isEditing ? '' : 'none');
    row.querySelector('.edit-op-btn').style.display = isEditing ? 'none' : '';
    row.querySelector('.delete-op-btn').style.display = isEditing ? 'none' : '';
    row.querySelector('.save-op-btn').style.display = isEditing ? '' : 'none';
    row.querySelector('.cancel-op-btn').style.display = isEditing ? '' : 'none';
    row.style.background = isEditing ? '#fffbeb' : '';
    row.style.borderLeft = isEditing ? '3px solid var(--color-warning)' : '';
  },

  // ============================================================
  // DELETE OPERATIONS
  // ============================================================
  async deletePOConfirm(id) {
    UtilityService.showConfirmDialog('Hapus item material ini?', async () => {
      try {
        await DataAccess.deletePO(id);
        await this.loadMaterialData();
        await this.updateFinancialSummary();
        UIService.showToast('Item material dihapus.', 'warning');
      } catch (err) { AppError.handle(err, 'Menghapus item material'); }
    });
  },

  async deleteOperationalConfirm(id) {
    UtilityService.showConfirmDialog('Hapus biaya operasional ini?', async () => {
      try {
        await DataAccess.deleteOperational(id);
        await this.loadOperationalData();
        await this.updateFinancialSummary();
        UIService.showToast('Biaya operasional dihapus.', 'warning');
      } catch (err) { AppError.handle(err, 'Menghapus biaya operasional'); }
    });
  },

  // ============================================================
  // SAVE ALL ITEMS
  // ============================================================
  async saveAllItems() {
    if (!this._currentProjectId) {
      UIService.showToast('Pilih proyek terlebih dahulu!', 'warning');
      return;
    }

    const materialItemsToSave = [];
    const operationalItemsToSave = [];
    const now = new Date().toISOString();

    // Kumpulkan pending material items
    (this._pendingItems || []).forEach(item => {
      materialItemsToSave.push({
        id: 'po_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        project_id: this._currentProjectId,
        material_name: item.material_name,
        specification: item.specification || '',
        quantity: item.quantity,
        unit: item.unit || '',
        unit_price: item.unit_price,
        total_price: item.total_price,
        supplier: item.supplier || '',
        date: item.date || new Date().toISOString().split('T')[0],
        created_at: now,
        updated_at: now
      });
    });

    // Kumpulkan edited material items
    const materialRows = document.querySelectorAll('#poTableBody tr[data-item-id]');
    for (const row of materialRows) {
      const itemId = row.getAttribute('data-item-id');
      const isEditing = this._editedItems[itemId];
      
      if (isEditing) {
        const materialName = row.querySelector('.po-inline-name')?.value?.trim();
        if (!materialName) {
          UIService.showToast('Nama material untuk item ' + itemId + ' wajib diisi!', 'warning');
          return;
        }

        const dateVal = row.querySelector('.po-inline-date')?.value || new Date().toISOString().split('T')[0];
        const supplier = row.querySelector('.po-inline-supplier')?.value?.trim() || '';
        const specification = row.querySelector('.po-inline-spec')?.value?.trim() || '';
        const quantity = parseFloat(row.querySelector('.po-inline-qty')?.value) || 0;
        const unit = row.querySelector('.po-inline-unit')?.value?.trim() || '';
        const unitPrice = parseFloat(row.querySelector('.po-inline-price')?.value) || 0;
        const totalPrice = quantity * unitPrice;

        if (quantity <= 0) {
          UIService.showToast('Qty untuk item ' + materialName + ' harus lebih dari 0!', 'warning');
          return;
        }

        materialItemsToSave.push({
          id: itemId,
          project_id: this._currentProjectId,
          material_name: materialName,
          specification,
          quantity,
          unit,
          unit_price: unitPrice,
          total_price: totalPrice,
          supplier,
          date: dateVal,
          updated_at: now
        });
      }
    }

    // Kumpulkan pending operational items
    (this._pendingOperational || []).forEach(item => {
      operationalItemsToSave.push({
        id: 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        project_id: this._currentProjectId,
        date: item.date || new Date().toISOString().split('T')[0],
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit || '',
        unit_price: item.unit_price,
        total_price: item.total_price,
        notes: item.notes || '',
        created_at: now,
        updated_at: now
      });
    });

    // Kumpulkan edited operational items
    const operationalRows = document.querySelectorAll('#opTableBody tr[data-op-id]');
    for (const row of operationalRows) {
      const itemId = row.getAttribute('data-op-id');
      const isEditing = this._editedOperational[itemId];
      
      if (isEditing) {
        const description = row.querySelector('.op-inline-desc')?.value?.trim();
        if (!description) {
          UIService.showToast('Deskripsi untuk item ' + itemId + ' wajib diisi!', 'warning');
          return;
        }

        const dateVal = row.querySelector('.op-inline-date')?.value || new Date().toISOString().split('T')[0];
        const category = row.querySelector('.op-inline-category')?.value || 'other';
        const quantity = parseFloat(row.querySelector('.op-inline-qty')?.value) || 0;
        const unit = row.querySelector('.op-inline-unit')?.value?.trim() || '';
        const unitPrice = parseFloat(row.querySelector('.op-inline-price')?.value) || 0;
        const totalPrice = quantity * unitPrice;
        const notes = row.querySelector('.op-inline-notes')?.value?.trim() || '';

        if (quantity <= 0) {
          UIService.showToast('Qty untuk item ' + description + ' harus lebih dari 0!', 'warning');
          return;
        }

        operationalItemsToSave.push({
          id: itemId,
          project_id: this._currentProjectId,
          date: dateVal,
          category: category,
          description: description,
          quantity: quantity,
          unit: unit,
          unit_price: unitPrice,
          total_price: totalPrice,
          notes: notes,
          updated_at: now
        });
      }
    }

    const totalToSave = materialItemsToSave.length + operationalItemsToSave.length;
    if (totalToSave === 0) {
      UIService.showToast('Tidak ada perubahan yang perlu disimpan.', 'info');
      return;
    }

    const saveBtn = document.getElementById('btnSaveAll');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan...';
    }

    try {
      const allOperations = [
        ...materialItemsToSave.map(item => ({ sheet: 'procurement', data: item })),
        ...operationalItemsToSave.map(item => ({ sheet: 'operational', data: item }))
      ];
      
      await DB.batchUpsert(allOperations);
      
      this._pendingItems = [];
      this._pendingOperational = [];
      this._editedItems = {};
      this._editedOperational = {};
      
      await this.loadData();
      await this.updateFinancialSummary();
      this._hideStatusBar();
      UIService.showToast(totalToSave + ' item berhasil disimpan!', 'success');
    } catch (err) {
      AppError.handle(err, 'Menyimpan data');
      
      // Fallback: simpan satu per satu
      try {
        let savedCount = 0;
        for (const item of materialItemsToSave) {
          try {
            await DataAccess.savePO(item);
            savedCount++;
          } catch (e) { console.error(e); }
        }
        for (const item of operationalItemsToSave) {
          try {
            await DataAccess.saveOperational(item);
            savedCount++;
          } catch (e) { console.error(e); }
        }
        if (savedCount > 0) {
          this._pendingItems = [];
          this._pendingOperational = [];
          this._editedItems = {};
          this._editedOperational = {};
          await this.loadData();
          await this.updateFinancialSummary();
          this._hideStatusBar();
          UIService.showToast(savedCount + '/' + totalToSave + ' item berhasil disimpan!', 'success');
        }
      } catch (fallbackErr) {
        AppError.handle(fallbackErr, 'Menyimpan data (fallback)');
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-save"></i> Simpan Data (<span id="btnSaveCount">0</span>)';
        this._updateSaveButton();
      }
    }
  },

  // ============================================================
  // CALCULATIONS
  // ============================================================
  calculateInlineTotal(inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;
    const qty = parseFloat(row.querySelector('.po-inline-qty')?.value || 0);
    const price = parseFloat(row.querySelector('.po-inline-price')?.value || 0);
    const totalEl = row.querySelector('.row-total');
    if (totalEl) {
      totalEl.textContent = UtilityService.formatCurrency(qty * price);
    }
    this._updateMaterialGrandTotal();
  },

  calculateInlineOperationalTotal(inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;
    const qty = parseFloat(row.querySelector('.op-inline-qty')?.value || 0);
    const price = parseFloat(row.querySelector('.op-inline-price')?.value || 0);
    const totalEl = row.querySelector('.row-total');
    if (totalEl) {
      totalEl.textContent = UtilityService.formatCurrency(qty * price);
    }
    this._updateOperationalGrandTotal();
  },

  _updateMaterialGrandTotal() {
    let total = 0;
    
    document.querySelectorAll('#poTableBody tr[data-item-id]').forEach(row => {
      let qty, price;
      const qtyInput = row.querySelector('.po-inline-qty');
      if (qtyInput && qtyInput.style.display !== 'none') {
        qty = parseFloat(qtyInput.value || 0);
        price = parseFloat(row.querySelector('.po-inline-price')?.value || 0);
      } else {
        const totalText = row.querySelector('.row-total')?.textContent || '';
        const totalMatch = totalText.match(/[\d.,]+/);
        if (totalMatch) {
          total += parseFloat(totalMatch[0].replace(/\./g, '').replace(',', '.')) || 0;
        }
        return;
      }
      if (!isNaN(qty) && !isNaN(price)) {
        total += qty * price;
      }
    });

    (this._pendingItems || []).forEach(item => {
      total += item.total_price || 0;
    });
    
    const totalCell = document.getElementById('poGrandTotalCell');
    if (totalCell) {
      totalCell.textContent = UtilityService.formatCurrency(total);
    }
    
    return total;
  },

  _updateOperationalGrandTotal() {
    let total = 0;
    
    document.querySelectorAll('#opTableBody tr[data-op-id]').forEach(row => {
      let qty, price;
      const qtyInput = row.querySelector('.op-inline-qty');
      if (qtyInput && qtyInput.style.display !== 'none') {
        qty = parseFloat(qtyInput.value || 0);
        price = parseFloat(row.querySelector('.op-inline-price')?.value || 0);
      } else {
        const totalText = row.querySelector('.row-total')?.textContent || '';
        const totalMatch = totalText.match(/[\d.,]+/);
        if (totalMatch) {
          total += parseFloat(totalMatch[0].replace(/\./g, '').replace(',', '.')) || 0;
        }
        return;
      }
      if (!isNaN(qty) && !isNaN(price)) {
        total += qty * price;
      }
    });

    (this._pendingOperational || []).forEach(item => {
      total += item.total_price || 0;
    });
    
    const totalCell = document.getElementById('opGrandTotalCell');
    if (totalCell) {
      totalCell.textContent = UtilityService.formatCurrency(total);
    }
    
    return total;
  },

  // ============================================================
  // FINANCIAL SUMMARY
  // ============================================================
  async updateFinancialSummary() {
    if (!this._currentProjectId) {
      document.getElementById('financialSummaryContainer').style.display = 'none';
      return;
    }
    
    try {
      const project = await DataAccess.getProjectById(this._currentProjectId);
      const [poList, opList] = await Promise.all([
        DataAccess.getPOByProject(this._currentProjectId),
        DataAccess.getOperationalByProject(this._currentProjectId)
      ]);
      
      const totalMaterial = poList.reduce((sum, p) => sum + (p.total_price || 0), 0);
      const totalOperational = opList.reduce((sum, o) => sum + (o.total_price || 0), 0);
      
      // Tambahkan pending items
      const pendingMaterialTotal = (this._pendingItems || []).reduce((sum, i) => sum + (i.total_price || 0), 0);
      const pendingOperationalTotal = (this._pendingOperational || []).reduce((sum, i) => sum + (i.total_price || 0), 0);
      
      const finalMaterial = totalMaterial + pendingMaterialTotal;
      const finalOperational = totalOperational + pendingOperationalTotal;
      const totalExpense = finalMaterial + finalOperational;
      const contractValue = project?.contract_value || 0;
      const remaining = contractValue - totalExpense;
      const percent = contractValue > 0 ? Math.round((totalExpense / contractValue) * 100) : 0;
      
      document.getElementById('summaryContractValue').textContent = UtilityService.formatCurrency(contractValue);
      document.getElementById('summaryTotalMaterial').textContent = UtilityService.formatCurrency(finalMaterial);
      document.getElementById('summaryTotalOperational').textContent = UtilityService.formatCurrency(finalOperational);
      document.getElementById('summaryTotalExpense').textContent = UtilityService.formatCurrency(totalExpense);
      document.getElementById('summaryRemaining').textContent = UtilityService.formatCurrency(remaining);
      
      const remainingCard = document.getElementById('summaryRemainingCard');
      if (remaining >= 0) {
        remainingCard.className = 'report-finance-card report-finance-card--success text-center';
      } else {
        remainingCard.className = 'report-finance-card report-finance-card--danger text-center';
      }
      
      const progressBar = document.getElementById('summaryProgressBar');
      const progressPercent = document.getElementById('summaryProgressPercent');
      const displayPercent = Math.min(percent, 100);
      progressBar.style.width = Math.max(3, displayPercent) + '%';
      progressBar.style.background = percent > 80 ? '#ef4444' : (percent > 50 ? '#f59e0b' : '#10b981');
      progressPercent.textContent = percent + '%';
      
      document.getElementById('financialSummaryContainer').style.display = 'block';
    } catch (err) {
      console.error('[ProcurementPage] Gagal update ringkasan:', err);
    }
  },

  // ============================================================
  // STATUS BAR & BUTTON MANAGEMENT
  // ============================================================
  _updateSaveButton() {
    const saveBtn = document.getElementById('btnSaveAll');
    const countEl = document.getElementById('btnSaveCount');
    const pendingMaterial = (this._pendingItems || []).length;
    const pendingOperational = (this._pendingOperational || []).length;
    const editedMaterial = Object.keys(this._editedItems || {}).length;
    const editedOperational = Object.keys(this._editedOperational || {}).length;
    const total = pendingMaterial + pendingOperational + editedMaterial + editedOperational;

    if (saveBtn) {
      if (total > 0) {
        saveBtn.style.display = '';
        if (countEl) countEl.textContent = total;
      } else {
        saveBtn.style.display = 'none';
      }
    }
  },

  _showStatusBar(message) {
    const statusBar = document.getElementById('poStatusBar');
    const statusText = document.getElementById('poStatusText');
    if (statusBar && statusText) {
      statusBar.style.display = '';
      statusText.textContent = message || 'Ada perubahan yang belum disimpan.';
    }
  },

  _hideStatusBar() {
    const statusBar = document.getElementById('poStatusBar');
    if (statusBar) {
      statusBar.style.display = 'none';
    }
  },

  _checkPendingEdits() {
    const pendingMaterial = (this._pendingItems || []).length;
    const pendingOperational = (this._pendingOperational || []).length;
    const editedMaterial = Object.keys(this._editedItems || {}).length;
    const editedOperational = Object.keys(this._editedOperational || {}).length;
    const total = pendingMaterial + pendingOperational + editedMaterial + editedOperational;
    
    if (total > 0) {
      this._updateSaveButton();
      this._showStatusBar(total + ' item menunggu disimpan. Klik "Simpan Data" untuk menyimpan ke server.');
    } else {
      this._updateSaveButton();
      this._hideStatusBar();
    }
  }
};

export { ProcurementPage };