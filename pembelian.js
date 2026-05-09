// pembelian.js — Procurement (async Google Sheets) - Inline Add with Action Buttons

const ProcurementPage = {
  _cachedProjects: [],
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
        <!-- ACTION BUTTONS -->
        <div class="d-flex gap-2">
          <button class="btn btn--primary" onclick="ProcurementPage.addEmptyRow()" id="btnAddItem">
            <i class="bi bi-plus-lg"></i> Tambah Item
          </button>
          <button class="btn btn--success" onclick="ProcurementPage.saveAllItems()" id="btnSaveAll" style="display:none;">
            <i class="bi bi-save"></i> Simpan Data
          </button>
          <button class="btn btn--outline-info" onclick="ProcurementPage.loadPOList()" id="btnRefresh">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>
    <div id="procurementListView">
      <!-- Tabel akan dirender oleh loadPOList() setelah proyek dipilih -->
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
      
      <!-- Status bar untuk item yang belum disimpan -->
      <div id="poStatusBar" class="mt-2" style="display:none;">
        <div class="flow-alert flow-alert--warning">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <span id="poStatusText">Ada perubahan yang belum disimpan.</span>
        </div>
      </div>
    </div>`;
  },

  async init() {
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
    // Tidak auto-load, tunggu user pilih proyek
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
        if (action === 'add-inline') ProcurementPage.addEmptyRow();
      };
      listView.addEventListener('click', this._listClickHandler);

      // Handle input changes for calculations
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

    if (!projectId) {
      document.getElementById('poTableBody').innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">Pilih proyek untuk melihat dan menambahkan item pembelian</td></tr>';
      document.getElementById('poTableFoot').style.display = 'none';
      document.getElementById('btnSaveAll').style.display = 'none';
      document.getElementById('btnAddItem').style.display = '';
      this._hideStatusBar();
      return;
    }

    // Tampilkan tombol aksi
    document.getElementById('btnAddItem').style.display = '';
    document.getElementById('btnSaveAll').style.display = 'none';
    this._hideStatusBar();

    try {
      const [poList] = await Promise.all([DataAccess.getAllPO()]);
      let list = poList.filter(po => po.project_id === projectId);
      if (supplierFilter) list = list.filter(po => (po.supplier || '') === supplierFilter);
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      // Update supplier filter dropdown
      const supplierSel = document.getElementById('selectFilterPOSupplier');
      if (supplierSel) {
        const currentSupplierVal = supplierSel.value;
        const projectPOs = poList.filter(po => po.project_id === projectId);
        const uniqueSuppliers = [...new Set(projectPOs.map(po => po.supplier || '').filter(Boolean))].sort();
        supplierSel.innerHTML = '<option value="">Semua Toko/Supplier</option>' + uniqueSuppliers.map(s => `<option value="${UtilityService.escapeHtml(s)}">${UtilityService.escapeHtml(s)}</option>`).join('');
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

    // Baris form penambahan item di PALING ATAS
    html += this._renderInlineAddRow(projectId);

    // Baris data existing
    if (existingItems.length === 0) {
      html += '<tr id="noDataRow"><td colspan="10" class="text-center py-3 text-muted">Belum ada item. Gunakan baris di atas untuk menambahkan.</td></tr>';
    } else {
      existingItems.forEach((po, i) => {
        html += this._renderDataRow(po, i + 1);
      });
    }

    tbody.innerHTML = html;
    tfoot.style.display = 'table-footer-group';
    this._updateGrandTotal();
  },

  _renderDataRow(po, index) {
    const dateValue = UtilityService.toDateInput(po.date) || '';
    return `<tr id="row-${po.id}" data-item-id="${po.id}">
      <td class="text-center text-muted">${index}</td>
      <td class="editable-field">
        <span class="display-value">${UtilityService.formatDate(po.date)}</span>
        <input type="date" class="form-control form-control-sm edit-value po-inline-date" value="${dateValue}" style="display:none;min-width:120px;">
      </td>
      <td class="editable-field">
        <span class="display-value">${UtilityService.escapeHtml(po.supplier || '-')}</span>
        <input type="text" class="form-control form-control-sm edit-value po-inline-supplier" value="${UtilityService.escapeHtml(po.supplier || '')}" style="display:none;" placeholder="Toko/Supplier">
      </td>
      <td class="editable-field">
        <span class="display-value"><strong>${UtilityService.escapeHtml(po.material_name || '-')}</strong></span>
        <input type="text" class="form-control form-control-sm edit-value po-inline-name" value="${UtilityService.escapeHtml(po.material_name || '')}" style="display:none;" placeholder="Nama material">
      </td>
      <td class="editable-field">
        <span class="display-value">${UtilityService.escapeHtml(po.specification || '-')}</span>
        <input type="text" class="form-control form-control-sm edit-value po-inline-spec" value="${UtilityService.escapeHtml(po.specification || '')}" style="display:none;" placeholder="Spesifikasi">
      </td>
      <td class="editable-field text-center">
        <span class="display-value">${po.quantity || 0}</span>
        <input type="number" class="form-control form-control-sm edit-value po-inline-qty" value="${po.quantity || 0}" min="0" step="any" style="display:none;width:70px;margin:0 auto;">
      </td>
      <td class="editable-field text-center">
        <span class="display-value">${UtilityService.escapeHtml(po.unit || '-')}</span>
        <input type="text" class="form-control form-control-sm edit-value po-inline-unit" value="${UtilityService.escapeHtml(po.unit || '')}" style="display:none;width:70px;margin:0 auto;" placeholder="pcs">
      </td>
      <td class="editable-field text-end">
        <span class="display-value">${UtilityService.formatCurrency(po.unit_price)}</span>
        <input type="number" class="form-control form-control-sm edit-value po-inline-price" value="${po.unit_price || 0}" min="0" style="display:none;width:120px;">
      </td>
      <td class="text-end">
        <strong class="row-total">${UtilityService.formatCurrency(po.total_price)}</strong>
      </td>
      <td class="text-center">
        <button class="btn btn--xs btn--outline-warning me-1 edit-btn" data-action="edit" data-id="${po.id}" title="Edit item">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn--xs btn--outline-danger delete-btn" data-action="delete" data-id="${po.id}" title="Hapus item">
          <i class="bi bi-trash"></i>
        </button>
        <button class="btn btn--xs btn--success save-btn" data-action="save-inline" data-id="${po.id}" style="display:none;" title="Simpan perubahan">
          <i class="bi bi-check-lg"></i>
        </button>
        <button class="btn btn--xs btn--outline-secondary cancel-btn" data-action="cancel-edit" data-id="${po.id}" style="display:none;" title="Batal edit">
          <i class="bi bi-x-lg"></i>
        </button>
      </td>
    </tr>`;
  },

  _renderInlineAddRow(projectId) {
    const today = new Date().toISOString().split('T')[0];
    // Baris ini akan selalu menjadi baris pertama dalam tabel
    return `<tr id="inlineAddRow" class="table-active" data-new-item="true">
      <td class="text-center text-muted fw-bold"><i class="bi bi-plus-circle text-primary"></i></td>
      <td>
        <input type="date" class="form-control form-control-sm po-inline-date" value="${today}" style="min-width:100px;">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm po-inline-supplier" placeholder="Toko/Supplier">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm po-inline-name" placeholder="Nama material *" id="inlineMaterialName">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm po-inline-spec" placeholder="Spesifikasi">
      </td>
      <td class="text-center">
        <input type="number" class="form-control form-control-sm po-inline-qty" value="1" min="0" step="any" style="width:70px;margin:0 auto;">
      </td>
      <td class="text-center">
        <input type="text" class="form-control form-control-sm po-inline-unit" placeholder="pcs" style="width:70px;margin:0 auto;">
      </td>
      <td class="text-end">
        <input type="number" class="form-control form-control-sm po-inline-price" value="0" min="0" style="width:120px;">
      </td>
      <td class="text-end">
        <strong class="row-total">Rp 0</strong>
      </td>
      <td class="text-center">
        <button class="btn btn--xs btn--primary" data-action="add-inline" title="Tambah Item ke Daftar">
          <i class="bi bi-plus-lg"></i> Add
        </button>
      </td>
    </tr>`;
  },

  // ============================================================
  // INLINE ADD
  // ============================================================
  async addEmptyRow() {
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
    const now = new Date().toISOString();
    const newId = 'po_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const newPO = {
      id: newId,
      project_id: projectId,
      material_name: materialName,
      specification,
      quantity,
      unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      supplier,
      date: dateVal,
      created_at: now
    };

    try {
      await DataAccess.savePO(newPO);
      UIService.showToast('Item berhasil ditambahkan!', 'success');
      // Reset inline form fields
      row.querySelector('.po-inline-name').value = '';
      row.querySelector('.po-inline-spec').value = '';
      row.querySelector('.po-inline-qty').value = '1';
      row.querySelector('.po-inline-unit').value = '';
      row.querySelector('.po-inline-price').value = '0';
      row.querySelector('.po-inline-supplier').value = '';
      row.querySelector('.row-total').textContent = 'Rp 0';
      // Reload untuk menampilkan data terbaru
      await this.loadPOList();
    } catch (err) {
      AppError.handle(err, 'Menambahkan item pembelian');
    }
  },

  // ============================================================
  // SAVE ALL ITEMS (Batch Save)
  // ============================================================
  async saveAllItems() {
    const projectId = document.getElementById('selectFilterPOProject')?.value;
    if (!projectId) {
      UIService.showToast('Pilih proyek terlebih dahulu!', 'warning');
      return;
    }

    // Kumpulkan semua item yang sedang dalam mode edit
    const editedItems = [];
    const rows = document.querySelectorAll('#poTableBody tr[data-item-id]');
    
    for (const row of rows) {
      const itemId = row.getAttribute('data-item-id');
      const isEditing = row.querySelector('.save-btn')?.style.display !== 'none';
      
      if (isEditing) {
        const materialName = row.querySelector('.po-inline-name')?.value?.trim();
        if (!materialName) {
          UIService.showToast(`Nama material untuk item ${itemId} wajib diisi!`, 'warning');
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
          UIService.showToast(`Qty untuk item ${materialName} harus lebih dari 0!`, 'warning');
          return;
        }

        editedItems.push({
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

    if (editedItems.length === 0) {
      UIService.showToast('Tidak ada perubahan yang perlu disimpan.', 'info');
      return;
    }

    // Konfirmasi sebelum menyimpan
    UtilityService.showConfirmDialog(
      `Simpan ${editedItems.length} item yang telah diubah?`,
      async () => {
        const saveBtn = document.getElementById('btnSaveAll');
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan...';
        }

        try {
          // Gunakan batch save untuk performa lebih baik
          await DataAccess.saveMultiplePO(editedItems);
          UIService.showToast(`${editedItems.length} item berhasil disimpan!`, 'success');
          await this.loadPOList();
          this._hideStatusBar();
        } catch (err) {
          AppError.handle(err, 'Menyimpan item pembelian');
          // Fallback: simpan satu per satu
          try {
            let savedCount = 0;
            for (const item of editedItems) {
              try {
                await DataAccess.savePO(item);
                savedCount++;
              } catch (singleErr) {
                console.error('[ProcurementPage] Gagal simpan item:', item.id, singleErr);
              }
            }
            if (savedCount > 0) {
              UIService.showToast(`${savedCount}/${editedItems.length} item berhasil disimpan!`, 'success');
              await this.loadPOList();
            }
          } catch (fallbackErr) {
            AppError.handle(fallbackErr, 'Menyimpan item (fallback)');
          }
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-save"></i> Simpan Data';
          }
        }
      }
    );
  },

  // ============================================================
  // INLINE EDIT
  // ============================================================
  editInlineRow(id) {
    const row = document.getElementById(`row-${id}`);
    if (!row) return;

    // Sembunyikan display values, tampilkan input
    row.querySelectorAll('.display-value').forEach(el => el.style.display = 'none');
    row.querySelectorAll('.edit-value').forEach(el => el.style.display = '');

    // Toggle buttons
    row.querySelector('.edit-btn').style.display = 'none';
    row.querySelector('.delete-btn').style.display = 'none';
    row.querySelector('.save-btn').style.display = '';
    row.querySelector('.cancel-btn').style.display = '';

    // Highlight row yang sedang diedit
    row.style.background = '#fffbeb';
    row.style.borderLeft = '3px solid var(--color-warning)';

    // Tampilkan tombol Simpan Data dan status bar
    this._showSaveButton();
    this._showStatusBar('Ada item yang sedang diedit. Klik "Simpan Data" untuk menyimpan semua perubahan.');
  },

  cancelEditRow(id) {
    // Reload list untuk mengembalikan ke tampilan normal
    this.loadPOList();
    this._checkPendingEdits();
  },

  async saveInlineRow(id) {
    const row = document.getElementById(`row-${id}`);
    if (!row) return;

    const projectId = document.getElementById('selectFilterPOProject')?.value;
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
    const totalPrice = quantity * unitPrice;

    const updatedPO = {
      id,
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
    };

    try {
      await DataAccess.savePO(updatedPO);
      UIService.showToast('Item berhasil diperbarui!', 'success');
      await this.loadPOList();
      this._checkPendingEdits();
    } catch (err) {
      AppError.handle(err, 'Memperbarui item pembelian');
    }
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
      // Ambil nilai dari display atau edit mode
      let qty, price;
      
      const qtyDisplay = row.querySelector('.po-inline-qty');
      if (qtyDisplay && qtyDisplay.style.display !== 'none') {
        qty = parseFloat(qtyDisplay.value || 0);
        price = parseFloat(row.querySelector('.po-inline-price')?.value || 0);
      } else {
        // Ambil dari row-total yang sudah dihitung
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
    
    const totalCell = document.getElementById('poGrandTotalCell');
    if (totalCell) {
      totalCell.textContent = UtilityService.formatCurrency(total);
    }
  },

  // ============================================================
  // STATUS BAR & BUTTON MANAGEMENT
  // ============================================================
  _showSaveButton() {
    const saveBtn = document.getElementById('btnSaveAll');
    if (saveBtn) {
      saveBtn.style.display = '';
    }
  },

  _hideSaveButton() {
    const saveBtn = document.getElementById('btnSaveAll');
    if (saveBtn) {
      saveBtn.style.display = 'none';
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
    const hasEdits = document.querySelector('#poTableBody .save-btn[style*="display:"]') !== null ||
                     document.querySelector('#poTableBody .save-btn:not([style*="display: none"])')?.style.display !== 'none';
    
    if (hasEdits) {
      this._showSaveButton();
      this._showStatusBar();
    } else {
      this._hideSaveButton();
      this._hideStatusBar();
    }
  }
};

export { ProcurementPage };