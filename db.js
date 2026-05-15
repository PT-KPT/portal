// db.js — ES6 Module v3.0 - FIXED: Race condition, batch operation deadlock, loading spinner
import { GS_API_URL, GS_API_TOKEN } from './config.js';
import { AppCache } from './cache.js';

const GS_URL   = GS_API_URL;
const GS_TOKEN = GS_API_TOKEN;

const DEFAULT_TIMEOUT  = 15000;
const BATCH_TIMEOUT    = 60000;
const MAX_BATCH_SIZE   = 50;

let _activeRequests = 0;
const MAX_CONCURRENT   = 4;
let _loadingCounter = 0;
let _loadingTimer = null;
let _isDestroyed = false;

// Abort controller untuk request yang sedang berjalan
let _activeControllers = new Set();

async function _fetchWithRetry(url, options = {}, retries = 3, delay = 1000, timeoutMs = DEFAULT_TIMEOUT) {
  let lastError;
  let attempt = 1;
  
  while (attempt <= retries) {
    let controller = null;
    try {
      while (_activeRequests >= MAX_CONCURRENT && !_isDestroyed) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (_isDestroyed) throw new Error('DB service destroyed');
      
      _activeRequests++;
      controller = new AbortController();
      _activeControllers.add(controller);
      
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(tid);
      
      _activeControllers.delete(controller);
      _activeRequests--;
      
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
      lastError = new Error(`Server error: ${response.status}`);
    } catch (error) {
      if (controller) _activeControllers.delete(controller);
      _activeRequests--;
      lastError = error.name === 'AbortError'
        ? new Error(`Request timeout setelah ${timeoutMs / 1000} detik`)
        : error;
    }
    
    if (attempt === retries) throw lastError;
    const wait = delay * Math.pow(2, attempt - 1) + Math.random() * 500;
    console.warn(`[DB] Retry ${attempt}/${retries} setelah ${Math.round(wait / 1000)}s:`, lastError?.message);
    await new Promise(r => setTimeout(r, wait));
    attempt++;
  }
  throw lastError;
}

// FIX: Abort semua request yang sedang berjalan
export function abortAllRequests() {
  _isDestroyed = true;
  _activeControllers.forEach(controller => {
    try { controller.abort(); } catch(e) {}
  });
  _activeControllers.clear();
  _showLoadingForceHide();
}

async function _get(params) {
  if (_isDestroyed) throw new Error('DB service destroyed');
  if (!GS_URL) throw new Error('GS_API_URL belum dikonfigurasi.');
  if (params.action !== 'ping' && GS_TOKEN) params.token = GS_TOKEN;
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => sp.append(k, v));
  const res  = await _fetchWithRetry(GS_URL + '?' + sp.toString());
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json;
}

async function _post(body, timeoutMs = DEFAULT_TIMEOUT) {
  if (_isDestroyed) throw new Error('DB service destroyed');
  if (!GS_URL) throw new Error('GS_API_URL belum dikonfigurasi.');
  if (body.action !== 'login' && GS_TOKEN) body.token = GS_TOKEN;
  const res  = await _fetchWithRetry(GS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }, 3, 1000, timeoutMs);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json;
}

// FIX: Loading spinner dengan counter yang aman
function _showLoading() {
  if (_isDestroyed) return;
  _loadingCounter++;
  if (_loadingTimer) clearTimeout(_loadingTimer);
  const spinner = document.getElementById('navbarLoadingSpinner');
  if (spinner && spinner.style.display !== 'block') {
    spinner.style.display = 'block';
    const video = spinner.querySelector('video');
    if (video && video.paused) video.play().catch(() => {});
  }
}

function _hideLoading() {
  if (_isDestroyed) return;
  _loadingCounter = Math.max(0, _loadingCounter - 1);
  if (_loadingCounter === 0) {
    _loadingTimer = setTimeout(() => {
      if (_loadingCounter === 0 && !_isDestroyed) {
        const spinner = document.getElementById('navbarLoadingSpinner');
        if (spinner && spinner.style.display === 'block') {
          spinner.style.display = 'none';
          const video = spinner.querySelector('video');
          if (video) video.pause();
        }
      }
    }, 200);
  }
}

function _showLoadingForceHide() {
  _loadingCounter = 0;
  if (_loadingTimer) clearTimeout(_loadingTimer);
  const spinner = document.getElementById('navbarLoadingSpinner');
  if (spinner) {
    spinner.style.display = 'none';
    const video = spinner.querySelector('video');
    if (video) video.pause();
  }
}

function _scheduleIdleOrTimeout(cb, timeout = 1000) {
  if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(cb);
  else setTimeout(cb, timeout);
}

export const DB = {
  // FIX: Destroy method untuk cleanup
  destroy() {
    _isDestroyed = true;
    abortAllRequests();
    _showLoadingForceHide();
    console.log('[DB] Destroyed');
  },

  async getAllBulk(sheets) {
    if (_isDestroyed) throw new Error('DB service destroyed');
    if (!sheets || sheets.length === 0) return {};
    
    const key = 'bulk::' + sheets.join(',');
    
    if (AppCache.isValid(key, 'default', false)) {
      return AppCache.get(key);
    }
    
    const allCached = sheets.every(sheet => {
      const sheetKey = AppCache.buildKey(sheet);
      return AppCache.isValid(sheetKey, sheet, false);
    });
    
    if (allCached) {
      const result = {};
      sheets.forEach(sheet => {
        const cached = AppCache.get(AppCache.buildKey(sheet));
        result[sheet] = cached;
      });
      AppCache.set(key, result, 'default');
      return result;
    }
    
    _showLoading();
    try {
      const params = { action: 'getBulk', sheets: sheets.join(',') };
      if (GS_TOKEN) params.token = GS_TOKEN;
      
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => sp.append(k, v));
      
      const res = await _fetchWithRetry(GS_URL + '?' + sp.toString());
      const json = await res.json();
      
      if (!json.ok) throw new Error(json.error || 'API error');
      
      Object.entries(json).forEach(([sheet, data]) => {
        if (data && data.rows !== undefined) {
          AppCache.set(AppCache.buildKey(sheet), data, sheet, {
            total: data.total,
            isPriority: AppCache.isPrioritySheet(sheet)
          });
        }
      });
      
      AppCache.set(key, json, 'default');
      return json;
    } catch (err) {
      console.warn('[DB] getAllBulk failed, falling back to individual requests:', err.message);
      const results = {};
      await Promise.allSettled(sheets.map(async (sheet) => {
        try {
          results[sheet] = await this.getAll(sheet);
        } catch (e) {
          results[sheet] = { rows: [], total: 0 };
        }
      }));
      AppCache.set(key, results, 'default');
      return results;
    } finally {
      _hideLoading();
    }
  },

  async getAll(sheet, opts = {}) {
    if (_isDestroyed) throw new Error('DB service destroyed');
    const key       = AppCache.buildKey(sheet, opts);
    const isPriority = AppCache.isPrioritySheet(sheet);

    if (AppCache.isValid(key, sheet, false)) {
      const cached = AppCache.get(key);
      if (isPriority && AppCache.shouldBackgroundRefresh(key, sheet)) {
        _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet));
      }
      return cached;
    }
    if (isPriority && AppCache.isStaleWindowValid(key, sheet)) {
      _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet));
      return AppCache.get(key);
    }
    const pending = AppCache.getPending(key);
    if (pending) return pending;

    _showLoading();
    const params = { action: 'getAll', sheet };
    if (opts.filterField) params.filterField = opts.filterField;
    if (opts.filterValue) params.filterValue = opts.filterValue;
    if (opts.searchField) params.searchField = opts.searchField;
    if (opts.searchValue) params.searchValue = opts.searchValue;
    if (opts.limit)  params.limit  = opts.limit;
    if (opts.offset) params.offset = opts.offset;
    if (opts.fields) params.fields = opts.fields.join(',');

    const promise = _get(params).then(r => {
      const result = { rows: r.rows || [], total: r.total || 0 };
      AppCache.set(key, result, sheet, { total: r.total, isPriority });
      AppCache.deletePending(key);
      _hideLoading();
      return result;
    }).catch(err => {
      AppCache.deletePending(key);
      _hideLoading();
      throw err;
    });
    AppCache.setPending(key, promise);
    return promise;
  },

  async getById(sheet, id) {
    if (_isDestroyed || !id) return null;
    const key       = sheet + '::id::' + id;
    const isPriority = AppCache.isPrioritySheet(sheet);
    if (AppCache.isValid(key, sheet, false)) return AppCache.get(key);
    if (isPriority && AppCache.isStaleWindowValid(key, sheet)) {
      _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet));
      return AppCache.get(key);
    }
    _showLoading();
    try {
      const r = await _get({ action: 'getById', sheet, id });
      if (r.row) AppCache.set(key, r.row, sheet, { isPriority });
      return r.row;
    } finally { _hideLoading(); }
  },

  async getCount(sheet) {
    if (_isDestroyed) return 0;
    const key       = sheet + '::count';
    const isPriority = AppCache.isPrioritySheet(sheet);
    if (AppCache.isValid(key, sheet, false)) return AppCache.get(key);
    if (isPriority && AppCache.isStaleWindowValid(key, sheet)) {
      _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet));
      return AppCache.get(key);
    }
    _showLoading();
    try {
      const r = await _get({ action: 'getCount', sheet });
      AppCache.set(key, r.count, sheet, { isPriority });
      return r.count;
    } finally { _hideLoading(); }
  },

  async getCounts(sheets) {
    if (_isDestroyed) return {};
    const key = 'counts::' + sheets.join(',');
    if (AppCache.isValid(key, 'default')) return AppCache.get(key);
    _showLoading();
    try {
      const r = await _get({ action: 'getCounts', sheets: sheets.join(',') });
      AppCache.set(key, r, 'default');
      return r;
    } finally { _hideLoading(); }
  },

  async getProjectSummary(projectId) {
    if (_isDestroyed || !projectId) return { jsa_count: 0, wm_count: 0, po_count: 0, mp_count: 0, operational_count: 0, total_po: 0, total_operational: 0 };
    const key = 'summary::' + projectId;
    if (AppCache.isValid(key, 'default')) return AppCache.get(key);
    _showLoading();
    try {
      const r = await _get({ action: 'getSummary', projectId });
      AppCache.set(key, r, 'default');
      return r;
    } finally { _hideLoading(); }
  },

  async getStats() {
    if (_isDestroyed) return {};
    const key = 'dashboard_stats';
    if (AppCache.isValid(key, 'default')) return AppCache.get(key);
    _showLoading();
    try {
      const r = await _get({ action: 'getStats' });
      AppCache.set(key, r, 'default');
      return r;
    } finally { _hideLoading(); }
  },

  async getRecent(sheet, limit = 5) {
    if (_isDestroyed) return [];
    const key = sheet + '::recent::' + limit;
    if (AppCache.isValid(key, sheet)) return AppCache.get(key);
    _showLoading();
    try {
      const r = await _get({ action: 'getRecent', sheet, limit });
      const rows = r.rows || [];
      AppCache.set(key, rows, sheet);
      return rows;
    } finally { _hideLoading(); }
  },

  async upsert(sheet, data) {
    if (_isDestroyed) throw new Error('DB service destroyed');
    const key      = AppCache.buildKey(sheet);
    const cached   = AppCache.get(key);
    const oldCache = cached ? { ...cached, rows: [...(cached.rows || [])] } : null;
    const isPriority = AppCache.isPrioritySheet(sheet);
    _showLoading();
    try {
      const r = await _post({ action: 'upsert', sheet, data });
      
      AppCache.invalidateSheetOnly(sheet);
      if (data.project_id) {
        AppCache.invalidateByProject(sheet, data.project_id);
      }
      if (['jsa', 'work_methods', 'manpower', 'procurement', 'jadwal', 'operational'].includes(sheet) && data.project_id) {
        AppCache.invalidateByDependency(`projects:${data.project_id}`);
      }
      
      if (isPriority) _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet), 500);
      return r.row;
    } catch (error) {
      if (oldCache) AppCache.set(key, oldCache, sheet);
      else AppCache.invalidateSheetOnly(sheet);
      throw error;
    } finally { _hideLoading(); }
  },

  async delete(sheet, id) {
    if (_isDestroyed) return false;
    const key      = AppCache.buildKey(sheet);
    const cached   = AppCache.get(key);
    const oldCache = cached ? { ...cached, rows: [...(cached.rows || [])] } : null;
    const isPriority = AppCache.isPrioritySheet(sheet);
    _showLoading();
    try {
      let projectId = null;
      try {
        const existing = await this.getById(sheet, id);
        if (existing?.project_id) projectId = existing.project_id;
      } catch {}
      const r = await _post({ action: 'delete', sheet, id });
      AppCache.invalidateSheetOnly(sheet);
      if (projectId) {
        AppCache.invalidateByProject(sheet, projectId);
      }
      if (isPriority) _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet), 500);
      return r.deleted;
    } catch (error) {
      if (oldCache) AppCache.set(key, oldCache, sheet);
      else AppCache.invalidateSheetOnly(sheet);
      throw error;
    } finally { _hideLoading(); }
  },

  async deleteWhere(sheet, field, value) {
    if (_isDestroyed) return 0;
    const isPriority = AppCache.isPrioritySheet(sheet);
    _showLoading();
    try {
      const r = await _post({ action: 'deleteWhere', sheet, field, value });
      AppCache.invalidateSheetOnly(sheet);
      if (field === 'project_id' && value) {
        AppCache.invalidateByProject(sheet, value);
      }
      if (isPriority) _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet), 500);
      return r.deleted;
    } finally { _hideLoading(); }
  },

  // FIX: batchUpsert dengan chunking yang aman dan retry logic yang lebih baik
  async batchUpsert(operations) {
    if (_isDestroyed) throw new Error('DB service destroyed');
    if (!operations || operations.length === 0) return [];
    
    const affected = {};
    operations.forEach(op => {
      if (!op.sheet || !op.data) return;
      if (!affected[op.sheet]) affected[op.sheet] = new Set();
      if (op.data.project_id) affected[op.sheet].add(op.data.project_id);
    });
    
    _showLoading();
    try {
      let allResults = [];
      
      // Split menjadi chunks
      const chunks = [];
      for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
        chunks.push(operations.slice(i, i + MAX_BATCH_SIZE));
      }
      
      // Proses chunks dengan delay antar chunk untuk mencegah overload
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        let chunkSuccess = false;
        let retryCount = 0;
        const MAX_RETRIES = 2;
        
        while (!chunkSuccess && retryCount <= MAX_RETRIES && !_isDestroyed) {
          try {
            const r = await _post({ action: 'batchUpsert', operations: chunk }, BATCH_TIMEOUT);
            allResults = allResults.concat(r.rows || []);
            chunkSuccess = true;
          } catch (err) {
            retryCount++;
            console.error(`[DB] Batch chunk ${chunkIndex + 1} attempt ${retryCount} failed:`, err.message);
            
            if (retryCount > MAX_RETRIES) {
              // Fallback: simpan satu per satu untuk chunk ini
              console.warn(`[DB] Falling back to individual upsert for chunk ${chunkIndex + 1}`);
              for (const op of chunk) {
                try {
                  const singleResult = await this.upsert(op.sheet, op.data);
                  if (singleResult) allResults.push(singleResult);
                  // Delay kecil antar individual upsert
                  await new Promise(r => setTimeout(r, 100));
                } catch (se) { 
                  console.error('[DB] Individual upsert failed:', se.message);
                }
              }
              chunkSuccess = true;
            } else {
              // Exponential backoff sebelum retry
              const waitTime = 1000 * Math.pow(2, retryCount - 1);
              await new Promise(r => setTimeout(r, waitTime));
            }
          }
        }
        
        // Delay antar chunks untuk mencegah rate limiting
        if (chunkIndex < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      // Invalidate cache setelah semua selesai
      Object.entries(affected).forEach(([sheet, projectIds]) => {
        AppCache.invalidateSheetOnly(sheet);
        projectIds.forEach(pid => {
          AppCache.invalidateByProject(sheet, pid);
          if (['jsa', 'work_methods', 'manpower', 'procurement', 'jadwal', 'operational'].includes(sheet)) {
            AppCache.invalidateByDependency(`projects:${pid}`);
          }
        });
        if (AppCache.isPrioritySheet(sheet)) _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet), 500);
      });
      
      return allResults;
    } finally { 
      _hideLoading(); 
    }
  },

  async batchDelete(operations) {
    if (_isDestroyed) return 0;
    const affected = {};
    operations.forEach(op => {
      if (!op.sheet) return;
      if (!affected[op.sheet]) affected[op.sheet] = new Set();
      if (op.field === 'project_id' && op.value) affected[op.sheet].add(op.value);
    });
    _showLoading();
    try {
      const r = await _post({ action: 'batchDelete', operations }, BATCH_TIMEOUT);
      Object.entries(affected).forEach(([sheet, projectIds]) => {
        AppCache.invalidateSheetOnly(sheet);
        projectIds.forEach(pid => {
          AppCache.invalidateByProject(sheet, pid);
        });
        if (AppCache.isPrioritySheet(sheet)) _scheduleIdleOrTimeout(() => AppCache.refreshStale(sheet), 500);
      });
      return r.deleted;
    } finally { _hideLoading(); }
  },

  async initSheets() {
    if (_isDestroyed) return null;
    _showLoading();
    try { return await _post({ action: 'initSheets' }); }
    finally { _hideLoading(); }
  },

  async post(body) {
    if (_isDestroyed) throw new Error('DB service destroyed');
    _showLoading();
    try { return await _post(body); }
    finally { _hideLoading(); }
  }
};

export const StorageService = {
  async getData(sheet) {
    try {
      const result = await DB.getAll(sheet);
      return result.rows || [];
    } catch (err) {
      console.error('[StorageService] getData error:', sheet, err);
      return [];
    }
  },

  async saveData(sheet, dataArray) {
    try {
      await DB.batchUpsert(dataArray.map(data => ({ sheet, data })));
      return true;
    } catch (err) {
      console.error('[StorageService] saveData error:', sheet, err);
      try {
        for (const row of dataArray) await DB.upsert(sheet, row);
        return true;
      } catch (err2) {
        console.error('[StorageService] saveData fallback error:', sheet, err2);
        return false;
      }
    }
  },

  invalidateCache(sheet) {
    AppCache.invalidateSheetOnly(sheet);
  },

  addAuditLog(actionType, description) {
    console.info('[Audit]', actionType, description);
  }
};

export const DataAccess = {
  getCurrentUser() {
    const session = window.AuthService?.getCurrentUser?.();
    return (session && session.name) ? session.name : 'Admin KPT';
  },

  async getCompany()             { const list = await StorageService.getData('company'); return list.length > 0 ? list[0] : null; },
  async isCompanyComplete()      { const c = await this.getCompany(); return !!(c && c.name && c.name.trim().length > 0); },
  async saveCompany(data)        { if (!data || !data.name) return null; data.updated_at = new Date().toISOString(); await DB.upsert('company', data); StorageService.invalidateCache('company'); StorageService.addAuditLog('UPDATE_COMPANY', 'Profil perusahaan diperbarui'); return data; },

  async getAllProjects()          { return StorageService.getData('projects'); },
  async hasProjects()            { return (await DB.getCount('projects')) > 0; },
  async getProjectById(id)       { return id ? DB.getById('projects', id) : null; },
  async saveProject(data)        { if (!data || !data.id) return null; data.updated_at = new Date().toISOString(); if (!data.created_at) data.created_at = new Date().toISOString(); await DB.upsert('projects', data); StorageService.invalidateCache('projects'); StorageService.addAuditLog('SAVE_PROJECT', `Proyek ${data.name} disimpan`); return data; },
  async deleteProject(id)        {
    if (!id) return false;
    _showLoading();
    try { 
      const r = await _post({ action: 'deleteProject', projectId: id });
      AppCache.invalidateRelated('projects', { projectId: id });
      StorageService.invalidateCache('projects');
      StorageService.addAuditLog('DELETE_PROJECT', `Proyek ${id} beserta data terkait dihapus`);
      return r.deleted;
    } finally { _hideLoading(); }
  },

  async getAllJSA()               { return StorageService.getData('jsa'); },
  async getJSAById(id)           { return id ? DB.getById('jsa', id) : null; },
  async getJSAByProject(pid)     { if (!pid) return []; const r = await DB.getAll('jsa', { filterField:'project_id', filterValue: pid }); return r.rows || []; },
  async saveJSA(data)            { if (!data || !data.id) return null; data.updated_at = new Date().toISOString(); if (!data.created_at) data.created_at = new Date().toISOString(); await DB.upsert('jsa', data); StorageService.invalidateCache('jsa'); StorageService.addAuditLog('SAVE_JSA', `JSA ${data.document_number || data.id} disimpan`); return data; },
  async deleteJSA(id)            { if (!id) return false; await DB.delete('jsa', id); StorageService.invalidateCache('jsa'); return true; },

  async getAllWorkMethods()       { return StorageService.getData('work_methods'); },
  async getWorkMethodById(id)    { return id ? DB.getById('work_methods', id) : null; },
  async getWorkMethodsByProject(pid) { if (!pid) return []; const r = await DB.getAll('work_methods', { filterField:'project_id', filterValue: pid }); return r.rows || []; },
  async saveWorkMethod(data)     { if (!data || !data.id) return null; data.updated_at = new Date().toISOString(); if (!data.created_at) data.created_at = new Date().toISOString(); await DB.upsert('work_methods', data); StorageService.invalidateCache('work_methods'); StorageService.addAuditLog('SAVE_WORK_METHOD', `WM ${data.document_number || data.id} disimpan`); return data; },
  async deleteWorkMethod(id)     { if (!id) return false; await DB.delete('work_methods', id); await DB.deleteWhere('jadwal', 'work_method_id', id); AppCache.invalidate('jadwal'); StorageService.invalidateCache('work_methods'); return true; },

  async getScheduleByProject(pid)  { if (!pid) return []; const r = await DB.getAll('jadwal', { filterField:'project_id', filterValue: pid }); return r.rows || []; },
  async saveScheduleRows(rows)     {
    if (!rows?.length) return [];
    const now = new Date().toISOString();
    const affectedProjects = new Set();
    const operations = rows.map(row => {
      if (row.project_id) affectedProjects.add(row.project_id);
      return { sheet: 'jadwal', data: { id: row.id, project_id: row.project_id, work_method_id: row.work_method_id, document_number: row.document_number, step_number: row.step_number, work_stage: row.work_stage || '', work_process: row.work_process || '', start_date: row.start_date || '', end_date: row.end_date || '', updated_at: now } };
    });
    const result = await DB.batchUpsert(operations);
    affectedProjects.forEach(pid => AppCache.invalidateSheetOnly('jadwal'));
    return result;
  },
  async deleteScheduleByProject(pid) { if (!pid) return false; await DB.deleteWhere('jadwal', 'project_id', pid); AppCache.invalidateSheetOnly('jadwal'); return true; },

  async getAllPersonnel()         { return StorageService.getData('personnel'); },
  async savePersonnel(data)      { if (!data || !data.id) return null; data.updated_at = new Date().toISOString(); await DB.upsert('personnel', data); StorageService.invalidateCache('personnel'); StorageService.addAuditLog('SAVE_PERSONNEL', `Personel ${data.name} disimpan`); return data; },
  async deletePersonnel(id)      { if (!id) return false; await DB.batchDelete([{ sheet:'manpower', field:'personnel_id', value: id }]); AppCache.invalidateSheetOnly('manpower'); await DB.delete('personnel', id); AppCache.invalidateSheetOnly('personnel'); StorageService.invalidateCache('personnel'); StorageService.addAuditLog('DELETE_PERSONNEL', `Personel ${id} dihapus`); return true; },

  async getAllManpower()          { return StorageService.getData('manpower'); },
  async getManpowerByProject(pid){ if (!pid) return []; const r = await DB.getAll('manpower', { filterField:'project_id', filterValue: pid }); return r.rows || []; },
  async getPersonnelByProject(pid) {
    if (!pid) return [];
    const [assignments, personnel] = await Promise.all([this.getManpowerByProject(pid), this.getAllPersonnel()]);
    const assignedIds = new Set(assignments.map(a => a.personnel_id));
    return personnel.filter(p => assignedIds.has(p.id));
  },
  async saveManpower({ project_id, personnel_ids }) {
    if (!project_id) return null;
    await DB.deleteWhere('manpower', 'project_id', project_id);
    const operations = (personnel_ids || []).map(pid => ({ sheet: 'manpower', data: { id: 'mp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), project_id, personnel_id: pid, updated_at: new Date().toISOString() } }));
    if (operations.length > 0) await DB.batchUpsert(operations);
    AppCache.invalidateSheetOnly('manpower');
    return personnel_ids;
  },
  async deleteManpowerByProject(pid) { if (!pid) return false; await DB.deleteWhere('manpower', 'project_id', pid); AppCache.invalidateSheetOnly('manpower'); return true; },

  async getAllPO()                { return StorageService.getData('procurement'); },
  async getPOById(id)            { return id ? DB.getById('procurement', id) : null; },
  async getPOByProject(pid)      { if (!pid) return []; const r = await DB.getAll('procurement', { filterField:'project_id', filterValue: pid }); return r.rows || []; },
  async savePO(data)             { if (!data || !data.id) return null; data.updated_at = new Date().toISOString(); if (!data.created_at) data.created_at = new Date().toISOString(); await DB.upsert('procurement', data); StorageService.invalidateCache('procurement'); return data; },
  async saveMultiplePO(poArray)  {
    if (!poArray?.length) return [];
    const affectedProjects = new Set();
    const operations = poArray.map(po => { if (po.project_id) affectedProjects.add(po.project_id); return { sheet:'procurement', data: { ...po, updated_at: new Date().toISOString(), created_at: po.created_at || new Date().toISOString() } }; });
    const results = await DB.batchUpsert(operations);
    affectedProjects.forEach(pid => AppCache.invalidateSheetOnly('procurement'));
    return results;
  },
  async deletePO(id)             { if (!id) return false; await DB.delete('procurement', id); StorageService.invalidateCache('procurement'); return true; },

  async getAllOperational()          { return StorageService.getData('operational'); },
  async getOperationalById(id)       { return id ? DB.getById('operational', id) : null; },
  async getOperationalByProject(pid) { 
    if (!pid) return []; 
    const r = await DB.getAll('operational', { filterField: 'project_id', filterValue: pid }); 
    return r.rows || []; 
  },
  async saveOperational(data) { 
    if (!data || !data.id) return null; 
    data.updated_at = new Date().toISOString(); 
    if (!data.created_at) data.created_at = new Date().toISOString(); 
    await DB.upsert('operational', data); 
    StorageService.invalidateCache('operational'); 
    StorageService.addAuditLog('SAVE_OPERATIONAL', `Operational ${data.description || data.id} disimpan`); 
    return data; 
  },
  async saveMultipleOperational(opArray) {
    if (!opArray?.length) return [];
    const affectedProjects = new Set();
    const operations = opArray.map(op => { 
      if (op.project_id) affectedProjects.add(op.project_id); 
      return { 
        sheet: 'operational', 
        data: { 
          ...op, 
          updated_at: new Date().toISOString(), 
          created_at: op.created_at || new Date().toISOString() 
        } 
      }; 
    });
    const results = await DB.batchUpsert(operations);
    affectedProjects.forEach(pid => AppCache.invalidateSheetOnly('operational'));
    return results;
  },
  async deleteOperational(id) { 
    if (!id) return false; 
    await DB.delete('operational', id); 
    StorageService.invalidateCache('operational'); 
    return true; 
  },
  async deleteOperationalByProject(pid) { 
    if (!pid) return false; 
    await DB.deleteWhere('operational', 'project_id', pid); 
    AppCache.invalidateSheetOnly('operational'); 
    return true; 
  },

  async getAccounts()            { return StorageService.getData('accounts'); },
  async saveAccount(data)        { await DB.upsert('accounts', data); StorageService.invalidateCache('accounts'); return data; },
  async deleteAccount(username)  { await DB.deleteWhere('accounts', 'username', username); StorageService.invalidateCache('accounts'); return true; },
};