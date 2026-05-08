const JSAPage = {
  _currentJSA: null,
  _currentStep: 1,
  _cachedProjects: [],
  _cachedWorkMethods: [],
  _listClickHandler: null,

  render() {
    return `
      <div class="page-header no-print">
        <h2 class="page-title"><span class="page-title__icon"><i class="bi bi-building-gear"></i></span>KPT Project Management Portal</h2>
        <div class="page-header__filter">
          <select class="form-select" id="selectFilterJSAProject" onchange="JSAPage.loadJSAList()">
            <option value="">Semua Proyek</option>
          </select>
        </div>
        <button class="btn btn--primary" onclick="JSAPage.showJSAForm()"><i class="bi bi-plus-lg"></i> JSA Baru</button>
      </div>
    <div id="jsaListView">
      <div class="card d-none d-md-block"><div class="card-body p-0"><div class="table-responsive">
        <table class="table table--hover mb-0">
          <thead><tr><th>No. Dokumen</th><th>Proyek</th><th>Tanggal</th><th>Permit to Work</th><th>Disusun Oleh</th><th class="text-center">Aksi</th></tr></thead>
          <tbody id="jsaTableBody"><tr><td colspan="6" class="text-center py-4">Memuat data...</td></tr></tbody>
        </table>
      </div></div></div>
      <div id="jsaCardList" class="d-md-none"></div>
    </div>

    <div id="jsaFormView" style="display:none;">
      <div class="wizard">
        <div class="wizard__header no-print">
          <div class="wizard__title"><i class="bi bi-journal-check"></i> Job Safety Analysis</div>
          <div class="step-pills" id="jsaStepPills"></div>
        </div>
        <div class="wizard__body"><div id="jsaStepContent" class="step-content"></div></div>
        <div class="wizard__footer no-print">
          <button class="btn btn--outline-secondary" id="btnJSAPrev" onclick="JSAPage.goToPreviousStep()"><i class="bi bi-arrow-left"></i> Sebelumnya</button>
          <button class="btn btn--outline-danger" onclick="JSAPage.showJSAList()"><i class="bi bi-x-lg"></i> Batal</button>
          <div class="ms-auto d-flex gap-2">
            <button class="btn btn--primary" id="btnJSANext" onclick="JSAPage.goToNextStep()">Lanjut <i class="bi bi-arrow-right"></i></button>
            <button class="btn btn--success" id="btnJSAFinish" onclick="JSAPage.finishJSA()"><i class="bi bi-check-lg"></i> Selesaikan</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  async init() {
    this._currentJSA = null; this._currentStep = 1;
    const [projects] = await Promise.all([DataAccess.getAllProjects()]);
    this._cachedProjects = projects;
    const sel = document.getElementById('selectFilterJSAProject');
    if (sel) {
      sel.innerHTML = '<option value="">Semua Proyek</option>';
      projects.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });
    }
    this._attachDelegatedListeners();
    await this.loadJSAList();
  },

  // ============================================================
  // EVENT DELEGATION — Pasang listener SEKALI pada parent statis
  // ============================================================
  _attachDelegatedListeners() {
    const listView = document.getElementById('jsaListView');
    if (listView) {
      if (this._listClickHandler) {
        listView.removeEventListener('click', this._listClickHandler);
      }
      this._listClickHandler = async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit') await JSAPage.editJSA(id);
        if (action === 'delete') await JSAPage.deleteJSA(id);
      };
      listView.addEventListener('click', this._listClickHandler);
    }
  },

  showJSAList() {
    document.getElementById('jsaListView').style.display = 'block';
    document.getElementById('jsaFormView').style.display = 'none';
    this.loadJSAList();
  },

  async showJSAForm(jsaData = null) {
    const hasP = await DataAccess.hasProjects();
    if (!hasP) { UIService.showToast('Buat proyek terlebih dahulu!','warning'); UIService.navigate('proyek'); return; }
    this._cachedProjects = await DataAccess.getAllProjects();
    this._cachedWorkMethods = await DataAccess.getAllWorkMethods();
    document.getElementById('jsaListView').style.display = 'none';
    document.getElementById('jsaFormView').style.display = 'block';

    const stepLabels = ['Info Umum','APD','Identifikasi Bahaya','Tindakan Darurat','Permit & Approval'];
    const stepPills = document.getElementById('jsaStepPills');
    if (stepPills) stepPills.innerHTML = stepLabels.map((l,i) => `<div class="step-pill" id="jsaPill_${i+1}"><span class="step-pill__number" id="jsaPillNumber_${i+1}">${i+1}</span>${l}</div>`).join('');

    if (jsaData) {
      this._currentJSA = JSON.parse(JSON.stringify(jsaData));
    } else {
      const docNum = await UtilityService.generateDocNumber('JSA');
      this._currentJSA = {
        id: 'jsa_'+Date.now(), project_id:'', document_number: docNum, revision:'0',
        date: new Date().toISOString().split('T')[0],
        ppe: { selected_items:[], custom_items:[] },
        hazard_identification: [],
        emergency: { type:'', procedure:'', assembly_point:'', emergency_number:'' },
        permits: { hot_work:false, confined_space:false, working_height:false, electrical:false, lifting:false, excavation:false, pressure_test:false, radiation:false },
        prepared_by: DataAccess.getCurrentUser(), reviewed_by:'', approved_by:'',
        created_at: new Date().toISOString()
      };
    }
    this._currentStep = 1;
    this.renderCurrentStep();
  },

  updateStepPills() {
    for(let i=1;i<=5;i++){
      const p=document.getElementById('jsaPill_'+i);
      if(p){
        p.className='step-pill';
        if(i===this._currentStep) p.classList.add('step-pill--active');
        else if(i<this._currentStep) p.classList.add('step-pill--done');
      }
    }
  },

  renderCurrentStep() {
    this.updateStepPills();
    document.getElementById('btnJSAPrev').style.display = this._currentStep>1?'inline-flex':'none';
    document.getElementById('btnJSANext').style.display = this._currentStep<5?'inline-flex':'none';
    document.getElementById('btnJSAFinish').style.display = this._currentStep===5?'inline-flex':'none';
    const sc=document.getElementById('jsaStepContent');
    if(sc){ sc.innerHTML=this.buildStepHTML(this._currentStep); this.fillStepData(this._currentStep); }
  },

  buildStepHTML(step) {
    const projectOptions = this._cachedProjects.map(p=>`<option value="${p.id}">${UtilityService.escapeHtml(p.name)}</option>`).join('');
    if(step===1) return `<div class="section-title">Informasi Umum</div><div class="row g-3">
    <div class="col-12"><label class="form-label">Proyek <span class="text-danger">*</span></label><select class="form-select" id="selectJSAProject"><option value="">-- Pilih --</option>${projectOptions}</select></div>
      <div class="col-sm-6"><label class="form-label">No. Dokumen</label><input type="text" class="form-control input-readonly-bg" id="inputJSADocNumber" readonly></div>
      <div class="col-sm-3"><label class="form-label">Revisi</label><input type="text" class="form-control" id="inputJSARevision"></div>
      <div class="col-sm-3"><label class="form-label">Tanggal</label><input type="date" class="form-control" id="inputJSADate"></div>
    </div>`;

    if(step===2){
      let h=`<div class="section-title">APD (Alat Pelindung Diri)</div><div class="apd-category-grid">`;
      for(const [key,wt] of Object.entries(WORK_TYPE_APD)){
        h+=`<div class="apd-category"><div class="apd-category__header"><input type="checkbox" class="apd-category-checkbox" data-category="${key}" id="apdCat_${key}" onchange="JSAPage.toggleAPDCategory('${key}')"><div class="apd-category__icon"><i class="bi ${wt.icon}"></i></div><div class="apd-category__title">${wt.label}</div></div><div class="apd-category__items" id="apdItems_${key}">`;
        wt.items.forEach(item=>{ h+=`<label class="apd-item"><input type="checkbox" class="apd-item-checkbox" data-category="${key}" data-item-id="${item.id}" value="${UtilityService.escapeHtml(item.label)}"><span>${UtilityService.escapeHtml(item.label)}</span></label>`; });
        h+=`</div></div>`;
      }
      h+=`</div><div class="mt-4"><label class="form-label">APD Kustom</label><textarea class="form-control" id="inputJSAPPECustom" rows="2" placeholder="Pisahkan dengan koma"></textarea></div>`;
      return h;
    }

    if(step===3){
      const wmOpts = this._cachedWorkMethods.filter(w=>w.project_id===this._currentJSA?.project_id)
        .map(w=>`<option value="${w.id}">${UtilityService.escapeHtml(w.document_number)} (${(w.work_steps||[]).length} langkah)</option>`).join('');
      return `<div class="section-title">Identifikasi Bahaya</div>
        <div class="d-flex gap-2 mb-3 flex-wrap">
          ${wmOpts?`<div class="d-flex align-items-center gap-2"><label class="form-label mb-0">Import dari Metode Kerja:</label><select class="select w-auto" id="selectImportWorkMethod" onchange="JSAPage.importFromWorkMethod(this.value)"><option value="">-- Pilih --</option>${wmOpts}</select></div>`:''}
          <button class="btn btn--primary ms-auto" onclick="JSAPage.addHazardRow()"><i class="bi bi-plus-lg"></i> Tambah Manual</button>
        </div>
        <div class="table-responsive"><table class="hiradc-table">
          <thead><tr><th>No</th><th>Tahapan *</th><th>Bahaya *</th><th>Dampak</th><th>Pengendalian</th><th></th></tr></thead>
          <tbody id="jsaHazardTbody"></tbody>
        </table></div>`;
    }

    if(step===4) return `<div class="section-title">Tindakan Darurat</div><div class="row g-3">
      <div class="col-sm-6"><label class="form-label">Jenis Darurat</label><input class="form-control" id="inputJSAEmergencyType" placeholder="Kebakaran, Kecelakaan Kerja, Gempa"></div>
      <div class="col-sm-4"><label class="form-label">Titik Kumpul</label><input class="form-control" id="inputJSAEmergencyAssembly" placeholder="Lokasi titik kumpul"></div>
      <div class="col-sm-2"><label class="form-label">Nomor Darurat</label><input class="form-control" id="inputJSAEmergencyNumber" placeholder="112, 113, 119"></div>
      <div class="col-12"><label class="form-label">Prosedur</label><textarea class="form-control" id="inputJSAEmergencyProcedure" rows="4" placeholder="Langkah darurat..."></textarea></div>
    </div>`;

    if(step===5) return `<div class="section-title">Permit to Work & Approval</div>
      <div class="permit-grid">
        ${[['hot_work','🔥','Hot Work'],['confined_space','🚧','Confined Space'],['working_height','📐','Ketinggian'],['electrical','⚡','Listrik'],['lifting','🏗️','Lifting'],['excavation','⛏️','Excavation'],['pressure_test','🔧','Pressure Test'],['radiation','☢️','Radiasi']].map(([k,ic,lb])=>
        `<label class="permit-item"><input type="checkbox" class="permit-checkbox" data-permit="${k}"><span class="permit-item__icon">${ic}</span><span class="permit-item__label">${lb}</span></label>`).join('')}
      </div><hr>
      <div class="row g-3">
        <div class="col-sm-4"><label class="form-label">Disusun Oleh</label><input type="text" class="form-control" id="inputJSAPreparedBy"></div>
        <div class="col-sm-4"><label class="form-label">Diperiksa Oleh</label><input type="text" class="form-control" id="inputJSAReviewedBy"></div>
        <div class="col-sm-4"><label class="form-label">Disetujui Oleh</label><input type="text" class="form-control" id="inputJSAApprovedBy"></div>
      </div>`;
    return '';
  },

  fillStepData(step) {
    if(!this._currentJSA) return;
    const sv=(id,val)=>{ const el=document.getElementById(id); if(el) el.value=val||''; };
    if(step===1){ sv('inputJSADocNumber',this._currentJSA.document_number); sv('inputJSARevision',this._currentJSA.revision); sv('inputJSADate', UtilityService.toDateInput(this._currentJSA.date)); if(this._currentJSA.project_id) sv('selectJSAProject',this._currentJSA.project_id); }
    if(step===2) this.fillAPDData();
    if(step===3) this.renderHazardRows();
    if(step===4 && this._currentJSA.emergency){ const e=this._currentJSA.emergency; sv('inputJSAEmergencyType',e.type); sv('inputJSAEmergencyProcedure',e.procedure); sv('inputJSAEmergencyAssembly',e.assembly_point); sv('inputJSAEmergencyNumber',e.emergency_number); }
    if(step===5){ const permits=this._currentJSA.permits||{}; document.querySelectorAll('.permit-checkbox').forEach(cb=>{ const k=cb.getAttribute('data-permit'); if(k) cb.checked=permits[k]===true; }); sv('inputJSAPreparedBy',this._currentJSA.prepared_by); sv('inputJSAReviewedBy',this._currentJSA.reviewed_by); sv('inputJSAApprovedBy',this._currentJSA.approved_by); }
  },

  collectStepData(step) {
    if(!this._currentJSA) return;
    const gv=(id)=>{ const el=document.getElementById(id); return el?(el.value||''):''; };
    if(step===1){ this._currentJSA.project_id=gv('selectJSAProject'); this._currentJSA.date=gv('inputJSADate'); this._currentJSA.revision=gv('inputJSARevision'); }
    if(step===2) this._currentJSA.ppe=this.collectAPDData();
    if(step===3){ this._currentJSA.hazard_identification=[]; document.querySelectorAll('#jsaHazardTbody tr[data-hazard-index]').forEach(row=>{ this._currentJSA.hazard_identification.push({ step:row.querySelector('.hazard-step')?.value?.trim()||'', danger:row.querySelector('.hazard-danger')?.value?.trim()||'', impact:row.querySelector('.hazard-impact')?.value?.trim()||'', control:row.querySelector('.hazard-control')?.value?.trim()||'' }); }); }
    if(step===4) this._currentJSA.emergency={ type:gv('inputJSAEmergencyType'), procedure:gv('inputJSAEmergencyProcedure'), assembly_point:gv('inputJSAEmergencyAssembly'), emergency_number:gv('inputJSAEmergencyNumber') };
    if(step===5){ const permits={}; document.querySelectorAll('.permit-checkbox').forEach(cb=>{ const k=cb.getAttribute('data-permit'); if(k) permits[k]=cb.checked; }); this._currentJSA.permits=permits; this._currentJSA.prepared_by=gv('inputJSAPreparedBy'); this._currentJSA.reviewed_by=gv('inputJSAReviewedBy'); this._currentJSA.approved_by=gv('inputJSAApprovedBy'); }
  },

  goToPreviousStep() { if(this._currentStep>1){ this.collectStepData(this._currentStep); this._currentStep--; this.renderCurrentStep(); } },

  goToNextStep() {
    this.collectStepData(this._currentStep);
    if(this._currentStep===1 && !this._currentJSA.project_id){ UIService.showToast('Pilih proyek!','warning'); return; }
    if(this._currentStep<5){ this._currentStep++; this.renderCurrentStep(); }
  },

  async finishJSA() {
    this.collectStepData(5);
    if(!this._currentJSA.project_id){ UIService.showToast('Pilih proyek!','warning'); return; }
    await DataAccess.saveJSA(this._currentJSA);
    UIService.showToast('JSA berhasil disimpan!','success');
    setTimeout(() => this.showJSAList(), 1200);
  },

  toggleAPDCategory(key) {
    const cb=document.getElementById('apdCat_'+key), checked=cb?cb.checked:false;
    document.querySelectorAll(`.apd-item-checkbox[data-category="${key}"]`).forEach(c=>c.checked=checked);
  },

  collectAPDData() {
    const selected=[]; document.querySelectorAll('.apd-item-checkbox:checked').forEach(cb=>{ if(cb.value) selected.push(cb.value); });
    const custom=(document.getElementById('inputJSAPPECustom')?.value||'').split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);
    return { selected_items:selected, custom_items:custom };
  },

  fillAPDData() {
    const ppe=this._currentJSA.ppe||{selected_items:[],custom_items:[]};
    const sel=ppe.selected_items||[];
    for(const [key,wt] of Object.entries(WORK_TYPE_APD)){
      let any=false;
      wt.items.forEach(item=>{ const c=document.querySelector(`.apd-item-checkbox[data-category="${key}"][data-item-id="${item.id}"]`); if(c){ c.checked=sel.includes(item.label); if(c.checked) any=true; } });
      const cc=document.getElementById('apdCat_'+key); if(cc) cc.checked=any;
    }
    const ci=document.getElementById('inputJSAPPECustom'); if(ci&&ppe.custom_items) ci.value=ppe.custom_items.join(', ');
  },

  addHazardRow(h={}) {
    const tbody=document.getElementById('jsaHazardTbody'); if(!tbody) return;
    const idx=tbody.querySelectorAll('tr[data-hazard-index]').length;
    const row=document.createElement('tr'); row.setAttribute('data-hazard-index',idx);
    row.innerHTML=`<td class="text-center">${idx+1}</td>
      <td><textarea class="hazard-step" rows="1" placeholder="Tahapan">${UtilityService.escapeHtml(h.step||'')}</textarea></td>
      <td><textarea class="hazard-danger" rows="1" placeholder="Potensi bahaya">${UtilityService.escapeHtml(h.danger||'')}</textarea></td>
      <td><textarea class="hazard-impact" rows="1" placeholder="Dampak">${UtilityService.escapeHtml(h.impact||'')}</textarea></td>
      <td><textarea class="hazard-control" rows="1" placeholder="Pengendalian">${UtilityService.escapeHtml(h.control||'')}</textarea></td>
      <td class="text-center"><button class="btn btn--xs btn--outline-danger" onclick="this.closest('tr').remove()"><i class="bi bi-trash"></i></button></td>`;
    tbody.appendChild(row);
  },

  renderHazardRows() {
    const tbody=document.getElementById('jsaHazardTbody'); if(!tbody) return;
    tbody.innerHTML='';
    (this._currentJSA.hazard_identification||[]).forEach(h=>this.addHazardRow(h));
    if(!(this._currentJSA.hazard_identification||[]).length) this.addHazardRow();
  },

  importFromWorkMethod(wmId) {
    if(!wmId) return;
    const wm=this._cachedWorkMethods.find(w=>w.id===wmId);
    if(!wm||!wm.work_steps?.length){ UIService.showToast('Tidak ada tahapan!','warning'); return; }
    const tbody=document.getElementById('jsaHazardTbody');
    const existing=tbody?tbody.querySelectorAll('tr[data-hazard-index]').length:0;
    const doImport=()=>{ wm.work_steps.forEach(s=>this.addHazardRow({step:s.work_stage||''})); UIService.showToast(`${wm.work_steps.length} tahapan diimport!`,'success'); const sel=document.getElementById('selectImportWorkMethod'); if(sel) sel.value=''; };
    if(existing>0){
      UtilityService.showConfirmDialog(`Ganti ${existing} bahaya yang ada?`,()=>{ this._currentJSA.hazard_identification=[]; tbody.innerHTML=''; doImport(); }, doImport);
    } else { doImport(); }
  },

  getPermitLabel(key) {
    const labels = { hot_work:'Hot Work', confined_space:'Confined Space', working_height:'Ketinggian', electrical:'Isolasi Listrik', lifting:'Lifting', excavation:'Excavation', pressure_test:'Pressure Test', radiation:'Radiasi' };
    return labels[key] || key;
  },

  async loadJSAList() {
    try {
      const [jsaList, projects] = await Promise.all([DataAccess.getAllJSA(), DataAccess.getAllProjects()]);
      const projId = document.getElementById('selectFilterJSAProject')?.value || '';
      let list = [...jsaList];
      if (projId) list = list.filter(j => j.project_id === projId);
      list.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

      const tableBody = document.getElementById('jsaTableBody');
      const cardList = document.getElementById('jsaCardList');
      if (!list.length) {
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-5">Tidak ada JSA</td></tr>';
        if (cardList) cardList.innerHTML = '<div class="empty-state"><div class="empty-state__icon"><i class="bi bi-journal"></i></div><p>Tidak ada JSA</p></div>';
      } else {
        if (tableBody) tableBody.innerHTML = list.map(jsa => {
          const p = projects.find(x => x.id === jsa.project_id);
          const activePermits = Object.entries(jsa.permits || {}).filter(([,v])=>v===true).map(([k])=>this.getPermitLabel(k));
          const permitDisplay = activePermits.length ? activePermits.map(pm=>`<span class="badge bg-warning text-dark me-1" style="font-size:.68rem;">${UtilityService.escapeHtml(pm)}</span>`).join('') : '<span class="text-muted">-</span>';
          return `<tr><td><strong>${UtilityService.escapeHtml(jsa.document_number)}</strong></td><td>${p ? UtilityService.escapeHtml(p.name) : '-'}</td><td>${UtilityService.formatDate(jsa.date)}</td><td>${permitDisplay}</td><td>${UtilityService.escapeHtml(jsa.prepared_by || '-')}</td><td class="text-center"><button class="btn btn--xs btn--outline-warning me-1" data-action="edit" data-id="${jsa.id}"><i class="bi bi-pencil"></i></button><button class="btn btn--xs btn--outline-danger" data-action="delete" data-id="${jsa.id}"><i class="bi bi-trash"></i></button></td></tr>`;
        }).join('');
        if (cardList) cardList.innerHTML = list.map(jsa => {
          const p = projects.find(x => x.id === jsa.project_id);
          const activePermits = Object.entries(jsa.permits || {}).filter(([,v])=>v===true).map(([k])=>this.getPermitLabel(k));
          const permitDisplay = activePermits.length ? activePermits.map(pm=>`<span class="badge bg-warning text-dark me-1" style="font-size:.68rem;">${UtilityService.escapeHtml(pm)}</span>`).join('') : '<span class="text-muted">-</span>';
          return `<div class="card"><div class="card-body"><div class="fw-bold">${UtilityService.escapeHtml(jsa.document_number)}</div><div style="font-size:.7rem;">${p ? UtilityService.escapeHtml(p.name) : '-'} | ${UtilityService.formatDate(jsa.date)}</div><div class="d-flex gap-2 mt-2"><button class="btn btn--xs btn--outline-warning" data-action="edit" data-id="${jsa.id}">Edit</button><button class="btn btn--xs btn--outline-danger" data-action="delete" data-id="${jsa.id}">Hapus</button></div></div></div>`;
        }).join('');
        // TIDAK perlu cloneNode lagi — listener sudah terpasang di parent
      }
    } catch (err) { AppError.handle(err, 'Memuat daftar JSA'); }
  },

  async editJSA(id) {
    try { const j = await DataAccess.getJSAById(id); if (j) this.showJSAForm(j); }
    catch (err) { AppError.handle(err, 'Membuka JSA'); }
  },

  async deleteJSA(id) {
    UtilityService.showConfirmDialog('Hapus JSA ini?', async () => {
      try { await DataAccess.deleteJSA(id); await this.loadJSAList(); UIService.showToast('JSA dihapus.', TOAST.WARNING); }
      catch (err) { AppError.handle(err, 'Menghapus JSA'); }
    });
  }
};
// Di akhir jsa.js, tambahkan:
export { JSAPage };