// db.js — v2.1 with Batch Chunking & Timeout Fix

const GS_URL = window.GS_API_URL || '';
const GS_TOKEN = window.GS_API_TOKEN || '';

// PERFORMANCE: Connection pooling & retry optimization
const _fetchController = new AbortController();
let _activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3;

// FIX: Tingkatkan timeout untuk batch operations
const DEFAULT_TIMEOUT = 15000; // 15 detik untuk single operations
const BATCH_TIMEOUT = 60000;   // 60 detik untuk batch operations
const MAX_BATCH_SIZE = 50;     // Maksimum items per batch request

async function _fetchWithRetry(url, options = {}, retries = 3, delay = 1000, timeoutMs = DEFAULT_TIMEOUT) {
  let lastError;
  
  // PERFORMANCE: Batasi concurrent requests
  while (_activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  _activeRequests++;
  
  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }
        lastError = new Error(`Server error: ${response.status}`);
      } catch (error) {
        lastError = error;
        // FIX: Lebih informatif untuk timeout
        if (error.name === 'AbortError') {
          lastError = new Error(`Request timeout setelah ${timeoutMs/1000} detik`);
        }
      }
      
      if (attempt === retries) throw lastError;
      
      // PERFORMANCE: Exponential backoff dengan jitter
      const jitter = Math.random() * 500;
      const waitTime = delay * Math.pow(2, attempt - 1) + jitter;
      console.warn(`[DB] Retry ${attempt}/${retries} setelah ${Math.round(waitTime/1000)}s:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  } finally {
    _activeRequests--;
  }
}

async function _get(params) {
  if (!GS_URL) throw new Error('GS_API_URL belum dikonfigurasi.');
  if (params.action !== 'ping' && GS_TOKEN) params.token = GS_TOKEN;
  
  // PERFORMANCE: Gunakan URLSearchParams yang lebih efisien
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, value);
  });
  
  const url = GS_URL + '?' + searchParams.toString();
  const res = await _fetchWithRetry(url);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json;
}

async function _post(body, timeoutMs = DEFAULT_TIMEOUT) {
  if (!GS_URL) throw new Error('GS_API_URL belum dikonfigurasi.');
  if (body.action !== 'login' && GS_TOKEN) body.token = GS_TOKEN;
  
  const res = await _fetchWithRetry(GS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  }, 3, 1000, timeoutMs);
  
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json;
}

let _loadingCount = 0;
let _loadingTimer = null;

// PERFORMANCE: Debounce loading indicator
function _showLoading() {
  _loadingCount++;
  if (_loadingTimer) clearTimeout(_loadingTimer);
  
  const spinner = document.getElementById('navbarLoadingSpinner');
  if (spinner) {
    spinner.style.display = 'block';
    const video = spinner.querySelector('video');
    if (video && video.paused) video.play().catch(() => {});
  }
}

function _hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) {
    // PERFORMANCE: Delay hide untuk mengurangi flicker
    _loadingTimer = setTimeout(() => {
      const spinner = document.getElementById('navbarLoadingSpinner');
      if (spinner) {
        spinner.style.display = 'none';
        const video = spinner.querySelector('video');
        if (video) video.pause();
      }
    }, 200);
  }
}

const DB = {
  // PERFORMANCE: Batch fetching untuk mengurangi API calls
  async _batchFetch(sheets, optsMap = {}) {
    const results = {};
    const promises = sheets.map(sheet => {
      const opts = optsMap[sheet] || {};
      return this.getAll(sheet, opts).then(result => {
        results[sheet] = result;
      });
    });
    await Promise.all(promises);
    return results;
  },

  async getAll(sheet, opts = {}) {
    const key = AppCache.buildKey(sheet, opts);
    const isPriority = AppCache.isPrioritySheet(sheet);

    if (AppCache.isValid(key, sheet, false)) {
      const cached = AppCache.get(key);
      if (isPriority && AppCache.shouldBackgroundRefresh(key, sheet)) {
        // PERFORMANCE: Gunakan idle callback untuk background refresh
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => AppCache.refreshStale(sheet));
        } else {
          setTimeout(() => AppCache.refreshStale(sheet), 1000);
        }
      }
      return cached;
    }

    if (isPriority && AppCache.isStaleWindowValid(key, sheet)) {
      const cached = AppCache.get(key);
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => AppCache.refreshStale(sheet));
      } else {
        setTimeout(() => AppCache.refreshStale(sheet), 1000);
      }
      return cached;
    }

    const pending = AppCache.getPending(key);
    if (pending) return pending;

    _showLoading();
    const params = { action: 'getAll', sheet };
    if (opts.filterField) params.filterField = opts.filterField;
    if (opts.filterValue) params.filterValue = opts.filterValue;
    if (opts.searchField) params.searchField = opts.searchField;
    if (opts.searchValue) params.searchValue = opts.searchValue;
    if (opts.limit) params.limit = opts.limit;
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
    if (!id) return null;
    const key = sheet + '::id::' + id;
    const isPriority = AppCache.isPrioritySheet(sheet);

    if (AppCache.isValid(key, sheet, false)) return AppCache.get(key);
    if (isPriority && AppCache.isStaleWindowValid(key, sheet)) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => AppCache.refreshStale(sheet));
      } else {
        setTimeout(() => AppCache.refreshStale(sheet), 1000);
      }
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
    const key = sheet + '::count';
    const isPriority = AppCache.isPrioritySheet(sheet);
    if (AppCache.isValid(key, sheet, false)) return AppCache.get(key);
    if (isPriority && AppCache.isStaleWindowValid(key, sheet)) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => AppCache.refreshStale(sheet));
      } else {
        setTimeout(() => AppCache.refreshStale(sheet), 1000);
      }
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
    if (!projectId) return { jsa_count: 0, wm_count: 0, po_count: 0, mp_count: 0 };
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
    const key = AppCache.buildKey(sheet);
    const cached = AppCache.get(key);
    const oldCache = cached ? { ...cached, rows: [...(cached.rows || [])] } : null;
    const isPriority = AppCache.isPrioritySheet(sheet);

    _showLoading();
    try {
      const r = await _post({ action: 'upsert', sheet, data });
      
      const options = {};
      if (data.project_id) {
        options.projectId = data.project_id;
      }
      if (data.id) {
        options.entityId = data.id;
      }
      AppCache.invalidateRelated(sheet, options);
      
      if (isPriority) {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => AppCache.refreshStale(sheet));
        } else {
          setTimeout(() => AppCache.refreshStale(sheet), 500);
        }
      }
      return r.row;
    } catch (error) {
      if (oldCache) AppCache.set(key, oldCache, sheet);
      else AppCache.invalidate(sheet);
      throw error;
    } finally { _hideLoading(); }
  },

  async delete(sheet, id) {
    const key = AppCache.buildKey(sheet);
    const cached = AppCache.get(key);
    const oldCache = cached ? { ...cached, rows: [...(cached.rows || [])] } : null;
    const isPriority = AppCache.isPrioritySheet(sheet);

    _showLoading();
    try {
      let projectId = null;
      try {
        const existing = await this.getById(sheet, id);
        if (existing && existing.project_id) {
          projectId = existing.project_id;
        }
      } catch (e) { /* Abaikan */ }
      
      const r = await _post({ action: 'delete', sheet, id });
      
      const options = {};
      if (projectId) options.projectId = projectId;
      AppCache.invalidateRelated(sheet, options);
      
      if (isPriority) {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => AppCache.refreshStale(sheet));
        } else {
          setTimeout(() => AppCache.refreshStale(sheet), 500);
        }
      }
      return r.deleted;
    } catch (error) {
      if (oldCache) AppCache.set(key, oldCache, sheet);
      else AppCache.invalidate(sheet);
      throw error;
    } finally { _hideLoading(); }
  },

  async deleteWhere(sheet, field, value) {
    const isPriority = AppCache.isPrioritySheet(sheet);
    
    _showLoading();
    try {
      const r = await _post({ action: 'deleteWhere', sheet, field, value });
      
      const options = {};
      if (field === 'project_id' && value) {
        options.projectId = value;
      }
      AppCache.invalidateRelated(sheet, options);
      
      if (isPriority) {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => AppCache.refreshStale(sheet));
        } else {
          setTimeout(() => AppCache.refreshStale(sheet), 500);
        }
      }
      return r.deleted;
    } finally { _hideLoading(); }
  },

  // FIX: Batch upsert dengan chunking untuk mencegah timeout
  async batchUpsert(operations) {
    const affected = {};
    operations.forEach(op => {
      if (!op.sheet || !op.data) return;
      if (!affected[op.sheet]) affected[op.sheet] = new Set();
      if (op.data.project_id) {
        affected[op.sheet].add(op.data.project_id);
      }
    });
    
    _showLoading();
    try {
      let allResults = [];
      
      // FIX: Pecah batch besar menjadi chunk kecil
      if (operations.length > MAX_BATCH_SIZE) {
        console.log(`[DB] Batch upsert: ${operations.length} operations, splitting into chunks of ${MAX_BATCH_SIZE}`);
        
        const chunks = [];
        for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
          chunks.push(operations.slice(i, i + MAX_BATCH_SIZE));
        }
        
        // Proses chunk satu per satu dengan timeout lebih panjang
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          console.log(`[DB] Processing chunk ${i + 1}/${chunks.length} (${chunk.length} items)...`);
          
          try {
            const r = await _post({ action: 'batchUpsert', operations: chunk }, BATCH_TIMEOUT);
            allResults = allResults.concat(r.rows || []);
          } catch (err) {
            console.error(`[DB] Chunk ${i + 1} failed:`, err.message);
            
            // FIX: Fallback ke upsert satu per satu untuk chunk yang gagal
            console.log(`[DB] Falling back to individual upsert for chunk ${i + 1}`);
            for (const op of chunk) {
              try {
                const singleResult = await this.upsert(op.sheet, op.data);
                if (singleResult) allResults.push(singleResult);
              } catch (singleErr) {
                console.error(`[DB] Individual upsert failed:`, singleErr.message);
              }
            }
          }
        }
      } else {
        // Batch kecil, kirim langsung dengan timeout lebih panjang
        const r = await _post({ action: 'batchUpsert', operations }, BATCH_TIMEOUT);
        allResults = r.rows || [];
      }
      
      // Invalidate cache
      Object.entries(affected).forEach(([sheet, projectIds]) => {
        if (projectIds.size > 0) {
          projectIds.forEach(pid => {
            AppCache.invalidateRelated(sheet, { projectId: pid });
          });
        } else {
          AppCache.invalidateRelated(sheet);
        }
        if (AppCache.isPrioritySheet(sheet)) {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => AppCache.refreshStale(sheet));
          } else {
            setTimeout(() => AppCache.refreshStale(sheet), 500);
          }
        }
      });
      
      return allResults;
    } finally { _hideLoading(); }
  },

  async batchDelete(operations) {
    const affected = {};
    operations.forEach(op => {
      if (!op.sheet) return;
      if (!affected[op.sheet]) affected[op.sheet] = new Set();
      if (op.field === 'project_id' && op.value) {
        affected[op.sheet].add(op.value);
      }
    });
    
    _showLoading();
    try {
      const r = await _post({ action: 'batchDelete', operations }, BATCH_TIMEOUT);
      
      Object.entries(affected).forEach(([sheet, projectIds]) => {
        if (projectIds.size > 0) {
          projectIds.forEach(pid => {
            AppCache.invalidateRelated(sheet, { projectId: pid });
          });
        } else {
          AppCache.invalidateRelated(sheet);
        }
        if (AppCache.isPrioritySheet(sheet)) {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => AppCache.refreshStale(sheet));
          } else {
            setTimeout(() => AppCache.refreshStale(sheet), 500);
          }
        }
      });
      
      return r.deleted;
    } finally { _hideLoading(); }
  },

  async initSheets() {
    _showLoading();
    try { return await _post({ action: 'initSheets' }); }
    finally { _hideLoading(); }
  },

  async post(body) {
    _showLoading();
    try { return await _post(body); }
    finally { _hideLoading(); }
  }
};

// ... (StorageService dan DataAccess tetap sama seperti sebelumnya)

const StorageService = {
  _dataCache: new Map(),
  
  async getData(sheet) {
    // PERFORMANCE: Cek cache StorageService dulu
    const cacheKey = `storage_${sheet}`;
    const cached = this._dataCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 5000) { // 5 detik TTL
      return cached.data;
    }
    
    try {
      const result = await DB.getAll(sheet);
      const data = result.rows || [];
      this._dataCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (err) {
      console.error('[StorageService] getData error:', sheet, err);
      UIService.showToast('Gagal membaca data: ' + err.message, 'danger');
      return [];
    }
  },

  async saveData(sheet, dataArray) {
    try {
      const operations = dataArray.map(data => ({ sheet, data }));
      await DB.batchUpsert(operations);
      // PERFORMANCE: Invalidate StorageService cache
      this._dataCache.delete(`storage_${sheet}`);
      return true;
    } catch (err) {
      console.error('[StorageService] saveData error:', sheet, err);
      UIService.showToast('Gagal menyimpan data.', 'danger');
      try {
        for (const row of dataArray) await DB.upsert(sheet, row);
        this._dataCache.delete(`storage_${sheet}`);
        return true;
      } catch (err2) {
        console.error('[StorageService] saveData fallback error:', sheet, err2);
        return false;
      }
    }
  },

  addAuditLog(actionType, description) {
    console.info('[Audit]', actionType, description);
  }
};

const DataAccess = {
  getCurrentUser() {
    if (typeof AuthService !== 'undefined' && AuthService.getCurrentUser) {
      const session = AuthService.getCurrentUser();
      if (session && session.name) return session.name;
    }
    return 'Admin KPT';
  },

  async getCompany() {
    const list = await StorageService.getData('company');
    return list.length > 0 ? list[0] : null;
  },

  async isCompanyComplete() {
    const c = await this.getCompany();
    return !!(c && c.name && c.name.trim().length > 0);
  },

  async saveCompany(data) {
    if (!data || !data.name) return null;
    data.updated_at = new Date().toISOString();
    await DB.upsert('company', data);
    StorageService._dataCache.delete('storage_company');
    StorageService.addAuditLog('UPDATE_COMPANY', 'Profil perusahaan diperbarui');
    return data;
  },

  async getAllProjects() { return StorageService.getData('projects'); },

  async hasProjects() {
    const count = await DB.getCount('projects');
    return count > 0;
  },

  async getProjectById(id) {
    if (!id) return null;
    return DB.getById('projects', id);
  },

  async saveProject(data) {
    if (!data || !data.id) return null;
    data.updated_at = new Date().toISOString();
    if (!data.created_at) data.created_at = new Date().toISOString();
    await DB.upsert('projects', data);
    StorageService._dataCache.delete('storage_projects');
    StorageService.addAuditLog('SAVE_PROJECT', `Proyek ${data.name} disimpan`);
    return data;
  },

  async deleteProject(id) {
    if (!id) return false;
    
    const projectId = id;
    
    _showLoading();
    try { 
      await _post({ action: 'deleteProject', projectId: id }); 
    }
    finally { _hideLoading(); }
    
    AppCache.invalidateRelated('projects', { projectId });
    StorageService._dataCache.delete('storage_projects');
    StorageService.addAuditLog('DELETE_PROJECT', `Proyek ${id} beserta data terkait dihapus`);
    return true;
  },

  async getAllJSA() { return StorageService.getData('jsa'); },

  async getJSAById(id) {
    if (!id) return null;
    return DB.getById('jsa', id);
  },

  async getJSAByProject(projectId) {
    if (!projectId) return [];
    const result = await DB.getAll('jsa', { filterField: 'project_id', filterValue: projectId });
    return result.rows || [];
  },

  async saveJSA(data) {
    if (!data || !data.id) return null;
    data.updated_at = new Date().toISOString();
    if (!data.created_at) data.created_at = new Date().toISOString();
    await DB.upsert('jsa', data);
    StorageService._dataCache.delete('storage_jsa');
    StorageService.addAuditLog('SAVE_JSA', `JSA ${data.document_number || data.id} disimpan`);
    return data;
  },

  async deleteJSA(id) {
    if (!id) return false;
    await DB.delete('jsa', id);
    StorageService._dataCache.delete('storage_jsa');
    return true;
  },

  async getAllWorkMethods() { return StorageService.getData('work_methods'); },

  async getWorkMethodById(id) {
    if (!id) return null;
    return DB.getById('work_methods', id);
  },

  async getWorkMethodsByProject(projectId) {
    if (!projectId) return [];
    const result = await DB.getAll('work_methods', { filterField: 'project_id', filterValue: projectId });
    return result.rows || [];
  },

  async saveWorkMethod(data) {
    if (!data || !data.id) return null;
    data.updated_at = new Date().toISOString();
    if (!data.created_at) data.created_at = new Date().toISOString();
    await DB.upsert('work_methods', data);
    StorageService._dataCache.delete('storage_work_methods');
    StorageService.addAuditLog('SAVE_WORK_METHOD', `WM ${data.document_number || data.id} disimpan`);
    return data;
  },

  async deleteWorkMethod(id) {
    if (!id) return false;
    await DB.delete('work_methods', id);
    await DB.deleteWhere('jadwal', 'work_method_id', id);
    AppCache.invalidate('jadwal');
    StorageService._dataCache.delete('storage_work_methods');
    return true;
  },

  async getScheduleByProject(projectId) {
    if (!projectId) return [];
    const result = await DB.getAll('jadwal', { filterField: 'project_id', filterValue: projectId });
    return result.rows || [];
  },

  async saveScheduleRows(rows) {
    if (!rows || rows.length === 0) return [];
    const now = new Date().toISOString();
    
    const affectedProjects = new Set();
    
    const operations = rows.map(row => {
      if (row.project_id) affectedProjects.add(row.project_id);
      return {
        sheet: 'jadwal',
        data: {
          id: row.id,
          project_id: row.project_id,
          work_method_id: row.work_method_id,
          document_number: row.document_number,
          step_number: row.step_number,
          work_stage: row.work_stage || '',
          work_process: row.work_process || '',
          start_date: row.start_date || '',
          end_date: row.end_date || '',
          updated_at: now
        }
      };
    });
    const result = await DB.batchUpsert(operations);
    
    affectedProjects.forEach(pid => {
      AppCache.invalidateRelated('jadwal', { projectId: pid });
    });
    
    return result;
  },

  async deleteScheduleByProject(projectId) {
    if (!projectId) return false;
    await DB.deleteWhere('jadwal', 'project_id', projectId);
    AppCache.invalidateRelated('jadwal', { projectId });
    return true;
  },

  async getAllPersonnel() { return StorageService.getData('personnel'); },

  async savePersonnel(data) {
    if (!data || !data.id) return null;
    data.updated_at = new Date().toISOString();
    await DB.upsert('personnel', data);
    StorageService._dataCache.delete('storage_personnel');
    StorageService.addAuditLog('SAVE_PERSONNEL', `Personel ${data.name} disimpan`);
    return data;
  },

  async deletePersonnel(id) {
    if (!id) return false;
    await DB.batchDelete([{ sheet: 'manpower', field: 'personnel_id', value: id }]);
    AppCache.invalidate('manpower');
    await DB.delete('personnel', id);
    AppCache.invalidate('personnel');
    StorageService._dataCache.delete('storage_personnel');
    StorageService.addAuditLog('DELETE_PERSONNEL', `Personel ${id} dihapus`);
    return true;
  },

  async getAllManpower() { return StorageService.getData('manpower'); },

  async getManpowerByProject(projectId) {
    if (!projectId) return [];
    const result = await DB.getAll('manpower', { filterField: 'project_id', filterValue: projectId });
    return result.rows || [];
  },

  async getPersonnelByProject(projectId) {
    if (!projectId) return [];
    const [assignments, personnel] = await Promise.all([
      this.getManpowerByProject(projectId),
      this.getAllPersonnel()
    ]);
    const assignedIds = new Set(assignments.map(a => a.personnel_id));
    return personnel.filter(p => assignedIds.has(p.id));
  },

  async saveManpower({ project_id, personnel_ids }) {
    if (!project_id) return null;
    await DB.deleteWhere('manpower', 'project_id', project_id);
    
    const operations = (personnel_ids || []).map(pid => ({
      sheet: 'manpower',
      data: {
        id: 'mp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        project_id,
        personnel_id: pid,
        updated_at: new Date().toISOString()
      }
    }));
    if (operations.length > 0) await DB.batchUpsert(operations);
    
    AppCache.invalidateRelated('manpower', { projectId: project_id });
    return personnel_ids;
  },

  async deleteManpowerByProject(projectId) {
    if (!projectId) return false;
    await DB.deleteWhere('manpower', 'project_id', projectId);
    AppCache.invalidateRelated('manpower', { projectId });
    return true;
  },

  async getAllPO() { return StorageService.getData('procurement'); },

  async getPOById(id) {
    if (!id) return null;
    return DB.getById('procurement', id);
  },

  async getPOByProject(projectId) {
    if (!projectId) return [];
    const result = await DB.getAll('procurement', { filterField: 'project_id', filterValue: projectId });
    return result.rows || [];
  },

  async savePO(data) {
    if (!data || !data.id) return null;
    data.updated_at = new Date().toISOString();
    if (!data.created_at) data.created_at = new Date().toISOString();
    await DB.upsert('procurement', data);
    StorageService._dataCache.delete('storage_procurement');
    return data;
  },

  async saveMultiplePO(poArray) {
    if (!poArray || poArray.length === 0) return [];
    
    const affectedProjects = new Set();
    
    const operations = poArray.map(po => {
      if (po.project_id) affectedProjects.add(po.project_id);
      return {
        sheet: 'procurement',
        data: {
          ...po,
          updated_at: new Date().toISOString(),
          created_at: po.created_at || new Date().toISOString()
        }
      };
    });
    const results = await DB.batchUpsert(operations);
    
    affectedProjects.forEach(pid => {
      AppCache.invalidateRelated('procurement', { projectId: pid });
    });
    
    return results;
  },

  async deletePO(id) {
    if (!id) return false;
    await DB.delete('procurement', id);
    StorageService._dataCache.delete('storage_procurement');
    return true;
  },

  async getAccounts() { return StorageService.getData('accounts'); },

  async saveAccount(data) {
    await DB.upsert('accounts', data);
    StorageService._dataCache.delete('storage_accounts');
    return data;
  },

  async deleteAccount(username) {
    await DB.deleteWhere('accounts', 'username', username);
    StorageService._dataCache.delete('storage_accounts');
    return true;
  }
};