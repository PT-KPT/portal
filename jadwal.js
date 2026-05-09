// jadwal.js — ES6 Module — Jadwal Kerja v3.1
import { ROUTES, TOAST, SHEETS } from './constants.js';
import { DataAccess } from './db.js';
import { AppError } from './error-handler.js';
import { UtilityService, UIService } from './main.js';

const SchedulePage = {
  _currentProjectId: null,
  _cachedProjects:   [],
  _scheduleRows:     [],   // rows dari sheet jadwal untuk proyek aktif
  _workMethodMap:    {},   // { wmId: { document_number, work_steps[] } }

  render() {
    return `
    <div id="scheduleView">
      <div class="page-header no-print">
        <h2 class="page-title">
          <span class="page-title__icon"><i class="bi bi-building-gear"></i></span>
          KPT Project Management Portal
        </h2>
        <div class="page-header__filter">
          <select class="form-select" id="selectScheduleProject"
                  onchange="SchedulePage.onProjectChange()">
            <option value="">-- Pilih Proyek --</option>
          </select>
        </div>
        <button class="btn btn--primary" id="btnSaveSchedule"
                onclick="SchedulePage.saveAllSchedules()" style="display:none;">
          <i class="bi bi-save"></i> Simpan Jadwal
        </button>
      </div>

      <div id="scheduleContent">
        <div class="empty-state">
          <div class="empty-state__icon"><i class="bi bi-calendar-week"></i></div>
          <p>Pilih proyek untuk melihat dan mengatur jadwal kerja</p>
        </div>
      </div>
    </div>`;
  },

  /* ──────────────────── INIT ──────────────────── */
  async init() {
    this._cachedProjects  = await DataAccess.getAllProjects();
    this._currentProjectId = null;
    this._scheduleRows    = [];
    this._workMethodMap   = {};

    const sel = document.getElementById('selectScheduleProject');
    if (!sel) return;

    sel.innerHTML = '<option value="">-- Pilih Proyek --</option>';
    this._cachedProjects.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      sel.appendChild(o);
    });

    const saveBtn = document.getElementById('btnSaveSchedule');
    if (saveBtn) saveBtn.style.display = 'none';
  },

  /* ──────────────────── PROJECT CHANGE ──────────────────── */
  async onProjectChange() {
    const projectId = document.getElementById('selectScheduleProject')?.value;
    this._currentProjectId = projectId;

    const saveBtn = document.getElementById('btnSaveSchedule');
    if (saveBtn) saveBtn.style.display = projectId ? 'inline-flex' : 'none';

    const content = document.getElementById('scheduleContent');

    if (!projectId) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon"><i class="bi bi-calendar-week"></i></div>
          <p>Pilih proyek untuk melihat dan mengatur jadwal kerja</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon"><i class="bi bi-hourglass-split"></i></div>
        <p>Memuat data jadwal…</p>
      </div>`;

    try {
      // Muat work_methods dan jadwal secara paralel
      const [workMethods, existingSchedule] = await Promise.all([
        DataAccess.getWorkMethodsByProject(projectId),
        DataAccess.getScheduleByProject(projectId)
      ]);

      // Bangun map work method untuk referensi cepat
      this._workMethodMap = {};
      workMethods.forEach(wm => {
        this._workMethodMap[wm.id] = wm;
      });

      // Bangun _scheduleRows:
      // Untuk setiap work_step dari setiap work_method,
      // cari baris jadwal yang sudah ada atau buat placeholder baru.
      this._scheduleRows = [];

      workMethods.forEach(wm => {
        const steps = Array.isArray(wm.work_steps) ? wm.work_steps : [];
        steps.forEach((step, idx) => {
          const stepNum = step.step_number || (idx + 1);
          // Cari record jadwal yang sudah tersimpan untuk step ini
          const existing = existingSchedule.find(
            s => s.work_method_id === wm.id && String(s.step_number) === String(stepNum)
          );
          this._scheduleRows.push({
            // ID jadwal: pakai record yang sudah ada atau generate baru (belum disimpan)
            id:             existing?.id || null,          // null = belum pernah disimpan
            project_id:     projectId,
            work_method_id: wm.id,
            document_number: wm.document_number || 'Tanpa Nomor',
            step_number:    stepNum,
            work_stage:     step.work_stage  || '',
            work_process:   step.work_process || step.tools || '',
            start_date:     UtilityService.toDateInput(existing?.start_date) || '',
            end_date:       UtilityService.toDateInput(existing?.end_date)   || '',
            isDirty:        false
          });
        });
      });

      // Urutkan: per dokumen, lalu nomor langkah
      this._scheduleRows.sort((a, b) => {
        const docCmp = a.document_number.localeCompare(b.document_number);
        return docCmp !== 0 ? docCmp : a.step_number - b.step_number;
      });

      this._renderSchedule();
    } catch (err) {
      AppError.handle(err, 'Memuat jadwal');
    }
  },

  /* ──────────────────── RENDER ──────────────────── */
  _renderSchedule() {
    const content = document.getElementById('scheduleContent');
    if (!content || !this._currentProjectId) return;

    const project = this._cachedProjects.find(p => p.id === this._currentProjectId);

    if (this._scheduleRows.length === 0) {
      content.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <div class="empty-state__icon"><i class="bi bi-calendar-x"></i></div>
              <p>Tidak ada tahapan kerja untuk proyek ini</p>
              <p class="text-muted" style="font-size:.8rem;">
                Tambahkan <strong>Metode Kerja</strong> terlebih dahulu melalui menu
                <a href="#metode" onclick="event.preventDefault();UIService.navigate('metode')"
                   class="text-primary fw-semibold">Metode Kerja</a>
              </p>
            </div>
          </div>
        </div>`;
      return;
    }

    // Hitung ringkasan
    const totalRows   = this._scheduleRows.length;
    const doneCount   = this._getCount('done');
    const activeCount = this._getCount('active');
    const pendingCount= this._getCount('pending');

    // Group per dokumen
    const grouped = {};
    this._scheduleRows.forEach(row => {
      if (!grouped[row.document_number]) grouped[row.document_number] = [];
      grouped[row.document_number].push(row);
    });

    let globalCounter = 0;

    let html = `
    <!-- Summary bar -->
    <div class="row g-2 mb-3">
      <div class="col-6 col-md-3">
        <div class="stat-card stat-card--blue" style="cursor:default;">
          <div class="stat-card__value">${totalRows}</div>
          <div class="stat-card__label">Total Tahapan</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card stat-card--amber" style="cursor:default;">
          <div class="stat-card__value">${pendingCount}</div>
          <div class="stat-card__label">Belum Diatur</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card stat-card--cyan" style="cursor:default;">
          <div class="stat-card__value">${activeCount}</div>
          <div class="stat-card__label">Berlangsung</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card stat-card--green" style="cursor:default;">
          <div class="stat-card__value">${doneCount}</div>
          <div class="stat-card__label">Selesai</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <div>
          <i class="bi bi-building"></i> ${UtilityService.escapeHtml(project?.name || '')}
          <span class="ms-2 badge bg-info" style="font-size:.72rem;">${totalRows} Tahapan</span>
        </div>
        <span class="text-muted" style="font-size:.75rem;">
          <i class="bi bi-info-circle"></i> Ubah tanggal lalu klik Simpan Jadwal
        </span>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table--hover table-bordered table-sm mb-0" id="scheduleTable">
            <thead>
              <tr>
                <th class="text-center" style="width:40px;">No</th>
                <th style="min-width:200px;">Tahapan Kerja</th>
                <th style="min-width:180px;">Proses / Kegiatan</th>
                <th class="text-center" style="width:140px;">Tgl Mulai</th>
                <th class="text-center" style="width:140px;">Tgl Selesai</th>
                <th class="text-center" style="width:100px;">Status</th>
              </tr>
            </thead>
            <tbody id="scheduleTableBody">`;

    Object.entries(grouped).forEach(([docNum, rows]) => {
      html += `
              <tr style="background:var(--color-primary-bg);">
                <td colspan="6" style="padding:6px 12px;font-weight:600;font-size:.8rem;color:var(--color-primary);">
                  <i class="bi bi-diagram-3"></i> ${UtilityService.escapeHtml(docNum)}
                  <span class="ms-2 badge bg-primary" style="font-size:.68rem;">${rows.length} langkah</span>
                </td>
              </tr>`;

      rows.forEach(item => {
        globalCounter++;
        const { statusBadge, rowStyle } = this._getStatusUI(item);

        // Gunakan index di _scheduleRows sebagai data-key untuk lookup cepat
        const rowIdx = this._scheduleRows.indexOf(item);

        html += `
              <tr data-row-idx="${rowIdx}" ${rowStyle}>
                <td class="text-center fw-semibold" style="font-size:.78rem;">${globalCounter}</td>
                <td style="font-size:.82rem;">${UtilityService.escapeHtml(item.work_stage || '-')}</td>
                <td style="font-size:.82rem;">${UtilityService.escapeHtml(item.work_process || '-')}</td>
                <td class="text-center">
                  <input type="date" class="form-control form-control-sm schedule-date"
                         data-row-idx="${rowIdx}" data-field="start_date"
                         value="${UtilityService.toDateInput(item.start_date)}"
                         style="font-size:.78rem;min-width:110px;">
                </td>
                <td class="text-center">
                  <input type="date" class="form-control form-control-sm schedule-date"
                         data-row-idx="${rowIdx}" data-field="end_date"
                         value="${UtilityService.toDateInput(item.end_date)}"
                         style="font-size:.78rem;min-width:110px;">
                </td>
                <td class="text-center status-cell">${statusBadge}</td>
              </tr>`;
      });
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

    content.innerHTML = html;

    // Pasang satu event listener (event delegation) — tidak perlu loop per baris
    const tbody = document.getElementById('scheduleTableBody');
    if (tbody) {
      tbody.addEventListener('change', e => {
        const input = e.target.closest('.schedule-date');
        if (!input) return;
        this._onDateChange(input);
      });
    }
  },

  /* ──────────────────── DATE CHANGE HANDLER ──────────────────── */
  _onDateChange(input) {
    const idx   = parseInt(input.dataset.rowIdx, 10);
    const field = input.dataset.field;      // 'start_date' | 'end_date'
    const item  = this._scheduleRows[idx];
    if (!item) return;

    item[field]  = input.value;
    item.isDirty = true;

    // Validasi silang start ≤ end
    const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
    if (row) {
      const startInput = row.querySelector('[data-field="start_date"]');
      const endInput   = row.querySelector('[data-field="end_date"]');
      const hasStart   = startInput?.value;
      const hasEnd     = endInput?.value;

      if (hasStart && hasEnd) {
        const invalid = new Date(startInput.value) > new Date(endInput.value);
        const color   = invalid ? 'var(--color-danger)' : 'var(--color-success)';
        const bg      = invalid ? 'var(--color-danger-bg)' : 'transparent';
        [startInput, endInput].forEach(el => {
          el.style.border     = `2px solid ${color}`;
          el.style.background = bg;
        });
        if (!invalid) {
          setTimeout(() => {
            [startInput, endInput].forEach(el => {
              el.style.border = '';
              el.style.background = 'transparent';
            });
          }, 1500);
        }
      }
    }

    this._updateRowStatus(idx);
    this._updateDirtyBanner();
  },

  /* ──────────────────── STATUS HELPERS ──────────────────── */
  _getStatusUI(item) {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (!item.start_date || !item.end_date) {
      return { statusBadge: '<span class="badge bg-secondary" style="font-size:.68rem;">Belum diatur</span>', rowStyle: '' };
    }
    if (new Date(item.start_date) > new Date(item.end_date)) {
      return { statusBadge: '<span class="badge bg-danger" style="font-size:.68rem;">Tanggal tidak valid</span>', rowStyle: 'style="background:#fff5f5;"' };
    }
    const end   = new Date(item.end_date);   end.setHours(0,0,0,0);
    const start = new Date(item.start_date); start.setHours(0,0,0,0);

    if (end < today)          return { statusBadge: '<span class="badge bg-success" style="font-size:.68rem;">Selesai</span>',                         rowStyle: 'style="background:#f0fdf4;"' };
    if (start <= today)       return { statusBadge: '<span class="badge bg-warning text-dark" style="font-size:.68rem;">Berlangsung</span>',           rowStyle: 'style="background:#fffbeb;"' };
    return                           { statusBadge: '<span class="badge bg-info" style="font-size:.68rem;">Mendatang</span>',                          rowStyle: 'style="background:#f0f9ff;"' };
  },

  _updateRowStatus(idx) {
    const item = this._scheduleRows[idx];
    if (!item) return;
    const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
    if (!row) return;
    const statusCell = row.querySelector('.status-cell');
    if (!statusCell) return;
    const { statusBadge, rowStyle } = this._getStatusUI(item);
    statusCell.innerHTML = statusBadge;
    // Ganti row background
    const bgMatch = rowStyle.match(/background:([^;}"]+)/);
    row.style.background = bgMatch ? bgMatch[1].trim() : '';
  },

  _updateDirtyBanner() {
    const hasDirty = this._scheduleRows.some(s => s.isDirty);
    const table    = document.getElementById('scheduleTable');
    if (!table) return;

    let tfoot = table.querySelector('tfoot');
    if (hasDirty && !tfoot) {
      tfoot = document.createElement('tfoot');
      tfoot.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-2" style="background:var(--color-warning-bg);">
            <i class="bi bi-exclamation-triangle text-warning"></i>
            <span class="text-warning fw-semibold" style="font-size:.78rem;">
              Ada perubahan yang belum disimpan. Klik "Simpan Jadwal" untuk menyimpan.
            </span>
          </td>
        </tr>`;
      table.appendChild(tfoot);
    } else if (!hasDirty && tfoot) {
      tfoot.remove();
    }
  },

  /* ──────────────────── COUNT HELPERS ──────────────────── */
  _getCount(type) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return this._scheduleRows.filter(s => {
      if (!s.start_date || !s.end_date) return type === 'pending';
      if (new Date(s.start_date) > new Date(s.end_date)) return false;
      const start = new Date(s.start_date); start.setHours(0,0,0,0);
      const end   = new Date(s.end_date);   end.setHours(0,0,0,0);
      if (type === 'done')   return end < today;
      if (type === 'active') return start <= today && end >= today;
      return false;
    }).length;
  },

  /* ──────────────────── SAVE (FIXED) ──────────────────── */
  async saveAllSchedules() {
    if (!this._currentProjectId) {
      UIService.showToast('Pilih proyek terlebih dahulu!', TOAST.WARNING);
      return;
    }

    // Validasi tanggal
    const invalidRows = this._scheduleRows.filter(
      s => s.start_date && s.end_date && new Date(s.start_date) > new Date(s.end_date)
    );
    if (invalidRows.length > 0) {
      UIService.showToast(
        `Terdapat ${invalidRows.length} tahapan dengan tanggal tidak valid. Perbaiki terlebih dahulu.`,
        TOAST.DANGER
      );
      return;
    }

    // Hanya simpan baris yang punya tanggal atau pernah ada di DB (id !== null)
    const rowsToSave = this._scheduleRows.filter(
      s => s.isDirty || (s.id && (s.start_date || s.end_date))
    );

    if (rowsToSave.length === 0) {
      UIService.showToast('Tidak ada perubahan untuk disimpan.', TOAST.INFO);
      return;
    }

    const saveBtn = document.getElementById('btnSaveSchedule');
    if (saveBtn) { 
      saveBtn.disabled = true; 
      saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan…';
    }

    try {
      // FIX: Persiapkan operations
      const now = new Date().toISOString();
      const operations = rowsToSave.map((s, idx) => {
        // Buat ID baru untuk baris yang belum pernah disimpan
        if (!s.id) {
          s.id = 'sch_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 5);
        }

        return {
          sheet: SHEETS.SCHEDULE,
          data: {
            id:             s.id,
            project_id:     s.project_id,
            work_method_id: s.work_method_id,
            document_number: s.document_number,
            step_number:    s.step_number,
            work_stage:     s.work_stage,
            work_process:   s.work_process,
            start_date:     s.start_date || '',
            end_date:       s.end_date   || '',
            updated_at:     now
          }
        };
      });

      // FIX: Tampilkan progress untuk batch besar
      const totalOps = operations.length;
      console.log(`[SchedulePage] Menyimpan ${totalOps} jadwal...`);
      
      if (totalOps > 20) {
        UIService.showToast(`Menyimpan ${totalOps} jadwal... Mohon tunggu.`, TOAST.INFO);
      }

      // Gunakan DB.batchUpsert yang sudah difix dengan chunking
      await DB.batchUpsert(operations);

      // INVALIDASI CERDAS: Hanya untuk proyek yang sedang aktif
      AppCache.invalidateRelated(SHEETS.SCHEDULE, { projectId: this._currentProjectId });

      // Reset dirty flags
      this._scheduleRows.forEach(s => s.isDirty = false);
      this._updateDirtyBanner();
      this._renderSchedule();

      UIService.showToast(`${totalOps} jadwal berhasil disimpan!`, TOAST.SUCCESS);
    } catch (err) {
      console.error('[SchedulePage] Gagal menyimpan jadwal:', err);
      AppError.handle(err, 'Menyimpan jadwal');
      
      // FIX: Fallback — simpan satu per satu jika batch gagal
      if (err.message.includes('timeout') || err.message.includes('Timeout')) {
        UIService.showToast('Batch gagal, mencoba simpan satu per satu...', TOAST.WARNING);
        try {
          let savedCount = 0;
          for (const row of rowsToSave) {
            try {
              await DB.upsert(SHEETS.SCHEDULE, {
                id:             row.id || ('sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                project_id:     row.project_id || this._currentProjectId,
                work_method_id: row.work_method_id,
                document_number: row.document_number,
                step_number:    row.step_number,
                work_stage:     row.work_stage,
                work_process:   row.work_process,
                start_date:     row.start_date || '',
                end_date:       row.end_date   || '',
                updated_at:     new Date().toISOString()
              });
              savedCount++;
            } catch (singleErr) {
              console.error(`[SchedulePage] Gagal simpan baris ${row.step_number}:`, singleErr);
            }
          }
          
          AppCache.invalidateRelated(SHEETS.SCHEDULE, { projectId: this._currentProjectId });
          this._scheduleRows.forEach(s => s.isDirty = false);
          this._updateDirtyBanner();
          this._renderSchedule();
          
          if (savedCount > 0) {
            UIService.showToast(`${savedCount}/${totalOps} jadwal berhasil disimpan!`, TOAST.SUCCESS);
          } else {
            UIService.showToast('Gagal menyimpan jadwal.', TOAST.DANGER);
          }
        } catch (fallbackErr) {
          console.error('[SchedulePage] Fallback juga gagal:', fallbackErr);
          AppError.handle(fallbackErr, 'Menyimpan jadwal (fallback)');
        }
      }
    } finally {
      if (saveBtn) { 
        saveBtn.disabled = false; 
        saveBtn.innerHTML = '<i class="bi bi-save"></i> Simpan Jadwal'; 
      }
    }
  }
};

export { SchedulePage };