const WorkMethodPage = {
  _currentWorkMethod: null,
  _currentStep: 1,
  _cachedProjects: [],
  _listClickHandler: null,

  render() {
    return `<div id="workMethodListView">
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
        <div class="page-header__filter">
          <select class="form-select" id="selectFilterWorkMethodProject" onchange="WorkMethodPage.loadWorkMethodList()">
            <option value="">Semua Proyek</option>
          </select>
        </div>
        <button class="btn btn--primary" onclick="WorkMethodPage.showWorkMethodForm()"><i class="bi bi-plus-lg"></i> Metode Kerja Baru</button>
      </div>
      <div class="card d-none d-md-block"><div class="card-body p-0"><div class="table-responsive">
        <table class="table table--hover mb-0">
          <thead><tr><th>No. Dokumen</th><th>Proyek</th><th>Tanggal</th><th>Disusun Oleh</th><th class="text-center">Aksi</th></tr></thead>
          <tbody id="workMethodTableBody"><tr><td colspan="5" class="text-center py-4">Memuat data...</td></tr></tbody>
        </table>
      </div></div></div>
      <div id="workMethodCardList" class="d-md-none"></div>
    </div>

    <div id="workMethodFormView" style="display:none;">
      <div class="wizard">
        <div class="wizard__header no-print">
          <div class="wizard__title"><i class="bi bi-diagram-3"></i> Metode Kerja</div>
          <div class="step-pills" id="workMethodStepPills"></div>
        </div>
        <div class="wizard__body"><div id="workMethodStepContent" class="step-content"></div></div>
        <div class="wizard__footer no-print">
          <button class="btn btn--outline-secondary" id="btnWorkMethodPrev" onclick="WorkMethodPage.goToPreviousStep()"><i class="bi bi-arrow-left"></i> Sebelumnya</button>
          <button class="btn btn--outline-danger" onclick="WorkMethodPage.showWorkMethodList()"><i class="bi bi-x-lg"></i> Batal</button>
          <div class="ms-auto d-flex gap-2">
            <button class="btn btn--primary" id="btnWorkMethodNext" onclick="WorkMethodPage.goToNextStep()">Lanjut <i class="bi bi-arrow-right"></i></button>
            <button class="btn btn--success" id="btnWorkMethodFinish" onclick="WorkMethodPage.finishWorkMethod()"><i class="bi bi-check-lg"></i> Selesaikan</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  async init() {
    this._currentWorkMethod = null;
    this._currentStep = 1;
    this._cachedProjects = await DataAccess.getAllProjects();
    const sel = document.getElementById('selectFilterWorkMethodProject');
    if (sel) {
      sel.innerHTML = '<option value="">Semua Proyek</option>';
      this._cachedProjects.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
    }
    this._attachDelegatedListeners();
    await this.loadWorkMethodList();
  },

  // ============================================================
  // EVENT DELEGATION — Pasang listener SEKALI pada parent statis
  // ============================================================
  _attachDelegatedListeners() {
    const listView = document.getElementById('workMethodListView');
    if (listView) {
      if (this._listClickHandler) {
        listView.removeEventListener('click', this._listClickHandler);
      }
      this._listClickHandler = async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit') await WorkMethodPage.editWorkMethod(id);
        if (action === 'delete') await WorkMethodPage.deleteWorkMethod(id);
      };
      listView.addEventListener('click', this._listClickHandler);
    }
  },

  showWorkMethodList() {
    document.getElementById('workMethodListView').style.display = 'block';
    document.getElementById('workMethodFormView').style.display = 'none';
    this.loadWorkMethodList();
  },

  async showWorkMethodForm(workMethodData = null) {
    const hasP = await DataAccess.hasProjects();
    if (!hasP) { UIService.showToast('Buat proyek terlebih dahulu!','warning'); UIService.navigate('proyek'); return; }
    this._cachedProjects = await DataAccess.getAllProjects();
    document.getElementById('workMethodListView').style.display = 'none';
    document.getElementById('workMethodFormView').style.display = 'block';

    if (workMethodData) {
      this._currentWorkMethod = JSON.parse(JSON.stringify(workMethodData));
    } else {
      const docNum = await UtilityService.generateDocNumber('WM');
      this._currentWorkMethod = {
        id: 'wm_'+Date.now(), project_id:'', document_number: docNum, revision:'0',
        date: new Date().toISOString().split('T')[0],
        work_steps: [],
        prepared_by: DataAccess.getCurrentUser(), reviewed_by:'', approved_by:'',
        created_at: new Date().toISOString()
      };
    }
    this.buildStepPills();
    this._currentStep = 1;
    this.renderCurrentStep();
  },

  buildStepPills() {
    const labels = ['Info Umum','Langkah Kerja','Approval'];
    document.getElementById('workMethodStepPills').innerHTML = labels.map((l,i)=>`<div class="step-pill" id="workMethodPill_${i+1}"><span class="step-pill__number" id="workMethodPillNumber_${i+1}">${i+1}</span>${l}</div>`).join('');
  },

  updateStepPills() {
    for(let i=1;i<=3;i++){
      const p=document.getElementById('workMethodPill_'+i), n=document.getElementById('workMethodPillNumber_'+i);
      if(!p||!n) continue;
      p.className='step-pill';
      if(i===this._currentStep) p.classList.add('step-pill--active');
      else if(i<this._currentStep) p.classList.add('step-pill--done');
      n.innerHTML = i < this._currentStep ? '<i class="bi bi-check-lg" style="font-size:.6rem;"></i>' : i;
    }
  },

  renderCurrentStep() {
    this.updateStepPills();
    document.getElementById('btnWorkMethodPrev').style.display = this._currentStep>1?'inline-flex':'none';
    document.getElementById('btnWorkMethodNext').style.display = this._currentStep<3?'inline-flex':'none';
    document.getElementById('btnWorkMethodFinish').style.display = this._currentStep===3?'inline-flex':'none';
    const sc = document.getElementById('workMethodStepContent');
    sc.innerHTML = this.buildStepHTML(this._currentStep);
    this.fillStepData(this._currentStep);
  },

  buildStepHTML(step) {
    const projOpts = this._cachedProjects.map(p=>`<option value="${p.id}">${UtilityService.escapeHtml(p.name)}</option>`).join('');
    if(step===1) return `<div class="section-title">Informasi Umum</div><div class="row g-3">
      <div class="col-sm-8"><label class="form-label">Proyek <span class="text-danger">*</span></label><select class="form-select" id="selectWMProject"><option value="">-- Pilih --</option>${projOpts}</select></div>
      <div class="col-sm-4"><label class="form-label">Tanggal</label><input type="date" class="form-control" id="inputWMDate"></div>
      <div class="col-sm-6"><label class="form-label">No. Dokumen</label><input type="text" class="form-control input-readonly-bg" id="inputWMDocNumber" readonly></div>
      <div class="col-sm-6"><label class="form-label">Revisi</label><input type="text" class="form-control" id="inputWMRevision" value="0"></div>
    </div>`;

    if(step===2) return `<div class="section-title">Langkah Kerja</div>
      <div class="d-flex justify-content-between mb-3">
        <p class="text-muted mb-0">Uraian langkah kerja</p>
        <button class="btn btn--primary" onclick="WorkMethodPage.addWorkStep()"><i class="bi bi-plus-lg"></i> Tambah</button>
      </div>
      <div class="table-responsive"><table class="hiradc-table">
        <thead><tr><th>Nomor</th><th>Tahapan Kerja</th><th>Alat Kerja</th><th>Proses / Kegiatan</th><th></th></tr></thead>
        <tbody id="workMethodStepsTbody"></tbody>
      </table></div>`;

    if(step===3) return `<div class="section-title">Approval</div><div class="row g-3">
      <div class="col-sm-4"><label class="form-label">Disusun Oleh</label><input type="text" class="form-control" id="inputWMPreparedBy" value="${UtilityService.escapeHtml(DataAccess.getCurrentUser())}"></div>
      <div class="col-sm-4"><label class="form-label">Diperiksa Oleh</label><input type="text" class="form-control" id="inputWMReviewedBy"></div>
      <div class="col-sm-4"><label class="form-label">Disetujui Oleh</label><input type="text" class="form-control" id="inputWMApprovedBy"></div>
    </div>`;
    return '';
  },

  fillStepData(step) {
    if(!this._currentWorkMethod) return;
    const sv=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v||''; };
    if(step===1){
      sv('inputWMDocNumber',this._currentWorkMethod.document_number);
      sv('inputWMRevision',this._currentWorkMethod.revision);
      sv('inputWMDate', UtilityService.toDateInput(this._currentWorkMethod.date));
      if(this._currentWorkMethod.project_id) sv('selectWMProject',this._currentWorkMethod.project_id);
    }
    if(step===2) this.renderWorkSteps();
    if(step===3){
      sv('inputWMPreparedBy',this._currentWorkMethod.prepared_by);
      sv('inputWMReviewedBy',this._currentWorkMethod.reviewed_by);
      sv('inputWMApprovedBy',this._currentWorkMethod.approved_by);
    }
  },

  collectStepData(step) {
    if(!this._currentWorkMethod) return;
    const gv=(id)=>{ const el=document.getElementById(id); return el?(el.value||''):''; };
    if(step===1){
      this._currentWorkMethod.project_id=gv('selectWMProject');
      this._currentWorkMethod.date=gv('inputWMDate');
      this._currentWorkMethod.revision=gv('inputWMRevision');
    }
    if(step===2){
      this._currentWorkMethod.work_steps=[];
      document.querySelectorAll('#workMethodStepsTbody tr[data-step-index]').forEach((row,i)=>{
        this._currentWorkMethod.work_steps.push({
          step_number:i+1,
          work_stage:row.querySelector('.ws-work-stage')?.value?.trim()||'',
          tools:row.querySelector('.ws-tools')?.value?.trim()||'',
          work_process:row.querySelector('.ws-work-process')?.value?.trim()||''
        });
      });
    }
    if(step===3){
      this._currentWorkMethod.prepared_by=gv('inputWMPreparedBy');
      this._currentWorkMethod.reviewed_by=gv('inputWMReviewedBy');
      this._currentWorkMethod.approved_by=gv('inputWMApprovedBy');
    }
  },

  goToPreviousStep() { if(this._currentStep>1){ this.collectStepData(this._currentStep); this._currentStep--; this.renderCurrentStep(); } },

  goToNextStep() {
    this.collectStepData(this._currentStep);
    if(this._currentStep===1 && !this._currentWorkMethod.project_id){ UIService.showToast('Pilih proyek!','warning'); return; }
    if(this._currentStep<3){ this._currentStep++; this.renderCurrentStep(); }
  },

  async finishWorkMethod() {
    this.collectStepData(3);
    if(!this._currentWorkMethod.project_id){ UIService.showToast('Pilih proyek!','warning'); return; }
    if(!this._currentWorkMethod.work_steps?.length){ UIService.showToast('Minimal 1 langkah kerja!','warning'); return; }
    await DataAccess.saveWorkMethod(this._currentWorkMethod);
    UIService.showToast('Metode Kerja berhasil disimpan!','success');
    setTimeout(()=>this.showWorkMethodList(), 1200);
  },

  addWorkStep(stepData={}) {
    const tbody=document.getElementById('workMethodStepsTbody'); if(!tbody) return;
    const idx=tbody.querySelectorAll('tr[data-step-index]').length;
    const row=document.createElement('tr'); row.setAttribute('data-step-index',idx);
    row.innerHTML=`<td class="text-center ws-step-number fw-semibold" style="font-size:.74rem;">${idx+1}</td>
      <td><textarea class="ws-work-stage" rows="2">${UtilityService.escapeHtml(stepData.work_stage||'')}</textarea></td>
      <td><textarea class="ws-tools" rows="2">${UtilityService.escapeHtml(stepData.tools||'')}</textarea></td>
      <td><textarea class="ws-work-process" rows="2">${UtilityService.escapeHtml(stepData.work_process||'')}</textarea></td>
      <td class="text-center"><button class="btn btn--xs btn--outline-danger" onclick="this.closest('tr').remove()"><i class="bi bi-trash"></i></button></td>`;
    tbody.appendChild(row);
  },

  renderWorkSteps() {
    const tbody=document.getElementById('workMethodStepsTbody'); if(!tbody) return;
    tbody.innerHTML='';
    const steps=this._currentWorkMethod.work_steps||[];
    if(steps.length) steps.forEach(s=>this.addWorkStep(s)); else this.addWorkStep();
  },

  async loadWorkMethodList() {
    try {
      const [wms, projects] = await Promise.all([DataAccess.getAllWorkMethods(), DataAccess.getAllProjects()]);
      const projId = document.getElementById('selectFilterWorkMethodProject')?.value || '';
      let list = [...wms];
      if (projId) list = list.filter(w => w.project_id === projId);
      list.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

      const tableBody = document.getElementById('workMethodTableBody');
      const cardList = document.getElementById('workMethodCardList');

      if (!list.length) {
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-5">Tidak ada metode kerja</td></tr>';
        if (cardList) cardList.innerHTML = '<div class="empty-state"><div class="empty-state__icon"><i class="bi bi-diagram-3"></i></div><p>Tidak ada metode kerja</p></div>';
      } else {
        if (tableBody) tableBody.innerHTML = list.map(wm => {
          const p = projects.find(x => x.id === wm.project_id);
          return `<tr><td><strong>${UtilityService.escapeHtml(wm.document_number)}</strong></td><td>${p ? UtilityService.escapeHtml(p.name) : '-'}</td><td>${UtilityService.formatDate(wm.date)}</td><td>${UtilityService.escapeHtml(wm.prepared_by || '-')}</td><td class="text-center"><button class="btn btn--xs btn--outline-warning me-1" data-action="edit" data-id="${wm.id}"><i class="bi bi-pencil"></i></button><button class="btn btn--xs btn--outline-danger" data-action="delete" data-id="${wm.id}"><i class="bi bi-trash"></i></button></td></tr>`;
        }).join('');

        if (cardList) cardList.innerHTML = list.map(wm => {
          const p = projects.find(x => x.id === wm.project_id);
          return `<div class="card"><div class="card-body py-3"><div class="fw-bold">${UtilityService.escapeHtml(wm.document_number)}</div><div style="font-size:.7rem;">${p ? UtilityService.escapeHtml(p.name) : '-'}</div><div class="d-flex gap-2 mt-2"><button class="btn btn--xs btn--outline-warning" data-action="edit" data-id="${wm.id}">Edit</button><button class="btn btn--xs btn--outline-danger" data-action="delete" data-id="${wm.id}">Hapus</button></div></div></div>`;
        }).join('');
        // TIDAK perlu cloneNode lagi — listener sudah terpasang di parent
      }
    } catch (err) { AppError.handle(err, 'Memuat daftar Metode Kerja'); }
  },

  async editWorkMethod(id) {
    try { const w = await DataAccess.getWorkMethodById(id); if (w) this.showWorkMethodForm(w); }
    catch (err) { AppError.handle(err, 'Membuka Metode Kerja'); }
  },

  async deleteWorkMethod(id) {
    UtilityService.showConfirmDialog('Hapus metode kerja ini?', async () => {
      try {
        await DataAccess.deleteWorkMethod(id);
        await this.loadWorkMethodList();
        UIService.showToast('Metode kerja dihapus.', TOAST.WARNING);
      } catch (err) { AppError.handle(err, 'Menghapus Metode Kerja'); }
    });
  }
};
// Di akhir metode.js, tambahkan:
export { WorkMethodPage };