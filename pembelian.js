// pembelian.js — Procurement (async Google Sheets) - Optimized with Event Delegation
const ProcurementPage = {
  _currentItems: [],
  _cachedProjects: [],
  _editId: null,
  _listClickHandler: null,

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
        <button class="btn btn--primary" onclick="ProcurementPage.showPOForm()"><i class="bi bi-plus-lg"></i> Item Baru</button>
      </div>
    <div id="procurementListView">
      <div class="card d-none d-md-block"><div class="card-body p-0"><div class="table-responsive">
        <table class="table table--hover mb-0">
          <thead><tr><th>No</th><th>Proyek</th><th>Nama Material</th><th>Spesifikasi</th><th>Toko/Supplier</th><th>Qty</th><th>Unit</th><th>Harga Satuan</th><th>Total</th><th>Aksi</th></tr></thead>
          <tbody id="poTableBody"><tr><td colspan="10" class="text-center py-4">Memuat data...</td></tr></tbody>
        </table>
      </div></div></div>
      <div id="poCardList" class="d-md-none"></div>
    </div>

    <div id="procurementFormView" style="display:none;">
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-cart"></i></span><span id="poPageTitle">Item Pembelian Baru</span></h2>
        <button class="btn btn--outline-secondary" onclick="ProcurementPage.showPOList()"><i class="bi bi-x-lg"></i> Batal</button>
      </div>
      <div class="wizard">
        <div class="wizard__header"><div class="wizard__title"><i class="bi bi-cart"></i> Form Item Pembelian</div></div>
        <div class="wizard__body"><div id="poStepContent" class="step-content"></div></div>
        <div class="wizard__footer">
          <button class="btn btn--outline-secondary" onclick="ProcurementPage.showPOList()"><i class="bi bi-x-lg"></i> Batal</button>
          <div class="ms-auto"><button class="btn btn--success" onclick="ProcurementPage.finishAllItems()"><i class="bi bi-check-lg"></i> Simpan Semua</button></div>
        </div>
      </div>
    </div>`;
  },

  async init() {
    this._cachedProjects = await DataAccess.getAllProjects();
    const sel = document.getElementById('selectFilterPOProject');
    if (sel) {
      sel.innerHTML = '<option value="">Semua Proyek</option>';
      this._cachedProjects.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
    }
    this._attachDelegatedListeners();
    await this.loadPOList();
  },

  // ============================================================
  // EVENT DELEGATION — Pasang listener SEKALI pada parent statis
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
        if (action === 'edit') await ProcurementPage.editPO(id);
        if (action === 'delete') await ProcurementPage.deletePOConfirm(id);
      };
      listView.addEventListener('click', this._listClickHandler);
    }
  },

  showPOList() {
    this._editId = null;
    document.getElementById('procurementListView').style.display = 'block';
    document.getElementById('procurementFormView').style.display = 'none';
    this.loadPOList();
  },

  async showPOForm(editData = null) {
    const hasP = await DataAccess.hasProjects();
    if (!hasP) { UIService.showToast('Buat proyek terlebih dahulu!','warning'); UIService.navigate('proyek'); return; }
    this._cachedProjects = await DataAccess.getAllProjects();
    document.getElementById('procurementListView').style.display = 'none';
    document.getElementById('procurementFormView').style.display = 'block';
    this._currentItems = [];
    this._editId = null;
    if (editData) {
      document.getElementById('poPageTitle').textContent = 'Edit Item Pembelian';
      this._editId = editData.id;
      this._currentItems = [{ id:editData.id, material_name:editData.material_name||'', specification:editData.specification||'', quantity:editData.quantity||1, unit:editData.unit||'', unit_price:editData.unit_price||0, total_price:editData.total_price||0, supplier:editData.supplier||'', created_at:editData.created_at }];
    } else {
      document.getElementById('poPageTitle').textContent = 'Item Pembelian Baru';
    }
    this.renderPOForm(editData);
  },

  renderPOForm(editData = null) {
    const projOpts = this._cachedProjects.map(p=>`<option value="${p.id}" ${editData&&editData.project_id===p.id?'selected':''}>${UtilityService.escapeHtml(p.name)}</option>`).join('');
    document.getElementById('poStepContent').innerHTML = `
      <div class="section-title">Informasi Proyek</div>
      <div class="row g-3 mb-4">
        <div class="col-sm-4"><label class="form-label">Proyek <span class="text-danger">*</span></label>
          <select class="form-select" id="selectPOProject"><option value="">-- Pilih Proyek --</option>${projOpts}</select>
        </div>
        <div class="col-sm-4"><label class="form-label">Tanggal Pembelian</label>
          <input type="date" class="form-control" id="inputPODate" value="${editData ? UtilityService.toDateInput(editData.date) : new Date().toISOString().split('T')[0]}">
        </div>
        <div class="col-sm-4"><label class="form-label">Toko / Supplier</label>
          <input type="text" class="form-control" id="inputPOSupplier" value="${UtilityService.escapeHtml(editData?.supplier || '')}" placeholder="Nama toko atau supplier">
        </div>
      </div>
      <div class="section-title">Daftar Item Pembelian</div>
      <div class="d-flex justify-content-between mb-3">
        <p class="text-muted mb-0">Tambahkan item pembelian</p>
        <button class="btn btn--primary" onclick="ProcurementPage.addItemRow()"><i class="bi bi-plus-lg"></i> Tambah Item</button>
      </div>
      <div class="table-responsive">
        <table class="hiradc-table" id="poItemsTable">
          <thead><tr><th class="col-width-40">No</th><th>Nama Material <span class="text-danger">*</span></th><th>Spesifikasi</th><th class="col-width-80">Qty</th><th class="col-width-80">Unit</th><th class="col-width-130">Harga Satuan</th><th class="col-width-130">Total</th><th class="col-width-40"></th></tr></thead>
          <tbody id="poItemsTableBody"></tbody>
        </table>
      </div>
      <div class="mt-3 p-3 bg-surface rounded">
        <div class="d-flex justify-content-end align-items-center gap-3">
          <span class="text-muted" style="font-size:var(--font-size-sm);">Total Pembelian:</span>
          <strong style="font-size:var(--font-size-lg);color:var(--color-success);" id="poGrandTotal">Rp 0</strong>
        </div>
      </div>`;

    if (editData && editData.project_id) setTimeout(()=>{ const s=document.getElementById('selectPOProject'); if(s) s.value=editData.project_id; }, 50);
    if (this._currentItems.length > 0) this._currentItems.forEach(item => this.addItemRow(item));
    else this.addItemRow();
    this.calculateGrandTotal();
  },

  addItemRow(itemData = {}) {
    const tbody = document.getElementById('poItemsTableBody'); if(!tbody) return;
    const idx = tbody.querySelectorAll('tr').length;
    const row = document.createElement('tr'); row.setAttribute('data-item-index', idx);
    row.innerHTML = `<td class="text-center fw-semibold">${idx+1}</td>
      <td><input type="text" class="po-item-name" value="${UtilityService.escapeHtml(itemData.material_name||'')}" placeholder="Nama material" oninput="ProcurementPage.calculateItemTotal(this)"></td>
      <td><input type="text" class="po-item-spec" value="${UtilityService.escapeHtml(itemData.specification||'')}" placeholder="Spesifikasi"></td>
      <td><input type="number" class="po-item-qty" value="${itemData.quantity||1}" min="0" step="any" oninput="ProcurementPage.calculateItemTotal(this)"></td>
      <td><input type="text" class="po-item-unit" value="${UtilityService.escapeHtml(itemData.unit||'')}" placeholder="pcs"></td>
      <td><input type="number" class="po-item-price" value="${itemData.unit_price||0}" min="0" oninput="ProcurementPage.calculateItemTotal(this)"></td>
      <td><input type="text" class="po-item-total input-readonly-bg" value="${UtilityService.formatCurrency(itemData.total_price||0)}" readonly style="font-weight:700;"></td>
      <td class="text-center"><button class="btn btn--xs btn--outline-danger" onclick="ProcurementPage.removeItemRow(this)"><i class="bi bi-trash"></i></button></td>`;
    tbody.appendChild(row);
    this.calculateItemTotal(row.querySelector('.po-item-name'));
  },

  removeItemRow(btn) {
    const row=btn.closest('tr'); if(!row) return;
    const tbody=document.getElementById('poItemsTableBody');
    row.remove(); this.updateRowNumbers();
    if(tbody.querySelectorAll('tr').length===0) this.addItemRow();
    this.calculateGrandTotal();
  },

  updateRowNumbers() {
    const tbody=document.getElementById('poItemsTableBody'); if(!tbody) return;
    tbody.querySelectorAll('tr').forEach((row,i)=>{ row.setAttribute('data-item-index',i); const fc=row.querySelector('td:first-child'); if(fc) fc.textContent=i+1; });
  },

  calculateItemTotal(el) {
    const row=el.closest('tr'); if(!row) return;
    const qty=parseFloat(row.querySelector('.po-item-qty')?.value||0), price=parseFloat(row.querySelector('.po-item-price')?.value||0);
    const ti=row.querySelector('.po-item-total'); if(ti) ti.value=UtilityService.formatCurrency(qty*price);
    this.calculateGrandTotal();
  },

  calculateGrandTotal() {
    const tbody=document.getElementById('poItemsTableBody'); if(!tbody) return;
    let total=0; tbody.querySelectorAll('tr').forEach(row=>{ total+=parseFloat(row.querySelector('.po-item-qty')?.value||0)*parseFloat(row.querySelector('.po-item-price')?.value||0); });
    const el=document.getElementById('poGrandTotal'); if(el) el.textContent=UtilityService.formatCurrency(total);
  },

  collectItems() {
    const items=[]; const tbody=document.getElementById('poItemsTableBody'); if(!tbody) return items;
    tbody.querySelectorAll('tr').forEach(row=>{
      const name=(row.querySelector('.po-item-name')?.value||'').trim(); if(!name) return;
      const qty=parseFloat(row.querySelector('.po-item-qty')?.value||0), price=parseFloat(row.querySelector('.po-item-price')?.value||0);
      items.push({ material_name:name, specification:(row.querySelector('.po-item-spec')?.value||'').trim(), quantity:qty, unit:(row.querySelector('.po-item-unit')?.value||'').trim(), unit_price:price, total_price:qty*price });
    });
    return items;
  },

  async finishAllItems() {
    const projectId = document.getElementById('selectPOProject')?.value;
    if (!projectId) { UIService.showToast('Pilih proyek terlebih dahulu!', TOAST.WARNING); return; }
    const items = this.collectItems().filter(i => i.material_name);
    if (!items.length) { UIService.showToast('Minimal 1 item dengan nama material!', TOAST.WARNING); return; }
    for (const item of items) {
      if (item.quantity <= 0) { UIService.showToast(`"${item.material_name}": Qty harus > 0!`, TOAST.WARNING); return; }
    }
    const poDate = document.getElementById('inputPODate')?.value || new Date().toISOString().split('T')[0];
    const poSupplier = (document.getElementById('inputPOSupplier')?.value || '').trim();
    const now = new Date().toISOString();
    const isEdit = !!this._editId;

    try {
      if (isEdit) {
        await DataAccess.deletePO(this._editId);
        const item = items[0];
        const updated = {
          id: this._editId,
          project_id: projectId,
          material_name: item.material_name,
          specification: item.specification,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
          supplier: poSupplier,
          date: poDate,
          created_at: this._currentItems[0]?.created_at || now,
          updated_at: now
        };
        await DataAccess.savePO(updated);
        UIService.showToast('Item berhasil diperbarui!', TOAST.SUCCESS);
      } else {
        const poArray = items.map((item, idx) => ({
          id: 'po_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 6),
          project_id: projectId,
          material_name: item.material_name,
          specification: item.specification,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
          supplier: poSupplier,
          date: poDate,
          created_at: now
        }));
        await DataAccess.saveMultiplePO(poArray);
        UIService.showToast(`${items.length} item berhasil disimpan!`, TOAST.SUCCESS);
      }
      this._editId = null;
      setTimeout(() => this.showPOList(), 1200);
    } catch (err) { AppError.handle(err, 'Menyimpan item pembelian'); }
  },

  async loadPOList() {
    try {
      const [poList, projects] = await Promise.all([DataAccess.getAllPO(), DataAccess.getAllProjects()]);
      const projId = document.getElementById('selectFilterPOProject')?.value || '';
      const supplierFilter = document.getElementById('selectFilterPOSupplier')?.value || '';
      let list = [...poList];
      if (projId) list = list.filter(po => po.project_id === projId);
      if (supplierFilter) list = list.filter(po => (po.supplier || '') === supplierFilter);
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      const supplierSel = document.getElementById('selectFilterPOSupplier');
      if (supplierSel) {
        const currentSupplierVal = supplierSel.value;
        const uniqueSuppliers = [...new Set(poList.map(po => po.supplier || '').filter(Boolean))].sort();
        supplierSel.innerHTML = '<option value="">Semua Toko/Supplier</option>' + uniqueSuppliers.map(s => `<option value="${UtilityService.escapeHtml(s)}">${UtilityService.escapeHtml(s)}</option>`).join('');
        supplierSel.value = currentSupplierVal;
      }

      const tableBody = document.getElementById('poTableBody');
      const cardList  = document.getElementById('poCardList');

      if (!list.length) {
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="10" class="text-center py-5">Tidak ada item pembelian</td></tr>';
        if (cardList)  cardList.innerHTML  = '<div class="empty-state"><div class="empty-state__icon"><i class="bi bi-cart-x"></i></div><p>Tidak ada item pembelian</p></div>';
      } else {
        if (tableBody) {
          tableBody.innerHTML = list.map((po, i) => {
            const p = projects.find(x => x.id === po.project_id);
            return `<tr>
              <td class="text-center">${i+1}</td>
              <td>${UtilityService.escapeHtml(p?.name || '-')}</td>
              <td><strong>${UtilityService.escapeHtml(po.material_name || '-')}</strong></td>
              <td>${UtilityService.escapeHtml(po.specification || '-')}</td>
              <td>${UtilityService.escapeHtml(po.supplier || '-')}</td>
              <td class="text-center">${po.quantity || 0}</td>
              <td class="text-center">${UtilityService.escapeHtml(po.unit || '-')}</td>
              <td class="text-end">${UtilityService.formatCurrency(po.unit_price)}</td>
              <td class="text-end"><strong>${UtilityService.formatCurrency(po.total_price)}</strong></td>
              <td class="text-center">
                <button class="btn btn--xs btn--outline-warning me-1" data-action="edit"   data-id="${po.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn--xs btn--outline-danger"       data-action="delete" data-id="${po.id}"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`;
          }).join('');
          // TIDAK perlu cloneNode lagi — listener sudah terpasang di parent
        }
        if (cardList) {
          cardList.innerHTML = list.map(po => {
            const p = projects.find(x => x.id === po.project_id);
            return `<div class="card"><div class="card-body py-3">
              <div class="fw-bold">${UtilityService.escapeHtml(po.material_name || '-')}</div>
              <div style="font-size:.7rem;">${UtilityService.escapeHtml(p?.name || '-')} | ${UtilityService.escapeHtml(po.specification || '-')}</div>
              ${po.supplier ? `<div style="font-size:.7rem;"><i class="bi bi-shop"></i> ${UtilityService.escapeHtml(po.supplier)}</div>` : ''}
              <div style="font-size:.7rem;">${po.quantity || 0} ${UtilityService.escapeHtml(po.unit || '')} | ${UtilityService.formatCurrency(po.unit_price)}</div>
              <div class="fw-semibold text-success">${UtilityService.formatCurrency(po.total_price)}</div>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn--xs btn--outline-warning" data-action="edit"   data-id="${po.id}">Edit</button>
                <button class="btn btn--xs btn--outline-danger"  data-action="delete" data-id="${po.id}">Hapus</button>
              </div>
            </div></div>`;
          }).join('');
          // TIDAK perlu cloneNode lagi — listener sudah terpasang di parent
        }
      }
    } catch (err) {
      AppError.handle(err, 'Memuat daftar pembelian');
    }
  },

  async editPO(id) {
    try {
      const po = await DataAccess.getPOById(id);
      if (po) {
        this._currentItems = [{ id: po.id, material_name: po.material_name || '', specification: po.specification || '', quantity: po.quantity || 1, unit: po.unit || '', unit_price: po.unit_price || 0, total_price: po.total_price || 0, supplier: po.supplier || '', created_at: po.created_at }];
        this.showPOForm(po);
      }
    } catch (err) { AppError.handle(err, 'Membuka item pembelian'); }
  },

  async deletePOConfirm(id) {
    UtilityService.showConfirmDialog('Hapus item ini?', async () => {
      try {
        await DataAccess.deletePO(id);
        await this.loadPOList();
        UIService.showToast('Item dihapus.', TOAST.WARNING);
      } catch (err) { AppError.handle(err, 'Menghapus item pembelian'); }
    });
  }
};
// Di akhir pembelian.js, tambahkan:
export { ProcurementPage };