// pembelian.js — ES6 Module — Procurement (Batch Add + Edit Support)
import { ROUTES, TOAST, ERR } from './constants.js';
import { DB, DataAccess } from './db.js';
import { AppError } from './error-handler.js';
import { UtilityService, UIService } from './main.js';

const ProcurementPage = {
  _cachedProjects: [],
  _currentProjectId: null,
  _pendingItems: [],
  _editedItems: {},
  _listClickHandler: null,
  _inlineChangeHandler: null,

  render() {
    return `
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
        <div class="page-header__filter">
          <select class="form-select" id="selectFilterPOProject" onchange="ProcurementPage.loadPOList()">
            <option value="">Semua Proyek</option>
          </select>
        </div>
        <div class="page-header__filter">
          <select class="form-select" id="selectFilterPOSupplier" onchange="ProcurementPage.loadPOList()">
            <option value="">Semua Toko/Supplier</option>
          </select>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn--primary" onclick="ProcurementPage.queueAddItem()" id="btnAddItem">
            <i class="bi bi-plus-lg"></i> Tambah ke Daftar
          </button>
          <button class="btn btn--success" onclick="ProcurementPage.saveAllItems()" id="btnSaveAll" style="display:none;">
            <i class="bi bi-save"></i> Simpan Data (<span id="btnSaveCount">0</span>)
          </button>
          <button class="btn btn--outline-info" onclick="ProcurementPage.loadPOList()" id="btnRefresh">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>
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
                  <tr><td colspan="10" class="text-center py-4 text-muted">Pilih proyek untuk melihat dan menambahkan item pembelian</td></tr>
                </tbody>
                <tfoot id="poTableFoot" style="display:none;">
                  <tr class="fw-bold" style="background:#f0f9ff;">
                    <td colspan="8" class="text-end">TOTAL KESELURUHAN:</td>
                    <td class="text-end" id="poGrandTotalCell">Rp 0</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
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
    </div>`;
  },

  async init() {
    this._pendingItems = [];
    this._editedItems = {};
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

  // ============================================================
  // EVENT DELEGATION
  // ============================================================
  _attachDelegatedListeners() {
    const listView = document.getElementById('procurementListView');
    if (listView) {
      if (this._listClickHandler) {
        listView.removeEventListener('click', this._listClickHandler);
      }
      this._listClickHandler = async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'save-inline') await ProcurementPage.saveInlineRow(id);
        if (action === 'edit') await ProcurementPage.editInlineRow(id);
        if (action === 'delete') await ProcurementPage.deletePOConfirm(id);
        if (action === 'cancel-edit') ProcurementPage.cancelEditRow(id);
        if (action === 'queue-add') ProcurementPage.queueAddItem();
        if (action === 'delete-pending') ProcurementPage.removePendingItem(id);
      };
      listView.addEventListener('click', this._listClickHandler);

      if (this._inlineChangeHandler) {
        listView.removeEventListener('input', this._inlineChangeHandler);
      }
      this._inlineChangeHandler = (e) => {
        if (e.target.classList.contains('po-inline-qty') || e.target.classList.contains('po-inline-price')) {
          ProcurementPage.calculateInlineTotal(e.target);
        }
      };
      listView.addEventListener('input', this._inlineChangeHandler);
    }
  },

  // ============================================================
  // LOAD & RENDER TABLE
  // ============================================================
  async loadPOList() {
    const projectId = document.getElementById('selectFilterPOProject')?.value || '';
    const supplierFilter = document.getElementById('selectFilterPOSupplier')?.value || '';

    if (projectId !== this._currentProjectId) {
      this._pendingItems = [];
      this._editedItems = {};
      this._currentProjectId = projectId;
    }

    if (!projectId) {
      document.getElementById('poTableBody').innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">Pilih proyek untuk melihat dan menambahkan item pembelian</td></tr>';
      document.getElementById('poTableFoot').style.display = 'none';
      document.getElementById('btnSaveAll').style.display = 'none';
      document.getElementById('btnAddItem').style.display = '';
      this._hideStatusBar();
      return;
    }

    document.getElementById('btnAddItem').style.display = '';
    this._updateSaveButton();

    try {
      const [poList] = await Promise.all([DataAccess.getAllPO()]);
      let list = poList.filter(po => po.project_id === projectId);
      if (supplierFilter) list = list.filter(po => (po.supplier || '') === supplierFilter);
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      const supplierSel = document.getElementById('selectFilterPOSupplier');
      if (supplierSel) {
        const currentSupplierVal = supplierSel.value;
        const projectPOs = poList.filter(po => po.project_id === projectId);
        const uniqueSuppliers = [...new Set(projectPOs.map(po => po.supplier || '').filter(Boolean))].sort();
        supplierSel.innerHTML = '<option value="">Semua Toko/Supplier</option>' + uniqueSuppliers.map(s => '<option value="' + UtilityService.escapeHtml(s) + '">' + UtilityService.escapeHtml(s) + '</option>').join('');
        supplierSel.value = currentSupplierVal;
      }

      this._renderTable(list, projectId);
    } catch (err) {
      AppError.handle(err, 'Memuat daftar pembelian');
    }
  },

  _renderTable(existingItems, projectId) {
    const tbody = document.getElementById('poTableBody');
    const tfoot = document.getElementById('poTableFoot');
    if (!tbody) return;

    let html = '';
    html += this._renderInlineAddRow(projectId);

    const pendingItems = this._pendingItems || [];
    let displayIndex = 0;

    pendingItems.forEach(item => {
      displayIndex++;
      html += this._renderPendingRow(item, displayIndex);
    });

    if (existingItems.length === 0 && pendingItems.length === 0) {
      html += '<tr id="noDataRow"><td colspan="10" class="text-center py-3 text-muted">Belum ada item. Gunakan baris di atas untuk menambahkan.</td></tr>';
    } else {
      existingItems.forEach((po) => {
        displayIndex++;
        html += this._renderDataRow(po, displayIndex, projectId);
      });
    }

    tbody.innerHTML = html;
    tfoot.style.display = (existingItems.length > 0 || pendingItems.length > 0) ? 'table-footer-group' : 'none';
    this._updateGrandTotal();
    this._updateSaveButton();
  },

  _renderPendingRow(item, index) {
    const dateValue = UtilityService.toDateInput(item.date) || '';
    const tempId = item.id;
    return '<tr id="pending-' + tempId + '" class="table-warning" data-pending-id="' + tempId + '" style="background:#fff9db;">' +
      '<td class="text-center text-muted"><span class="badge bg-warning text-dark" style="font-size:0.6rem;">BARU</span> ' + index + '</td>' +
      '<td class="editable-field"><input type="date" class="form-control form-control-sm edit-value po-inline-date" value="' + dateValue + '" style="min-width:120px;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'date\', this.value)"></td>' +
      '<td class="editable-field"><input type="text" class="form-control form-control-sm edit-value po-inline-supplier" value="' + UtilityService.escapeHtml(item.supplier || '') + '" placeholder="Toko/Supplier" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'supplier\', this.value)"></td>' +
      '<td class="editable-field"><input type="text" class="form-control form-control-sm edit-value po-inline-name" value="' + UtilityService.escapeHtml(item.material_name || '') + '" placeholder="Nama material" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'material_name\', this.value)"></td>' +
      '<td class="editable-field"><input type="text" class="form-control form-control-sm edit-value po-inline-spec" value="' + UtilityService.escapeHtml(item.specification || '') + '" placeholder="Spesifikasi" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'specification\', this.value)"></td>' +
      '<td class="editable-field text-center"><input type="number" class="form-control form-control-sm edit-value po-inline-qty" value="' + (item.quantity || 0) + '" min="0" step="any" style="width:70px;margin:0 auto;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'quantity\', parseFloat(this.value)||0); ProcurementPage.recalcPendingTotal(\'' + tempId + '\');"></td>' +
      '<td class="editable-field text-center"><input type="text" class="form-control form-control-sm edit-value po-inline-unit" value="' + UtilityService.escapeHtml(item.unit || '') + '" placeholder="pcs" style="width:70px;margin:0 auto;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'unit\', this.value)"></td>' +
      '<td class="editable-field text-end"><input type="number" class="form-control form-control-sm edit-value po-inline-price" value="' + (item.unit_price || 0) + '" min="0" style="width:120px;" onchange="ProcurementPage.updatePendingField(\'' + tempId + '\', \'unit_price\', parseFloat(this.value)||0); ProcurementPage.recalcPendingTotal(\'' + tempId + '\');"></td>' +
      '<td class="text-end"><strong class="row-total">' + UtilityService.formatCurrency(item.total_price) + '</strong></td>' +
      '<td class="text-center"><button class="btn btn--xs btn--outline-danger" data-action="delete-pending" data-id="' + tempId + '" title="Hapus dari daftar"><i class="bi bi-trash"></i></button></td>' +
      '</tr>';
  },

  _renderDataRow(po, index, projectId) {
    const dateValue = UtilityService.toDateInput(po.date) || '';
    const itemId = po.id;
    const isEditing = !!this._editedItems[itemId];
    
    const displayStyle = isEditing ? 'display:none;' : '';
    const editStyle = isEditing ? '' : 'display:none;';
    const rowBg = isEditing ? 'background:#fffbeb;border-left:3px solid var(--color-warning);' : '';
    
    let html = '<tr id="row-' + itemId + '" data-item-id="' + itemId + '" style="' + rowBg + '">';
    html += '<td class="text-center text-muted">' + index + '</td>';
    
    // Date
    html += '<td class="editable-field">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.formatDate(po.date) + '</span>';
    html += '<input type="date" class="form-control form-control-sm edit-value po-inline-date" value="' + dateValue + '" style="' + editStyle + 'min-width:120px;">';
    html += '</td>';
    
    // Supplier
    html += '<td class="editable-field">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(po.supplier || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-supplier" value="' + UtilityService.escapeHtml(po.supplier || '') + '" style="' + editStyle + '" placeholder="Toko/Supplier">';
    html += '</td>';
    
    // Material Name
    html += '<td class="editable-field">';
    html += '<span class="display-value" style="' + displayStyle + '"><strong>' + UtilityService.escapeHtml(po.material_name || '-') + '</strong></span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-name" value="' + UtilityService.escapeHtml(po.material_name || '') + '" style="' + editStyle + '" placeholder="Nama material">';
    html += '</td>';
    
    // Specification
    html += '<td class="editable-field">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(po.specification || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-spec" value="' + UtilityService.escapeHtml(po.specification || '') + '" style="' + editStyle + '" placeholder="Spesifikasi">';
    html += '</td>';
    
    // Quantity
    html += '<td class="editable-field text-center">';
    html += '<span class="display-value" style="' + displayStyle + '">' + (po.quantity || 0) + '</span>';
    html += '<input type="number" class="form-control form-control-sm edit-value po-inline-qty" value="' + (po.quantity || 0) + '" min="0" step="any" style="' + editStyle + 'width:70px;margin:0 auto;">';
    html += '</td>';
    
    // Unit
    html += '<td class="editable-field text-center">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.escapeHtml(po.unit || '-') + '</span>';
    html += '<input type="text" class="form-control form-control-sm edit-value po-inline-unit" value="' + UtilityService.escapeHtml(po.unit || '') + '" style="' + editStyle + 'width:70px;margin:0 auto;" placeholder="pcs">';
    html += '</td>';
    
    // Unit Price
    html += '<td class="editable-field text-end">';
    html += '<span class="display-value" style="' + displayStyle + '">' + UtilityService.formatCurrency(po.unit_price) + '</span>';
    html += '<input type="number" class="form-control form-control-sm edit-value po-inline-price" value="' + (po.unit_price || 0) + '" min="0" style="' + editStyle + 'width:120px;">';
    html += '</td>';
    
    // Total
    html += '<td class="text-end"><strong class="row-total">' + UtilityService.formatCurrency(po.total_price) + '</strong></td>';
    
    // Actions
    html += '<td class="text-center">';
    html += '<button class="btn btn--xs btn--outline-warning me-1 edit-btn" data-action="edit" data-id="' + itemId + '" style="' + displayStyle + '" title="Edit item"><i class="bi bi-pencil"></i></button>';
    html += '<button class="btn btn--xs btn--outline-danger delete-btn" data-action="delete" data-id="' + itemId + '" style="' + displayStyle + '" title="Hapus item"><i class="bi bi-trash"></i></button>';
    html += '<button class="btn btn--xs btn--success save-btn" data-action="save-inline" data-id="' + itemId + '" style="' + editStyle + '" title="Simpan perubahan"><i class="bi bi-check-lg"></i></button>';
    html += '<button class="btn btn--xs btn--outline-secondary cancel-btn" data-action="cancel-edit" data-id="' + itemId + '" style="' + editStyle + '" title="Batal edit"><i class="bi bi-x-lg"></i></button>';
    html += '</td>';
    html += '</tr>';
    
    return html;
  },

  _renderInlineAddRow(projectId) {
    const today = new Date().toISOString().split('T')[0];
    return '<tr id="inlineAddRow" class="table-active" data-new-item="true">' +
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

  // ============================================================
  // PENDING ITEM MANAGEMENT
  // ============================================================
  queueAddItem() {
    const row = document.getElementById('inlineAddRow');
    if (!row) return;

    const projectId = document.getElementById('selectFilterPOProject')?.value;
    if (!projectId) {
      UIService.showToast('Pilih proyek terlebih dahulu!', 'warning');
      return;
    }

    const materialName = row.querySelector('.po-inline-name')?.value?.trim();
    if (!materialName) {
      UIService.showToast('Nama material wajib diisi!', 'warning');
      const inputName = row.querySelector('.po-inline-name');
      if (inputName) inputName.focus();
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
      const qtyInput = row.querySelector('.po-inline-qty');
      if (qtyInput) qtyInput.focus();
      return;
    }

    const totalPrice = quantity * unitPrice;
    const tempId = 'pending_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    if (!this._pendingItems) this._pendingItems = [];
    this._pendingItems.push({
      id: tempId,
      project_id: projectId,
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

    this.loadPOList();
    this._updateSaveButton();
    this._showStatusBar(this._pendingItems.length + ' item menunggu disimpan. Klik "Simpan Data" untuk menyimpan ke server.');
    UIService.showToast('"' + materialName + '" ditambahkan ke daftar (belum disimpan)', 'info');
  },

  removePendingItem(tempId) {
    this._pendingItems = (this._pendingItems || []).filter(item => item.id !== tempId);
    this.loadPOList();
    this._updateSaveButton();
    
    if (this._pendingItems.length === 0 && Object.keys(this._editedItems).length === 0) {
      this._hideStatusBar();
    } else {
      this._showStatusBar((this._pendingItems.length + Object.keys(this._editedItems).length) + ' item menunggu disimpan.');
    }
    UIService.showToast('Item dihapus dari daftar.', 'warning');
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
    this._updateGrandTotal();
  },

  recalcPendingTotal(tempId) {
    const item = (this._pendingItems || []).find(i => i.id === tempId);
    if (!item) return;
    item.total_price = item.quantity * item.unit_price;
    
    const totalEl = document.querySelector('#pending-' + tempId + ' .row-total');
    if (totalEl) {
      totalEl.textContent = UtilityService.formatCurrency(item.total_price);
    }
    this._updateGrandTotal();
  },

  // ============================================================
  // INLINE EDIT
  // ============================================================
  editInlineRow(id) {
    const row = document.getElementById('row-' + id);
    if (!row) return;
    
    this._editedItems[id] = true;

    row.querySelectorAll('.display-value').forEach(el => el.style.display = 'none');
    row.querySelectorAll('.edit-value').forEach(el => el.style.display = '');

    row.querySelector('.edit-btn').style.display = 'none';
    row.querySelector('.delete-btn').style.display = 'none';
    row.querySelector('.save-btn').style.display = '';
    row.querySelector('.cancel-btn').style.display = '';

    row.style.background = '#fffbeb';
    row.style.borderLeft = '3px solid var(--color-warning)';

    this._updateSaveButton();
    this._showStatusBar('Ada item yang sedang diedit. Klik "Simpan Data" untuk menyimpan semua perubahan.');
  },

  cancelEditRow(id) {
    delete this._editedItems[id];
    this.loadPOList();
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
    this.loadPOList();
    this._updateSaveButton();
    this._checkPendingEdits();
    UIService.showToast('Perubahan dicatat. Klik "Simpan Data" untuk menyimpan ke server.', 'info');
  },

  // ============================================================
  // DELETE
  // ============================================================
  async deletePOConfirm(id) {
    UtilityService.showConfirmDialog('Hapus item ini?', async () => {
      try {
        await DataAccess.deletePO(id);
        await this.loadPOList();
        UIService.showToast('Item dihapus.', 'warning');
      } catch (err) { AppError.handle(err, 'Menghapus item pembelian'); }
    });
  },

  // ============================================================
  // SAVE ALL ITEMS
  // ============================================================
  async saveAllItems() {
    const projectId = document.getElementById('selectFilterPOProject')?.value;
    if (!projectId) {
      UIService.showToast('Pilih proyek terlebih dahulu!', 'warning');
      return;
    }

    const itemsToSave = [];
    const now = new Date().toISOString();

    // Kumpulkan pending items
    (this._pendingItems || []).forEach(item => {
      itemsToSave.push({
        id: 'po_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        project_id: projectId,
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

    // Kumpulkan edited items
    const rows = document.querySelectorAll('#poTableBody tr[data-item-id]');
    for (const row of rows) {
      const itemId = row.getAttribute('data-item-id');
      const isEditing = row.querySelector('.save-btn')?.style.display !== 'none';
      
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

        itemsToSave.push({
          id: itemId,
          project_id: projectId,
          material_name: materialName,
          specification,
          quantity,
          unit,
          unit_price: unitPrice,
          total_price: totalPrice,
          supplier,
          date: dateVal,
          updated_at: new Date().toISOString()
        });
      }
    }

    if (itemsToSave.length === 0) {
      UIService.showToast('Tidak ada perubahan yang perlu disimpan.', 'info');
      return;
    }

    const saveBtn = document.getElementById('btnSaveAll');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan...';
    }

    try {
      const operations = itemsToSave.map(item => ({
        sheet: 'procurement',
        data: item
      }));

      await DB.batchUpsert(operations);
      
      this._pendingItems = [];
      this._editedItems = {};
      AppCache.invalidateRelated('procurement', { projectId });
      
      await this.loadPOList();
      this._hideStatusBar();
      UIService.showToast(itemsToSave.length + ' item berhasil disimpan!', 'success');
    } catch (err) {
      AppError.handle(err, 'Menyimpan item pembelian');
      
      try {
        let savedCount = 0;
        for (const item of itemsToSave) {
          try {
            await DataAccess.savePO(item);
            savedCount++;
          } catch (singleErr) {
            console.error('[ProcurementPage] Gagal simpan item:', item.id, singleErr);
          }
        }
        if (savedCount > 0) {
          this._pendingItems = [];
          this._editedItems = {};
          AppCache.invalidateRelated('procurement', { projectId });
          await this.loadPOList();
          this._hideStatusBar();
          UIService.showToast(savedCount + '/' + itemsToSave.length + ' item berhasil disimpan!', 'success');
        }
      } catch (fallbackErr) {
        AppError.handle(fallbackErr, 'Menyimpan item (fallback)');
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-save"></i> Simpan Data';
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
    this._updateGrandTotal();
  },

  _updateGrandTotal() {
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
  },

  // ============================================================
  // STATUS BAR & BUTTON MANAGEMENT
  // ============================================================
  _updateSaveButton() {
    const saveBtn = document.getElementById('btnSaveAll');
    const countEl = document.getElementById('btnSaveCount');
    const pendingCount = (this._pendingItems || []).length;
    const editedCount = Object.keys(this._editedItems || {}).length;
    const total = pendingCount + editedCount;

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
    const pendingCount = (this._pendingItems || []).length;
    const editedCount = Object.keys(this._editedItems || {}).length;
    const total = pendingCount + editedCount;
    
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