// pembelian.js — Procurement with Multiple Inline Rows Before Save

const ProcurementPage = {
  _cachedProjects: [],
  _savedItems: [],           // Item yang sudah tersimpan di database
  _pendingItems: [],         // Item baru yang belum disimpan (multiple rows)
  _editedItems: [],          // Item existing yang diedit (perubahan belum disimpan)
  _nextPendingId: 1,
  _isSaving: false,

  render() {
    return `
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
        <div class="page-header__filter">
          <select class="form-select" id="selectFilterPOProject" onchange="ProcurementPage.onProjectChange()">
            <option value="">-- Pilih Proyek --</option>
          </select>
        </div>
        <div class="page-header__filter">
          <select class="form-select" id="selectFilterPOSupplier" onchange="ProcurementPage.filterBySupplier()">
            <option value="">Semua Toko/Supplier</option>
          </select>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn--primary" onclick="ProcurementPage.addNewRow()" id="btnAddRow">
            <i class="bi bi-plus-lg"></i> Tambah Baris
          </button>
          <button class="btn btn--success" onclick="ProcurementPage.saveAllChanges()" id="btnSaveAll" style="display:none;">
            <i class="bi bi-save"></i> Simpan Semua (<span id="pendingCount">0</span>)
          </button>
          <button class="btn btn--outline-info" onclick="ProcurementPage.refreshData()">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>

      <div id="procurementListView">
        <div id="poTableContainer">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span><i class="bi bi-cart"></i> Daftar Item Pembelian</span>
              <span class="badge bg-info" id="savedItemsCount">0 item tersimpan</span>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive" style="max-height: 70vh; overflow-y: auto;">
                <table class="table table--hover mb-0" id="poMainTable">
                  <thead style="position: sticky; top: 0; background: white; z-index: 10;">
                    <tr>
                      <th class="col-width-40">No</th>
                      <th style="min-width: 100px;">Tanggal</th>
                      <th style="min-width: 150px;">Toko/Supplier</th>
                      <th style="min-width: 180px;">Nama Material <span class="text-danger">*</span></th>
                      <th style="min-width: 180px;">Spesifikasi</th>
                      <th class="col-width-80">Qty</th>
                      <th class="col-width-80">Unit</th>
                      <th class="col-width-130">Harga Satuan</th>
                      <th class="col-width-130">Total</th>
                      <th class="col-width-100">Status</th>
                      <th class="col-width-80">Aksi</th>
                    </tr>
                  </thead>
                  <tbody id="poTableBody">
                    <tr>
                      <td colspan="11" class="text-center py-4 text-muted">
                        Pilih proyek untuk melihat dan menambahkan item pembelian
                      </td>
                    </tr>
                  </tbody>
                  <tfoot id="poTableFoot" style="display:none;">
                    <tr class="fw-bold" style="background:#f0f9ff;">
                      <td colspan="8" class="text-end">TOTAL KESELURUHAN:</td>
                      <td class="text-end" id="poGrandTotalCell">Rp 0</td>
                      <td colspan="2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div class="card-footer no-print" id="actionFooter" style="display:none;">
              <div class="d-flex justify-content-between align-items-center">
                <div class="text-muted">
                  <i class="bi bi-info-circle"></i> 
                  <span id="footerStatusText">Item dengan latar <span style="background:#fffbeb; padding:2px 6px; border-radius:4px;">kuning</span> adalah item baru/perubahan yang belum disimpan.</span>
                </div>
                <button class="btn btn--success" onclick="ProcurementPage.saveAllChanges()" id="footerSaveAllBtn">
                  <i class="bi bi-save"></i> Simpan Semua (<span id="footerPendingCount">0</span>)
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Toast container untuk notifikasi -->
        <div id="poToastContainer" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999;"></div>
      </div>`;
  },

  async init() {
    this._pendingItems = [];
    this._editedItems = [];
    this._savedItems = [];
    this._nextPendingId = 1;
    this._isSaving = false;
    
    this._cachedProjects = await DataAccess.getAllProjects();
    const sel = document.getElementById('selectFilterPOProject');
    if (sel) {
      sel.innerHTML = '<option value="">-- Pilih Proyek --</option>';
      this._cachedProjects.forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        sel.appendChild(o);
      });
    }
  },

  async onProjectChange() {
    const projectId = document.getElementById('selectFilterPOProject')?.value;
    
    // Reset semua state
    this._pendingItems = [];
    this._editedItems = [];
    this._nextPendingId = 1;
    
    if (!projectId) {
      document.getElementById('poTableBody').innerHTML = `
        <tr><td colspan="11" class="text-center py-4 text-muted">
          Pilih proyek untuk melihat dan menambahkan item pembelian
        </td></tr>`;
      document.getElementById('poTableFoot').style.display = 'none';
      document.getElementById('actionFooter').style.display = 'none';
      document.getElementById('btnSaveAll').style.display = 'none';
      
      const supplierSel = document.getElementById('selectFilterPOSupplier');
      if (supplierSel) supplierSel.innerHTML = '<option value="">Semua Toko/Supplier</option>';
      
      const savedCountSpan = document.getElementById('savedItemsCount');
      if (savedCountSpan) savedCountSpan.textContent = '0 item tersimpan';
      return;
    }

    document.getElementById('actionFooter').style.display = '';
    await this.loadSavedItems();
  },

  filterBySupplier() {
    this.renderTable();
  },

  async loadSavedItems() {
    const projectId = document.getElementById('selectFilterPOProject')?.value;
    if (!projectId) return;

    try {
      const poList = await DataAccess.getAllPO();
      this._savedItems = poList.filter(po => po.project_id === projectId);
      this._savedItems.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      
      // Update supplier filter dropdown
      const supplierSel = document.getElementById('selectFilterPOSupplier');
      if (supplierSel) {
        const currentVal = supplierSel.value;
        const uniqueSuppliers = [...new Set(this._savedItems.map(po => po.supplier || '').filter(Boolean))].sort();
        supplierSel.innerHTML = '<option value="">Semua Toko/Supplier</option>' + 
          uniqueSuppliers.map(s => `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`).join('');
        supplierSel.value = currentVal;
      }
      
      this.renderTable();
    } catch (err) {
      this.showToast('Gagal memuat data: ' + err.message, 'danger');
    }
  },

  refreshData() {
    this.loadSavedItems();
    this.showToast('Data diperbarui', 'info');
  },

  renderTable() {
    const projectId = document.getElementById('selectFilterPOProject')?.value;
    if (!projectId) return;
    
    const supplierFilter = document.getElementById('selectFilterPOSupplier')?.value || '';
    const tbody = document.getElementById('poTableBody');
    const tfoot = document.getElementById('poTableFoot');
    if (!tbody) return;

    // Filter saved items
    let displaySavedItems = [...this._savedItems];
    if (supplierFilter) {
      displaySavedItems = displaySavedItems.filter(po => (po.supplier || '') === supplierFilter);
    }

    // Dapatkan ID item yang sedang diedit
    const editedItemIds = new Set(this._editedItems.map(item => item.id));
    
    // Gabungkan: saved items (kecuali yang sedang diedit) + edited items + pending items
    const savedItemsWithoutEdited = displaySavedItems.filter(item => !editedItemIds.has(item.id));
    
    // Semua item untuk ditampilkan
    const allItems = [
      ...savedItemsWithoutEdited.map(item => ({ ...item, _rowType: 'saved', _isEdited: false })),
      ...this._editedItems.map(item => ({ ...item, _rowType: 'edited', _isEdited: true })),
      ...this._pendingItems.map(item => ({ ...item, _rowType: 'pending', _isEdited: false }))
    ];

    if (allItems.length === 0) {
      // Tampilkan baris kosong dengan tombol tambah
      tbody.innerHTML = `
        <tr id="emptyRow">
          <td colspan="11" class="text-center py-4">
            <div class="empty-state">
              <div class="empty-state__icon"><i class="bi bi-cart-x"></i></div>
              <p>Belum ada item pembelian</p>
              <button class="btn btn--primary btn-sm" onclick="ProcurementPage.addNewRow()">
                <i class="bi bi-plus-lg"></i> Tambah Item Pertama
              </button>
            </div>
          </td>
        </tr>`;
      tfoot.style.display = 'none';
      this.updateSavedCount(0);
      this.updatePendingUI();
      return;
    }

    let html = '';
    let grandTotal = 0;
    let savedCount = 0;
    let pendingCount = 0;
    let editedCount = 0;

    allItems.forEach((item, idx) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || 0;
      const total = quantity * unitPrice;
      grandTotal += total;
      
      if (item._rowType === 'saved') savedCount++;
      if (item._rowType === 'pending') pendingCount++;
      if (item._rowType === 'edited') editedCount++;
      
      // Tentukan style baris berdasarkan tipe
      let rowClass = '';
      let statusBadge = '';
      let deleteHandler = '';
      let editHandler = '';
      
      if (item._rowType === 'pending') {
        rowClass = 'style="background:#fffbeb;"';
        statusBadge = '<span class="badge bg-warning text-dark"><i class="bi bi-clock-history"></i> Baru</span>';
        deleteHandler = `onclick="ProcurementPage.removePendingRow('${item._tempId}')"`;
      } else if (item._rowType === 'edited') {
        rowClass = 'style="background:#e0f2fe;"';
        statusBadge = '<span class="badge bg-info"><i class="bi bi-pencil-square"></i> Diubah</span>';
        deleteHandler = `onclick="ProcurementPage.cancelEdit('${item.id}')"`;
      } else {
        rowClass = '';
        statusBadge = '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Tersimpan</span>';
        deleteHandler = `onclick="ProcurementPage.deleteSavedItem('${item.id}')"`;
        editHandler = `<button class="btn btn--xs btn--outline-warning me-1" onclick="ProcurementPage.startEdit('${item.id}')" title="Edit item">
                         <i class="bi bi-pencil"></i>
                       </button>`;
      }

      // Format tanggal untuk input date
      const dateValue = this.toDateInput(item.date) || new Date().toISOString().split('T')[0];
      
      // Data atribut untuk inline editing
      const dataAttrs = `data-id="${item._tempId || item.id}" 
                         data-row-type="${item._rowType}"
                         data-name="${this.escapeHtml(item.material_name || '')}"
                         data-supplier="${this.escapeHtml(item.supplier || '')}"
                         data-spec="${this.escapeHtml(item.specification || '')}"
                         data-qty="${quantity}"
                         data-unit="${this.escapeHtml(item.unit || '')}"
                         data-price="${unitPrice}"
                         data-date="${dateValue}"`;

      html += `<tr ${rowClass} ${dataAttrs} id="row-${item._tempId || item.id}">
        <td class="text-center text-muted">${idx + 1}</td>
        <td>
          <input type="date" class="form-control form-control-sm inline-date" value="${dateValue}" 
                 style="min-width:100px;" onchange="ProcurementPage.updateInlineField(this, 'date')">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm inline-supplier" value="${this.escapeHtml(item.supplier || '')}" 
                 placeholder="Toko/Supplier" onchange="ProcurementPage.updateInlineField(this, 'supplier')">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm inline-name" value="${this.escapeHtml(item.material_name || '')}" 
                 placeholder="Nama material *" onchange="ProcurementPage.updateInlineField(this, 'name')">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm inline-spec" value="${this.escapeHtml(item.specification || '')}" 
                 placeholder="Spesifikasi" onchange="ProcurementPage.updateInlineField(this, 'spec')">
        </td>
        <td class="text-center">
          <input type="number" class="form-control form-control-sm inline-qty" value="${quantity}" 
                 min="0" step="any" style="width:70px;margin:0 auto;" onchange="ProcurementPage.updateInlineField(this, 'qty')">
        </td>
        <td class="text-center">
          <input type="text" class="form-control form-control-sm inline-unit" value="${this.escapeHtml(item.unit || '')}" 
                 placeholder="pcs" style="width:70px;margin:0 auto;" onchange="ProcurementPage.updateInlineField(this, 'unit')">
        </td>
        <td class="text-end">
          <input type="number" class="form-control form-control-sm inline-price" value="${unitPrice}" 
                 min="0" step="any" style="width:120px;" onchange="ProcurementPage.updateInlineField(this, 'price')">
        </td>
        <td class="text-end">
          <strong class="row-total">${this.formatCurrency(total)}</strong>
        </td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-center">
          ${editHandler}
          <button class="btn btn--xs btn--outline-danger" ${deleteHandler} title="Hapus item">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    });

    tbody.innerHTML = html;
    tfoot.style.display = 'table-footer-group';
    
    const totalCell = document.getElementById('poGrandTotalCell');
    if (totalCell) {
      totalCell.textContent = this.formatCurrency(grandTotal);
    }
    
    this.updateSavedCount(savedCount);
    this.updatePendingUI(pendingCount, editedCount);
  },

  // Tambah baris baru (pending)
  addNewRow() {
    const projectId = document.getElementById('selectFilterPOProject')?.value;
    if (!projectId) {
      this.showToast('Pilih proyek terlebih dahulu!', 'warning');
      return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const newTempId = `pending_${Date.now()}_${this._nextPendingId++}`;
    
    const newItem = {
      _tempId: newTempId,
      _rowType: 'pending',
      id: null,
      project_id: projectId,
      date: today,
      supplier: '',
      material_name: '',
      specification: '',
      quantity: 1,
      unit: '',
      unit_price: 0,
      total_price: 0,
      created_at: new Date().toISOString()
    };
    
    this._pendingItems.push(newItem);
    this.renderTable();
    
    // Scroll ke baris baru
    setTimeout(() => {
      const newRow = document.getElementById(`row-${newTempId}`);
      if (newRow) {
        newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const nameInput = newRow.querySelector('.inline-name');
        if (nameInput) nameInput.focus();
      }
    }, 100);
    
    this.showToast('Baris baru ditambahkan. Isi data dan klik "Simpan Semua".', 'info');
  },

  // Update field inline (tanpa menyimpan ke database)
  updateInlineField(inputElement, fieldType) {
    const row = inputElement.closest('tr');
    if (!row) return;
    
    const itemId = row.getAttribute('data-id');
    const rowType = row.getAttribute('data-row-type');
    let item;
    let itemIndex;
    
    // Cari item berdasarkan tipe
    if (rowType === 'pending') {
      itemIndex = this._pendingItems.findIndex(i => i._tempId === itemId);
      if (itemIndex !== -1) item = this._pendingItems[itemIndex];
    } else if (rowType === 'edited') {
      itemIndex = this._editedItems.findIndex(i => i.id === itemId);
      if (itemIndex !== -1) item = this._editedItems[itemIndex];
    } else {
      // saved item - pindahkan ke edited items
      const savedItem = this._savedItems.find(i => i.id === itemId);
      if (savedItem) {
        // Cek apakah sudah ada di edited items
        let existingEditIndex = this._editedItems.findIndex(i => i.id === itemId);
        if (existingEditIndex === -1) {
          this._editedItems.push({ ...savedItem });
          existingEditIndex = this._editedItems.length - 1;
        }
        item = this._editedItems[existingEditIndex];
        itemIndex = existingEditIndex;
        row.setAttribute('data-row-type', 'edited');
      }
    }
    
    if (!item) return;
    
    // Update nilai berdasarkan field type
    let newValue = inputElement.value;
    let oldValue;
    
    switch (fieldType) {
      case 'name':
        oldValue = item.material_name;
        item.material_name = newValue;
        break;
      case 'supplier':
        oldValue = item.supplier;
        item.supplier = newValue;
        break;
      case 'spec':
        oldValue = item.specification;
        item.specification = newValue;
        break;
      case 'qty':
        oldValue = item.quantity;
        item.quantity = parseFloat(newValue) || 0;
        break;
      case 'unit':
        oldValue = item.unit;
        item.unit = newValue;
        break;
      case 'price':
        oldValue = item.unit_price;
        item.unit_price = parseFloat(newValue) || 0;
        break;
      case 'date':
        oldValue = item.date;
        item.date = newValue;
        break;
    }
    
    // Update total price
    item.total_price = (item.quantity || 0) * (item.unit_price || 0);
    
    // Update row total display
    const totalSpan = row.querySelector('.row-total');
    if (totalSpan) {
      totalSpan.textContent = this.formatCurrency(item.total_price);
    }
    
    // Update grand total
    this.updateGrandTotal();
    
    // Update status badge jika perlu
    if (rowType === 'saved') {
      const statusCell = row.querySelector('td:nth-child(10)');
      if (statusCell) {
        statusCell.innerHTML = '<span class="badge bg-info"><i class="bi bi-pencil-square"></i> Diubah</span>';
      }
      const editBtn = row.querySelector('.btn--outline-warning');
      if (editBtn) editBtn.remove();
    }
  },

  updateGrandTotal() {
    let grandTotal = 0;
    
    // Hitung dari saved items (yang tidak diedit)
    const editedIds = new Set(this._editedItems.map(i => i.id));
    this._savedItems.forEach(item => {
      if (!editedIds.has(item.id)) {
        grandTotal += (item.quantity || 0) * (item.unit_price || 0);
      }
    });
    
    // Hitung dari edited items
    this._editedItems.forEach(item => {
      grandTotal += (item.quantity || 0) * (item.unit_price || 0);
    });
    
    // Hitung dari pending items
    this._pendingItems.forEach(item => {
      grandTotal += (item.quantity || 0) * (item.unit_price || 0);
    });
    
    const totalCell = document.getElementById('poGrandTotalCell');
    if (totalCell) {
      totalCell.textContent = this.formatCurrency(grandTotal);
    }
  },

  // Mulai edit saved item (pindahkan ke edited items)
  startEdit(id) {
    const savedItem = this._savedItems.find(i => i.id === id);
    if (!savedItem) return;
    
    // Cek apakah sudah ada di edited items
    const existingEdit = this._editedItems.find(i => i.id === id);
    if (!existingEdit) {
      this._editedItems.push({ ...savedItem });
    }
    
    this.renderTable();
    this.showToast(`Edit item "${savedItem.material_name}". Simpan perubahan dengan klik "Simpan Semua".`, 'info');
  },

  // Batalkan edit saved item
  cancelEdit(id) {
    const editIndex = this._editedItems.findIndex(i => i.id === id);
    if (editIndex !== -1) {
      this._editedItems.splice(editIndex, 1);
      this.renderTable();
      this.showToast('Perubahan dibatalkan.', 'info');
    }
  },

  // Hapus pending row
  removePendingRow(tempId) {
    const itemIndex = this._pendingItems.findIndex(i => i._tempId === tempId);
    if (itemIndex !== -1) {
      const itemName = this._pendingItems[itemIndex].material_name || 'Item baru';
      this._pendingItems.splice(itemIndex, 1);
      this.renderTable();
      this.showToast(`"${itemName}" dihapus dari daftar.`, 'warning');
    }
  },

  // Hapus saved item (langsung dari database)
  async deleteSavedItem(id) {
    const item = this._savedItems.find(i => i.id === id);
    if (!item) return;
    
    this.showConfirmDialog(`Hapus item "${item.material_name}" dari database?`, async () => {
      try {
        await DataAccess.deletePO(id);
        await this.loadSavedItems();
        this.showToast('Item dihapus.', 'warning');
      } catch (err) {
        this.showToast('Gagal menghapus: ' + err.message, 'danger');
      }
    });
  },

  // Simpan semua perubahan (pending + edited)
  async saveAllChanges() {
    if (this._isSaving) {
      this.showToast('Sedang menyimpan, harap tunggu...', 'info');
      return;
    }
    
    const totalChanges = this._pendingItems.length + this._editedItems.length;
    if (totalChanges === 0) {
      this.showToast('Tidak ada perubahan yang perlu disimpan.', 'info');
      return;
    }
    
    this._isSaving = true;
    
    const saveBtn = document.getElementById('footerSaveAllBtn');
    const topSaveBtn = document.getElementById('btnSaveAll');
    const originalText = saveBtn ? saveBtn.innerHTML : 'Simpan Semua';
    
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan...';
    }
    if (topSaveBtn) {
      topSaveBtn.disabled = true;
      topSaveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan...';
    }
    
    let savedCount = 0;
    let failedItems = [];
    
    try {
      // Siapkan operations untuk batch save
      const operations = [];
      
      // Pending items (insert baru)
      for (const item of this._pendingItems) {
        const { _tempId, _rowType, ...cleanItem } = item;
        operations.push({
          sheet: SHEETS.PROCUREMENT,
          data: {
            ...cleanItem,
            id: `po_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${savedCount}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        });
      }
      
      // Edited items (update)
      for (const item of this._editedItems) {
        operations.push({
          sheet: SHEETS.PROCUREMENT,
          data: {
            ...item,
            updated_at: new Date().toISOString()
          }
        });
      }
      
      if (operations.length > 0) {
        await DB.batchUpsert(operations);
        savedCount = operations.length;
      }
      
      // Bersihkan pending dan edited items
      this._pendingItems = [];
      this._editedItems = [];
      
      // Refresh data dari server
      await this.loadSavedItems();
      
      this.showToast(`${savedCount} item berhasil disimpan!`, 'success');
      
    } catch (err) {
      console.error('[ProcurementPage] Batch save failed:', err);
      this.showToast('Batch save gagal, mencoba menyimpan satu per satu...', 'warning');
      
      // Fallback: simpan satu per satu
      for (const item of this._pendingItems) {
        try {
          const { _tempId, _rowType, ...cleanItem } = item;
          await DataAccess.savePO({
            ...cleanItem,
            id: `po_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          savedCount++;
        } catch (singleErr) {
          failedItems.push(item.material_name || 'Item baru');
        }
      }
      
      for (const item of this._editedItems) {
        try {
          await DataAccess.savePO({
            ...item,
            updated_at: new Date().toISOString()
          });
          savedCount++;
        } catch (singleErr) {
          failedItems.push(item.material_name || 'Item edited');
        }
      }
      
      if (savedCount > 0) {
        this._pendingItems = [];
        this._editedItems = [];
        await this.loadSavedItems();
        
        if (failedItems.length > 0) {
          this.showToast(`${savedCount} item berhasil, ${failedItems.length} gagal: ${failedItems.join(', ')}`, 'warning');
        } else {
          this.showToast(`${savedCount} item berhasil disimpan!`, 'success');
        }
      } else {
        this.showToast('Gagal menyimpan item. Silakan coba lagi.', 'danger');
      }
    }
    
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    }
    if (topSaveBtn) {
      topSaveBtn.disabled = false;
      topSaveBtn.innerHTML = `<i class="bi bi-save"></i> Simpan Semua (<span id="pendingCount">0</span>)`;
    }
    
    this._isSaving = false;
  },

  updateSavedCount(count) {
    const savedCountSpan = document.getElementById('savedItemsCount');
    if (savedCountSpan) {
      savedCountSpan.textContent = `${count} item tersimpan`;
    }
  },

  updatePendingUI(pendingCount = this._pendingItems.length, editedCount = this._editedItems.length) {
    const totalPending = pendingCount + editedCount;
    
    const pendingSpans = document.querySelectorAll('#pendingCount, #footerPendingCount');
    pendingSpans.forEach(span => {
      if (span) span.textContent = totalPending;
    });
    
    const saveAllBtn = document.getElementById('btnSaveAll');
    const footerSaveAllBtn = document.getElementById('footerSaveAllBtn');
    const actionFooter = document.getElementById('actionFooter');
    
    if (totalPending > 0) {
      if (saveAllBtn) saveAllBtn.style.display = '';
      if (footerSaveAllBtn) footerSaveAllBtn.style.display = '';
      if (actionFooter) actionFooter.style.display = '';
      
      const footerStatusText = document.getElementById('footerStatusText');
      if (footerStatusText) {
        let parts = [];
        if (pendingCount > 0) parts.push(`${pendingCount} item baru`);
        if (editedCount > 0) parts.push(`${editedCount} item diubah`);
        footerStatusText.innerHTML = `<i class="bi bi-info-circle"></i> ${parts.join(' + ')} belum disimpan. Klik "Simpan Semua" untuk menyimpan ke database.`;
      }
    } else {
      if (saveAllBtn) saveAllBtn.style.display = 'none';
      if (footerSaveAllBtn) footerSaveAllBtn.style.display = 'none';
    }
  },

  // Helper functions
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatDate(d) {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return String(d);
    }
  },

  formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return 'Rp 0';
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(amount);
  },

  toDateInput(d) {
    if (!d) return '';
    try {
      const s = String(d);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const date = new Date(s);
      if (isNaN(date.getTime())) return '';
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return '';
    }
  },

  showToast(message, type = 'success') {
    const container = document.getElementById('poToastContainer');
    if (!container) return;
    
    const iconMap = { success: 'bi-check-circle-fill', danger: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0 show mb-2`;
    toast.style.minWidth = '300px';
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi ${iconMap[type] || iconMap.info}"></i>
          <span>${this.escapeHtml(message)}</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  showConfirmDialog(message, onConfirm) {
    const result = confirm(message);
    if (result && onConfirm) onConfirm();
  }
};

export { ProcurementPage };