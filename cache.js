// cache.js — ES6 Module v4.0 - FIXED: Deadlock prevention, memory leak fix, request timeout
// Perbaikan prioritas tertinggi: deadlock, memory leak, pending promise stuck

const _cache            = new Map();
const _cacheTimestamps  = new Map();
const _cacheMeta        = new Map();
const _pending          = new Map();
const _requestQueue     = [];
let   _processingQueue  = false;

const MAX_CACHE_SIZE = 800;
const MAX_CACHE_AGE  = 4 * 60 * 60 * 1000; // 4 jam
const PENDING_TIMEOUT_MS = 30 * 1000; // 30 detik timeout untuk pending promise

// Priority sheets with optimized TTL and preload settings
const PRIORITY_SHEETS = Object.freeze({
  company:      { ttl: 8 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },
  accounts:     { ttl: 8 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },
  personnel:    { ttl: 4 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },
  projects:     { ttl: 4 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },
  work_methods: { ttl: 2 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },
  jsa:          { ttl: 2 * 60 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  jadwal:       { ttl: 1 * 60 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  manpower:     { ttl: 1 * 60 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  procurement:  { ttl: 15 * 60 * 1000,     preload: false, staleWhileRevalidate: true },
  operational:  { ttl: 15 * 60 * 1000,     preload: false, staleWhileRevalidate: true },
});

const CACHE_TTL = Object.freeze({
  company:        8 * 60 * 60 * 1000,
  accounts:       8 * 60 * 60 * 1000,
  personnel:      4 * 60 * 60 * 1000,
  projects:       4 * 60 * 60 * 1000,
  work_methods:   2 * 60 * 60 * 1000,
  jsa:            2 * 60 * 60 * 1000,
  manpower:       1 * 60 * 60 * 1000,
  procurement:    15 * 60 * 1000,
  operational:    15 * 60 * 1000,
  jadwal:         15 * 60 * 1000,
  dashboard_stats: 5 * 60 * 1000,
  project_summary: 2 * 60 * 1000,
  laporan:        5 * 60 * 1000,
  default:        10 * 60 * 1000,
});

const STALE_WINDOW = Object.freeze({
  company:       12 * 60 * 60 * 1000,
  accounts:      12 * 60 * 60 * 1000,
  personnel:      6 * 60 * 60 * 1000,
  projects:       6 * 60 * 60 * 1000,
  work_methods:   4 * 60 * 60 * 1000,
  jsa:            4 * 60 * 60 * 1000,
  manpower:       2 * 60 * 60 * 1000,
  procurement:    1 * 60 * 60 * 1000,
  operational:    1 * 60 * 60 * 1000,
  jadwal:         1 * 60 * 60 * 1000,
  laporan:        1 * 60 * 60 * 1000,
});

const BG_REFRESH_THRESHOLD = Object.freeze({
  procurement:  0.60,
  operational:  0.60,
  jsa:          0.70,
  work_methods: 0.70,
  jadwal:       0.70,
  manpower:     0.70,
  personnel:    0.70,
  projects:     0.75,
  company:      0.80,
  accounts:     0.80,
  default:      0.70,
});

const DEPENDENCY_MAP = Object.freeze({
  projects:     ['jsa', 'work_methods', 'manpower', 'procurement', 'operational', 'jadwal', 'project_summary', 'dashboard_stats'],
  work_methods: ['jsa', 'jadwal', 'project_summary'],
  personnel:    ['manpower', 'project_summary', 'dashboard_stats'],
  procurement:  ['project_summary', 'dashboard_stats', 'laporan'],
  operational:  ['project_summary', 'dashboard_stats', 'laporan'],
  jsa:          ['project_summary', 'dashboard_stats', 'laporan'],
  manpower:     ['project_summary', 'dashboard_stats', 'laporan'],
  jadwal:       ['project_summary', 'dashboard_stats', 'laporan'],
  company:      ['laporan', 'dashboard_stats'],
  accounts:     [],
});

const REVERSE_DEPENDENCY_MAP = (() => {
  const reverse = {};
  Object.entries(DEPENDENCY_MAP).forEach(([source, targets]) => {
    targets.forEach(target => {
      if (!reverse[target]) reverse[target] = [];
      reverse[target].push(source);
    });
  });
  return Object.freeze(reverse);
})();

let _cleanupTimer = null;
let _memoryPressureTimer = null;
let _isDestroyed = false;

export const AppCache = {
  // ========== DESTROY METHOD UNTUK CLEANUP ==========
  destroy() {
    _isDestroyed = true;
    if (_cleanupTimer) {
      clearInterval(_cleanupTimer);
      _cleanupTimer = null;
    }
    if (_memoryPressureTimer) {
      clearInterval(_memoryPressureTimer);
      _memoryPressureTimer = null;
    }
    this.clear();
    console.log('[AppCache] Destroyed and cleaned up');
  },

  _startPeriodicCleanup() {
    if (_cleanupTimer || _isDestroyed) return;
    _cleanupTimer = setInterval(() => {
      if (_isDestroyed) return;
      this._evictExpiredEntries();
      this._refreshStalePrioritySheets();
    }, 15 * 60 * 1000);
    
    window.addEventListener('beforeunload', () => {
      this.destroy();
    });
    
    this._startMemoryPressureHandler();
  },

  async _refreshStalePrioritySheets() {
    if (_isDestroyed) return;
    const prioritySheets = this.getPrioritySheets();
    for (const sheet of prioritySheets) {
      if (this.isStale(sheet, sheet) && this.isStaleWindowValid(sheet, sheet)) {
        try {
          const { DB } = await import('./db.js');
          await DB.getAll(sheet);
          console.debug(`[AppCache] Background refreshed: ${sheet}`);
        } catch (err) {
          console.warn(`[AppCache] Background refresh failed for ${sheet}:`, err.message);
        }
      }
    }
  },

  _startMemoryPressureHandler() {
    if (_memoryPressureTimer || _isDestroyed) return;
    _memoryPressureTimer = setInterval(() => {
      if (_isDestroyed) return;
      if ('memory' in performance && performance.memory) {
        const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
        const usagePercent = usedJSHeapSize / jsHeapSizeLimit;
        
        if (usagePercent > 0.85) {
          console.warn('[AppCache] High memory pressure! Clearing 50% oldest entries');
          this._evictOldestEntries(0.5);
        } else if (usagePercent > 0.75) {
          console.warn('[AppCache] Medium memory pressure, clearing 30% oldest entries');
          this._evictOldestEntries(0.3);
        } else if (usagePercent > 0.65 && _cache.size > MAX_CACHE_SIZE * 0.8) {
          this._evictOldestEntries(0.15);
        }
      } else if (_cache.size > MAX_CACHE_SIZE * 1.2) {
        this._evictOldestEntries(0.3);
      }
    }, 60000);
  },

  _evictOldestEntries(percent) {
    if (_isDestroyed) return;
    const entries = [..._cacheTimestamps.entries()]
      .sort((a, b) => a[1] - b[1]);
    const evictCount = Math.floor(entries.length * percent);
    
    entries.slice(0, evictCount).forEach(([key]) => {
      const meta = _cacheMeta.get(key);
      if (meta?.isPriority) {
        const age = Date.now() - _cacheTimestamps.get(key);
        if (age < this.getTTL(meta.sheet) / 2) return;
      }
      _cache.delete(key);
      _cacheTimestamps.delete(key);
      _cacheMeta.delete(key);
      _pending.delete(key);
    });
    console.debug(`[AppCache] Evicted ${evictCount} entries due to memory pressure`);
  },

  _evictExpiredEntries() {
    if (_isDestroyed) return;
    const now = Date.now();
    const toDelete = [];
    _cacheTimestamps.forEach((ts, key) => {
      if (now - ts > MAX_CACHE_AGE) toDelete.push(key);
    });
    toDelete.forEach(key => {
      _cache.delete(key);
      _cacheTimestamps.delete(key);
      _cacheMeta.delete(key);
      _pending.delete(key);
    });
    if (toDelete.length > 0) console.debug(`[AppCache] Evicted ${toDelete.length} expired entries`);
  },

  _enforceMaxSize() {
    if (_isDestroyed) return;
    if (_cache.size <= MAX_CACHE_SIZE) return;
    const entries = [..._cacheTimestamps.entries()].sort((a, b) => a[1] - b[1]);
    const evictCount = _cache.size - MAX_CACHE_SIZE;
    entries.slice(0, evictCount).forEach(([key]) => {
      const meta = _cacheMeta.get(key);
      if (meta?.isPriority) {
        const age = Date.now() - _cacheTimestamps.get(key);
        if (age < this.getTTL(meta.sheet) / 2) return;
      }
      _cache.delete(key);
      _cacheTimestamps.delete(key);
      _cacheMeta.delete(key);
      _pending.delete(key);
    });
    console.debug(`[AppCache] Evicted ${evictCount} LRU entries (size limit)`);
  },

  getPrioritySheets()    { return Object.keys(PRIORITY_SHEETS).filter(s => PRIORITY_SHEETS[s].preload); },
  getAllPrioritySheets()  { return Object.keys(PRIORITY_SHEETS); },
  isPrioritySheet(sheet) { return !!PRIORITY_SHEETS[sheet]; },
  hasStaleSupport(sheet) { return !!(PRIORITY_SHEETS[sheet]?.staleWhileRevalidate); },

  buildKey(sheet, params) {
    if (params && Object.keys(params).length > 0) {
      const sorted = {};
      Object.keys(params).sort().forEach(k => { sorted[k] = params[k]; });
      return sheet + '::' + JSON.stringify(sorted);
    }
    return sheet;
  },

  extractDependencies(sheet, params = {}) {
    const deps = [sheet];
    if (params.filterField === 'project_id' && params.filterValue)     deps.push(`projects:${params.filterValue}`);
    if (params.filterField === 'work_method_id' && params.filterValue) deps.push(`work_methods:${params.filterValue}`);
    if (params.filterField === 'personnel_id' && params.filterValue)   deps.push(`personnel:${params.filterValue}`);
    (REVERSE_DEPENDENCY_MAP[sheet] || []).forEach(r => deps.push(r));
    return [...new Set(deps)];
  },

  getTTL(sheet)              { return CACHE_TTL[sheet] || CACHE_TTL.default; },
  getStaleWindow(sheet)      { return STALE_WINDOW[sheet] || 0; },
  getBgRefreshThreshold(sh)  { return BG_REFRESH_THRESHOLD[sh] || BG_REFRESH_THRESHOLD.default; },

  isStale(key, sheet) {
    if (!_cache.has(key)) return false;
    const ts = _cacheTimestamps.get(key);
    return ts ? (Date.now() - ts) >= this.getTTL(sheet || 'default') : false;
  },

  isStaleWindowValid(key, sheet) {
    const sw = this.getStaleWindow(sheet);
    if (!sw || !_cache.has(key)) return false;
    const ts = _cacheTimestamps.get(key);
    return ts ? (Date.now() - ts) < (this.getTTL(sheet) + sw) : false;
  },

  isValid(key, sheet, allowStale = false) {
    if (!_cache.has(key)) return false;
    const ts = _cacheTimestamps.get(key);
    if (!ts) return false;
    const age = Date.now() - ts;
    if (age < this.getTTL(sheet || 'default')) return true;
    if (allowStale && this.hasStaleSupport(sheet)) return this.isStaleWindowValid(key, sheet);
    return false;
  },

  get(key) { return _cache.get(key); },

  set(key, value, sheet, meta = {}) {
    const now = Date.now();
    let dependsOn = meta.dependsOn || [];
    if (key.includes('::')) {
      try {
        const params = JSON.parse(key.split('::')[1]);
        dependsOn = [...dependsOn, ...this.extractDependencies(sheet, params)];
      } catch { dependsOn = [sheet]; }
    } else {
      dependsOn = [sheet];
    }
    dependsOn = [...new Set([...dependsOn, ...(REVERSE_DEPENDENCY_MAP[sheet] || [])])];
    _cache.set(key, value);
    _cacheTimestamps.set(key, now);
    _cacheMeta.set(key, { ..._cacheMeta.get(key), ...meta, sheet, dependsOn,
      isPriority: this.isPrioritySheet(sheet), hasStale: this.hasStaleSupport(sheet), lastUpdated: now });
    this._enforceMaxSize();
  },

  invalidateByDependency(dependency) {
    if (_isDestroyed) return 0;
    let count = 0;
    const toDelete = [];
    _cacheMeta.forEach((meta, key) => {
      if (meta?.dependsOn?.includes(dependency)) toDelete.push(key);
    });
    toDelete.forEach(key => {
      _cache.delete(key);
      _cacheTimestamps.delete(key);
      _cacheMeta.delete(key);
      count++;
    });
    if (!dependency.includes(':')) {
      (DEPENDENCY_MAP[dependency] || []).forEach(dep => {
        _cacheMeta.forEach((meta, key) => {
          if (meta?.dependsOn?.includes(dep) && !toDelete.includes(key)) {
            _cache.delete(key);
            _cacheTimestamps.delete(key);
            _cacheMeta.delete(key);
            count++;
          }
        });
      });
    }
    return count;
  },

  invalidate(sheet, options = {}) {
    if (_isDestroyed) return 0;
    let count = 0;
    if (options.projectId)  count += this.invalidateByDependency(`projects:${options.projectId}`);
    else if (options.entityId) count += this.invalidateByDependency(`${sheet}:${options.entityId}`);
    else {
      count += this.invalidateByDependency(sheet);
      const toDelete = [];
      _cache.forEach((_, key) => { if (key === sheet || key.startsWith(sheet + '::')) toDelete.push(key); });
      toDelete.forEach(key => { _cache.delete(key); _cacheTimestamps.delete(key); _cacheMeta.delete(key); });
      count += toDelete.length;
    }
    return count;
  },

  invalidateRelated(sheet, options = {}) {
    if (_isDestroyed) return 0;
    this.invalidate(sheet, options);
    const statsSheets = ['jsa', 'work_methods', 'manpower', 'procurement', 'operational', 'jadwal', 'projects', 'company'];
    if (statsSheets.includes(sheet)) {
      this.invalidateByDependency('dashboard_stats');
      this.invalidateByDependency('laporan');
      this.invalidateByDependency('project_summary');
    }
    (DEPENDENCY_MAP[sheet] || []).forEach(dep => {
      if (options.projectId) this.invalidateByDependency(`projects:${options.projectId}`);
      else this.invalidate(dep);
    });
  },

  invalidateSheetOnly(sheet) {
    if (_isDestroyed) return 0;
    let count = 0;
    const toDelete = [];
    _cache.forEach((_, key) => { if (key === sheet || key.startsWith(sheet + '::')) toDelete.push(key); });
    toDelete.forEach(key => { _cache.delete(key); _cacheTimestamps.delete(key); _cacheMeta.delete(key); count++; });
    return count;
  },

  invalidateByProject(sheet, projectId) {
    if (!projectId) return this.invalidateSheetOnly(sheet);
    return this.invalidateByDependency(`projects:${projectId}`);
  },

  invalidateWithLimit(sheet, options = {}, maxKeys = 20) {
    if (_isDestroyed) return 0;
    let count = 0;
    const toDelete = [];
    _cacheMeta.forEach((meta, key) => {
      if (count >= maxKeys) return;
      if (meta?.dependsOn?.includes(sheet) || key === sheet || key.startsWith(sheet + '::')) {
        toDelete.push(key);
        count++;
      }
    });
    toDelete.forEach(key => {
      _cache.delete(key);
      _cacheTimestamps.delete(key);
      _cacheMeta.delete(key);
      _pending.delete(key);
    });
    return count;
  },

  clear() {
    _cache.clear();
    _cacheTimestamps.clear();
    _cacheMeta.clear();
    // JANGAN clear _pending di sini — biar pending promise tetap bisa resolve
  },

  // ========== FIX: PENDING PROMISE DENGAN TIMEOUT ==========
  getPending(key) { 
    const pending = _pending.get(key);
    if (pending && pending._timeoutId) {
      // Cek apakah promise sudah timeout
      if (pending._timedOut) {
        _pending.delete(key);
        return null;
      }
    }
    return pending ? pending.promise : null; 
  },
  
  setPending(key, promise) {
    // Hapus pending lama jika ada
    const existing = _pending.get(key);
    if (existing && existing._timeoutId) {
      clearTimeout(existing._timeoutId);
    }
    
    const timeoutId = setTimeout(() => {
      const p = _pending.get(key);
      if (p && p.promise === promise) {
        console.warn(`[AppCache] Pending promise timeout for key: ${key}`);
        p._timedOut = true;
        _pending.delete(key);
      }
    }, PENDING_TIMEOUT_MS);
    
    _pending.set(key, { promise, _timeoutId: timeoutId, _timedOut: false });
  },
  
  deletePending(key) {
    const existing = _pending.get(key);
    if (existing && existing._timeoutId) {
      clearTimeout(existing._timeoutId);
    }
    _pending.delete(key);
  },

  getStats() {
    const bySheet = {};
    _cacheMeta.forEach((meta) => {
      const sheet = meta.sheet || 'unknown';
      if (!bySheet[sheet]) bySheet[sheet] = { count: 0, dependencies: new Set() };
      bySheet[sheet].count++;
      (meta.dependsOn || []).forEach(dep => bySheet[sheet].dependencies.add(dep));
    });
    return {
      totalKeys: _cache.size,
      cacheSize: _cache.size,
      pendingSize: _pending.size,
      bySheet: Object.fromEntries(Object.entries(bySheet).map(([s, d]) => [s, { count: d.count, dependencies: [...d.dependencies] }]))
    };
  },

  getDetailedStats() {
    const now = Date.now();
    const stats = {
      totalKeys: _cache.size,
      totalSize: 0,
      avgAge: 0,
      bySheet: {},
      oldestKey: null,
      oldestAge: 0,
      newestKey: null,
      newestAge: Infinity
    };
    
    let totalAge = 0;
    _cacheTimestamps.forEach((ts, key) => {
      const age = now - ts;
      totalAge += age;
      
      if (age > stats.oldestAge) {
        stats.oldestAge = age;
        stats.oldestKey = key;
      }
      if (age < stats.newestAge) {
        stats.newestAge = age;
        stats.newestKey = key;
      }
      
      const meta = _cacheMeta.get(key);
      const sheet = meta?.sheet || 'unknown';
      if (!stats.bySheet[sheet]) {
        stats.bySheet[sheet] = { count: 0, totalAge: 0 };
      }
      stats.bySheet[sheet].count++;
      stats.bySheet[sheet].totalAge += age;
    });
    
    stats.avgAge = stats.totalKeys > 0 ? Math.round(totalAge / stats.totalKeys / 1000) : 0;
    stats.oldestAgeSec = Math.round(stats.oldestAge / 1000);
    stats.newestAgeSec = Math.round(stats.newestAge / 1000);
    
    _cache.forEach((value) => {
      try {
        stats.totalSize += JSON.stringify(value).length;
      } catch(e) {}
    });
    
    return stats;
  },

  async warmup(sheets = null) {
    if (_isDestroyed) return;
    const sheetsToWarm = sheets || this.getPrioritySheets();
    console.log(`[AppCache] Warming up ${sheetsToWarm.length} sheets:`, sheetsToWarm);
    await Promise.allSettled(sheetsToWarm.map(async (sheet) => {
      try {
        if (!this.isValid(sheet, sheet, true)) {
          const { DB } = await import('./db.js');
          await DB.getAll(sheet);
        }
      } catch (err) { 
        console.warn(`[AppCache] Warmup failed for ${sheet}:`, err.message); 
      }
    }));
    console.log('[AppCache] Warmup complete. Cache stats:', this.getStats());
  },

  async warmupBulk(sheets) {
    if (_isDestroyed || !sheets || sheets.length === 0) return;
    console.log(`[AppCache] Bulk warming up ${sheets.length} sheets:`, sheets);
    try {
      const { DB } = await import('./db.js');
      await DB.getAllBulk(sheets);
    } catch (err) {
      console.warn('[AppCache] Bulk warmup failed, falling back to individual:', err.message);
      await this.warmup(sheets);
    }
  },

  async warmupCritical() {
    if (_isDestroyed) return;
    const criticalSheets = ['company', 'projects', 'accounts'];
    console.log('[AppCache] Warming up critical sheets:', criticalSheets);
    const startTime = performance.now();
    try {
      const { DB } = await import('./db.js');
      await DB.getAllBulk(criticalSheets);
      console.log(`[AppCache] Critical warmup completed in ${Math.round(performance.now() - startTime)}ms`);
    } catch (err) {
      console.warn('[AppCache] Critical warmup failed:', err.message);
      await this.warmup(criticalSheets);
    }
  },

  async refreshStale(sheet) {
    if (_isDestroyed || !this.hasStaleSupport(sheet)) return;
    if (this.isStale(sheet, sheet) && this.isStaleWindowValid(sheet, sheet)) {
      try {
        const { DB } = await import('./db.js');
        const result = await DB.getAll(sheet);
        this.set(sheet, result, sheet);
      } catch (err) { console.warn(`[AppCache] BG refresh failed for ${sheet}:`, err.message); }
    }
  },

  shouldBackgroundRefresh(key, sheet) {
    if (!this.hasStaleSupport(sheet)) return false;
    const age = this.getCacheAge(key);
    if (age === null) return false;
    return age > (this.getTTL(sheet) / 1000) * this.getBgRefreshThreshold(sheet);
  },

  getCacheAge(key) {
    const ts = _cacheTimestamps.get(key);
    return ts ? Math.round((Date.now() - ts) / 1000) : null;
  },

  // ========== FIX: QUEUE DENGAN TIMEOUT DAN MAX CONCURRENT ==========
  enqueueRequest(fn) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = _requestQueue.findIndex(item => item.timeoutId === timeoutId);
        if (index !== -1) {
          _requestQueue.splice(index, 1);
          reject(new Error('Request queue timeout after 60 seconds'));
        }
      }, 60000);
      
      _requestQueue.push({ resolve, reject, fn, timeoutId });
      this._processQueue();
    });
  },

  async _processQueue() {
    if (_processingQueue || _isDestroyed) return;
    _processingQueue = true;
    
    const maxConcurrent = 3; // Turunkan dari 4 ke 3 untuk safety
    let activeCount = 0;
    
    const processNext = async () => {
      while (_requestQueue.length > 0 && activeCount < maxConcurrent && !_isDestroyed) {
        const item = _requestQueue.shift();
        if (!item) continue;
        
        // Clear timeout jika masih ada
        if (item.timeoutId) clearTimeout(item.timeoutId);
        
        activeCount++;
        try {
          const result = await item.fn();
          item.resolve(result);
        } catch (err) {
          item.reject(err);
        } finally {
          activeCount--;
          // Lanjutkan proses setelah delay kecil untuk memberi waktu event loop
          setTimeout(() => processNext(), 10);
        }
      }
    };
    
    await processNext();
    _processingQueue = false;
  }
};

// Initialize periodic cleanup
AppCache._startPeriodicCleanup();

// Expose to window for debugging (development only)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.__cacheStats = () => AppCache.getDetailedStats();
  window.__clearCache = () => AppCache.clear();
}