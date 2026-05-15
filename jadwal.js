// jadwal.js — ES6 Module — Jadwal Kerja v4.0 - FIXED: DOM overflow, infinite loop, memory leak
import { ROUTES, TOAST, SHEETS } from './constants.js';
import { DB, DataAccess } from './db.js';
import { AppError } from './error-handler.js';
import { UtilityService, UIService } from './main.js';

const SchedulePage = {
  _currentProjectId: null,
  _cachedProjects:   [],
  _scheduleRows:     [],
  _workMethodMap:    {},
  _isSaving:         false,
  _saveTimeout:      null,
  _eventListeners:   [], // Track listeners for cleanup
  _abortController:  null,
  _isDestroyed:      false,

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

  // ========== DESTROY METHOD UNTUK CLEANUP ==========
  destroy() {
    this._isDestroyed = true;
    this._cleanupEventListeners();
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._scheduleRows = [];
    this._workMethodMap = {};
    console.log('[SchedulePage] Destroyed');
  },

  _cleanupEventListeners() {
    this._eventListeners.forEach(({ element, event, handler }) => {
      if (element && element.removeEventListener) {
        element.removeEventListener(event, handler);
      }
    });
    this._eventListeners = [];
  },

  _addEventListener(element, event, handler) {
    if (!element) return;
    element.addEventListener(event, handler);
    this._eventListeners.push({ element, event, handler });
  },

  /* ──────────────────── INIT ──────────────────── */
  async init() {
    if (this._isDestroyed) return;
    
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
    if (this._isDestroyed) return;
    
    // Cancel pending save
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    
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

    // Show skeleton loading
    content.innerHTML = `
      <div class="skeleton-loading">
        <div class="text-center mb-4">
          <div class="page-loading-spinner" style="margin:0 auto 1rem;"></div>
          <h5 style="color:#64748b;"><i class="bi bi-calendar-week"></i> Memuat Jadwal...</h5>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line w-75"></div>
          <div class="skeleton-line w-50"></div>
          <div class="skeleton-line w-100"></div>
          <div class="skeleton-line w-100"></div>
        </div>
      </div>`;

    try {
      // Abort previous request if any
      if (this._abortController) {
        this._abortController.abort();
      }
      this._abortController = new AbortController();
      
      // Muat work_methods dan jadwal secara paralel dengan timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout loading schedule data')), 30000);
      });
      
      const loadPromise = Promise.all([
        DataAccess.getWorkMethodsByProject(projectId),
        DataAccess.getScheduleByProject(projectId)
      ]);
      
      const [workMethods, existingSchedule] = await Promise.race([loadPromise, timeoutPromise]);

      // Bangun map work method
      this._workMethodMap = {};
      workMethods.forEach(wm => {
        this._workMethodMap[wm.id] = wm;
      });

      // Bangun _scheduleRows dengan batasan maksimal
      const MAX_ROWS = 500;
      this._scheduleRows = [];

      for (const wm of workMethods) {
        if (this._scheduleRows.length >= MAX_ROWS) {
          console.warn(`[SchedulePage] Reached max rows limit (${MAX_ROWS}), truncating`);
          break;
        }
        
        const steps = Array.isArray(wm.work_steps) ? wm.work_steps.slice(0, 50) : []; // Max 50 steps per WM
        for (let idx = 0; idx < steps.length; idx++) {
          const step = steps[idx];
          const stepNum = step.step_number || (idx + 1);
          const existing = existingSchedule.find(
            s => s.work_method_id === wm.id && String(s.step_number) === String(stepNum)
          );
          this._scheduleRows.push({
            id:             existing?.id || null,
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
        }
      }

      // Urutkan
      this._scheduleRows.sort((a, b) => {
        const docCmp = a.document_number.localeCompare(b.document_number);
        return docCmp !== 0 ? docCmp : a.step_number - b.step_number;
      });

      this._renderSchedule();
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[SchedulePage] Request aborted');
        return;
      }
      AppError.handle(err, 'Memuat jadwal');
      const content = document.getElementById('scheduleContent');
      if (content) {
        content.innerHTML = `
          <div class="alert alert-danger m-3">
            <i class="bi bi-exclamation-triangle-fill"></i>
            Gagal memuat jadwal: ${err.message}
            <button class="btn btn--outline-danger btn-sm ms-3" onclick="SchedulePage.onProjectChange()">
              <i class="bi bi-arrow-clockwise"></i> Coba Lagi
            </button>
          </div>`;
      }
    } finally {
      this._abortController = null;
    }
  },

  /* ──────────────────── RENDER (OPTIMIZED) ──────────────────── */
  _renderSchedule() {
    if (this._isDestroyed) return;
    
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

    // Hitung ringkasan dengan batasan
    const totalRows = this._scheduleRows.length;
    const doneCount = this._getCount('done');
    const activeCount = this._getCount('active');
    const pendingCount = totalRows - doneCount - activeCount;

    // Group per dokumen dengan batasan
    const grouped = {};
    for (const row of this._scheduleRows) {
      if (!grouped[row.document_number]) grouped[row.document_number] = [];
      if (grouped[row.document_number].length < 100) { // Max 100 steps per group display
        grouped[row.document_number].push(row);
      }
    }

    let globalCounter = 0;

    // Build HTML dengan DocumentFragment untuk performance
    const tableBody = document.createElement('tbody');
    tableBody.id = 'scheduleTableBody';

    for (const [docNum, rows] of Object.entries(grouped)) {
      // Group header row
      const headerRow = document.createElement('tr');
      headerRow.style.background = 'var(--color-primary-bg)';
      headerRow.innerHTML = `
        <td colspan="6" style="padding:6px 12px;font-weight:600;font-size:.8rem;color:var(--color-primary);">
          <i class="bi bi-diagram-3"></i> ${UtilityService.escapeHtml(docNum)}
          <span class="ms-2 badge bg-primary" style="font-size:.68rem;">${rows.length} langkah</span>
        </td>
      `;
      tableBody.appendChild(headerRow);

      for (const item of rows) {
        globalCounter++;
        const { statusBadge, rowStyle } = this._getStatusUI(item);
        const rowIdx = this._scheduleRows.indexOf(item);

        const row = document.createElement('tr');
        row.setAttribute('data-row-idx', rowIdx);
        if (rowStyle) row.setAttribute('style', rowStyle);
        
        row.innerHTML = `
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
        `;
        tableBody.appendChild(row);
      }
    }

    // Build complete HTML
    const summaryHtml = `
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
            </table>
          </div>
        </div>
      </div>`;

    content.innerHTML = summaryHtml;

    // Append the tbody to the table
    const table = document.getElementById('scheduleTable');
    if (table) {
      // Remove existing tbody if any
      const existingTbody = table.querySelector('tbody');
      if (existingTbody) existingTbody.remove();
      table.appendChild(tableBody);
    }

    // Pasang event listener (single delegation)
    const scheduleTable = document.getElementById('scheduleTable');
    if (scheduleTable) {
      // Remove old listener first
      if (this._dateChangeHandler) {
        scheduleTable.removeEventListener('change', this._dateChangeHandler);
      }
      this._dateChangeHandler = (e) => {
        const input = e.target.closest('.schedule-date');
        if (!input) return;
        this._onDateChange(input);
      };
      scheduleTable.addEventListener('change', this._dateChangeHandler);
      this._eventListeners.push({ element: scheduleTable, event: 'change', handler: this._dateChangeHandler });
    }
  },

  /* ──────────────────── DATE CHANGE HANDLER (DEBOUNCED) ──────────────────── */
  _onDateChange(input) {
    if (this._isDestroyed) return;
    
    const idx = parseInt(input.dataset.rowIdx, 10);
    if (isNaN(idx)) return;
    
    const field = input.dataset.field;
    const item = this._scheduleRows[idx];
    if (!item) return;

    const oldValue = item[field];
    const newValue = input.value;
    
    if (oldValue === newValue) return;
    
    item[field] = newValue;
    item.isDirty = true;

    // Validasi silang start ≤ end
    const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
    if (row) {
      const startInput = row.querySelector('[data-field="start_date"]');
      const endInput = row.querySelector('[data-field="end_date"]');
      const hasStart = startInput?.value;
      const hasEnd = endInput?.value;

      if (hasStart && hasEnd) {
        const invalid = new Date(startInput.value) > new Date(endInput.value);
        const color = invalid ? 'var(--color-danger)' : 'var(--color-success)';
        [startInput, endInput].forEach(el => {
          if (el) {
            el.style.border = `2px solid ${color}`;
            el.style.background = invalid ? 'var(--color-danger-bg)' : '';
          }
        });
        if (!invalid) {
          setTimeout(() => {
            [startInput, endInput].forEach(el => {
              if (el) {
                el.style.border = '';
                el.style.background = '';
              }
            });
          }, 1500);
        }
      }
    }

    this._updateRowStatus(idx);
    this._updateDirtyBanner();

    // Auto-save after 3 seconds of inactivity (optional feature)
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      if (this._scheduleRows.some(s => s.isDirty)) {
        this.saveAllSchedules();
      }
    }, 5000);
  },

  /* ──────────────────── STATUS HELPERS ──────────────────── */
  _getStatusUI(item) {
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);

    if (!item.start_date || !item.end_date) {
      return { 
        statusBadge: '<span class="badge bg-secondary" style="font-size:.68rem;">Belum diatur</span>', 
        rowStyle: '' 
      };
    }
    if (new Date(item.start_date) > new Date(item.end_date)) {
      return { 
        statusBadge: '<span class="badge bg-danger" style="font-size:.68rem;">Tanggal tidak valid</span>', 
        rowStyle: 'background:#fff5f5;' 
      };
    }
    const end = new Date(item.end_date); 
    end.setHours(0, 0, 0, 0);
    const start = new Date(item.start_date); 
    start.setHours(0, 0, 0, 0);

    if (end < today) {
      return { 
        statusBadge: '<span class="badge bg-success" style="font-size:.68rem;">Selesai</span>', 
        rowStyle: 'background:#f0fdf4;' 
      };
    }
    if (start <= today) {
      return { 
        statusBadge: '<span class="badge bg-warning text-dark" style="font-size:.68rem;">Berlangsung</span>', 
        rowStyle: 'background:#fffbeb;' 
      };
    }
    return { 
      statusBadge: '<span class="badge bg-info" style="font-size:.68rem;">Mendatang</span>', 
      rowStyle: 'background:#f0f9ff;' 
    };
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
    const bgMatch = rowStyle.match(/background:([^;}"]+)/);
    if (bgMatch) {
      row.style.background = bgMatch[1].trim();
    } else {
      row.style.background = '';
    }
  },

  _updateDirtyBanner() {
    if (this._isDestroyed) return;
    
    const hasDirty = this._scheduleRows.some(s => s.isDirty);
    const table = document.getElementById('scheduleTable');
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
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    let count = 0;
    for (const s of this._scheduleRows) {
      if (!s.start_date || !s.end_date) {
        if (type === 'pending') count++;
        continue;
      }
      if (new Date(s.start_date) > new Date(s.end_date)) continue;
      const start = new Date(s.start_date); 
      start.setHours(0, 0, 0, 0);
      const end = new Date(s.end_date); 
      end.setHours(0, 0, 0, 0);
      if (type === 'done' && end < today) count++;
      else if (type === 'active' && start <= today && end >= today) count++;
    }
    return count;
  },

  /* ──────────────────── SAVE (FIXED WITH BETTER ERROR HANDLING) ──────────────────── */
  async saveAllSchedules() {
    if (this._isDestroyed) {
      UIService.showToast('Halaman sedang dimuat ulang, coba lagi nanti.', TOAST.WARNING);
      return;
    }
    
    if (this._isSaving) {
      UIService.showToast('Sedang menyimpan, harap tunggu...', TOAST.INFO);
      return;
    }
    
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

    // Hanya simpan baris yang berubah
    const rowsToSave = this._scheduleRows.filter(s => s.isDirty);
    if (rowsToSave.length === 0) {
      UIService.showToast('Tidak ada perubahan untuk disimpan.', TOAST.INFO);
      return;
    }

    this._isSaving = true;
    const saveBtn = document.getElementById('btnSaveSchedule');
    const originalBtnHtml = saveBtn?.innerHTML;
    if (saveBtn) { 
      saveBtn.disabled = true; 
      saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan...';
    }

    try {
      const now = new Date().toISOString();
      const operations = rowsToSave.map((s, idx) => {
        if (!s.id) {
          s.id = 'sch_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 5);
        }
        return {
          sheet: SHEETS.SCHEDULE,
          data: {
            id: s.id,
            project_id: s.project_id,
            work_method_id: s.work_method_id,
            document_number: s.document_number,
            step_number: s.step_number,
            work_stage: s.work_stage,
            work_process: s.work_process,
            start_date: s.start_date || '',
            end_date: s.end_date || '',
            updated_at: now
          }
        };
      });

      console.log(`[SchedulePage] Saving ${operations.length} schedules...`);
      
      // Gunakan batchUpsert dengan timeout yang lebih panjang
      await DB.batchUpsert(operations);

      // Invalidate cache
      AppCache.invalidateRelated(SHEETS.SCHEDULE, { projectId: this._currentProjectId });

      // Reset dirty flags
      for (const s of this._scheduleRows) {
        s.isDirty = false;
      }
      
      this._updateDirtyBanner();
      
      // Refresh tampilan tanpa reload penuh (update status saja)
      this._refreshStatusesOnly();
      
      UIService.showToast(`${operations.length} jadwal berhasil disimpan!`, TOAST.SUCCESS);
    } catch (err) {
      console.error('[SchedulePage] Gagal menyimpan jadwal:', err);
      AppError.handle(err, 'Menyimpan jadwal');
      
      // Fallback: simpan satu per satu jika batch gagal
      if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
        UIService.showToast('Batch timeout, mencoba simpan satu per satu...', TOAST.WARNING);
        let savedCount = 0;
        for (const row of rowsToSave) {
          try {
            await DB.upsert(SHEETS.SCHEDULE, {
              id: row.id || ('sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
              project_id: row.project_id || this._currentProjectId,
              work_method_id: row.work_method_id,
              document_number: row.document_number,
              step_number: row.step_number,
              work_stage: row.work_stage,
              work_process: row.work_process,
              start_date: row.start_date || '',
              end_date: row.end_date || '',
              updated_at: new Date().toISOString()
            });
            savedCount++;
            row.isDirty = false;
            // Delay kecil antar request
            await new Promise(r => setTimeout(r, 200));
          } catch (singleErr) {
            console.error(`[SchedulePage] Gagal simpan baris ${row.step_number}:`, singleErr);
          }
        }
        
        if (savedCount > 0) {
          AppCache.invalidateRelated(SHEETS.SCHEDULE, { projectId: this._currentProjectId });
          this._updateDirtyBanner();
          this._refreshStatusesOnly();
          UIService.showToast(`${savedCount}/${rowsToSave.length} jadwal berhasil disimpan!`, TOAST.SUCCESS);
        } else {
          UIService.showToast('Gagal menyimpan jadwal. Silakan coba lagi.', TOAST.DANGER);
        }
      } else {
        UIService.showToast('Gagal menyimpan jadwal: ' + err.message, TOAST.DANGER);
      }
    } finally {
      this._isSaving = false;
      if (saveBtn) { 
        saveBtn.disabled = false; 
        saveBtn.innerHTML = originalBtnHtml || '<i class="bi bi-save"></i> Simpan Jadwal'; 
      }
    }
  },

  _refreshStatusesOnly() {
    // Update status tanpa re-render penuh
    for (let i = 0; i < this._scheduleRows.length; i++) {
      this._updateRowStatus(i);
    }
  }
};

export { SchedulePage };