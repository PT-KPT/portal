// cache.js — ES6 Module v2.1 with Extended TTL & Memory Management

const _cache            = new Map();
const _cacheTimestamps  = new Map();
const _cacheMeta        = new Map();
const _pending          = new Map();

const MAX_CACHE_SIZE = 500;  // ⬆️ dari 100 → 500
const MAX_CACHE_AGE  = 2 * 60 * 60 * 1000; // ⬆️ dari 30 menit → 2 jam

const PRIORITY_SHEETS = Object.freeze({
  company:      { ttl: 4 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },  // 4 jam
  accounts:     { ttl: 4 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },  // 4 jam
  projects:     { ttl: 2 * 60 * 60 * 1000, preload: true,  staleWhileRevalidate: true },  // 2 jam
  work_methods: { ttl: 30 * 60 * 1000, preload: true,  staleWhileRevalidate: true },      // 30 menit
  jsa:          { ttl: 30 * 60 * 1000, preload: false, staleWhileRevalidate: true },      // 30 menit
  jadwal:       { ttl: 15 * 60 * 1000, preload: false, staleWhileRevalidate: true },      // 15 menit
  manpower:     { ttl: 15 * 60 * 1000, preload: false, staleWhileRevalidate: true },      // 15 menit
  personnel:    { ttl: 30 * 60 * 1000, preload: false, staleWhileRevalidate: true },      // 30 menit
  procurement:  { ttl: 10 * 60 * 1000, preload: false, staleWhileRevalidate: true },      // 10 menit
});

const CACHE_TTL = Object.freeze({
  company:        4 * 60 * 60 * 1000,  // 4 jam (jarang berubah)
  accounts:       4 * 60 * 60 * 1000,  // 4 jam
  projects:       2 * 60 * 60 * 1000,  // 2 jam
  work_methods:   30 * 60 * 1000,      // 30 menit
  jsa:            30 * 60 * 1000,      // 30 menit
  jadwal:         15 * 60 * 1000,      // 15 menit
  manpower:       15 * 60 * 1000,      // 15 menit
  personnel:      30 * 60 * 1000,      // 30 menit
  procurement:    10 * 60 * 1000,      // 10 menit
  dashboard_stats:15 * 60 * 1000,      // 15 menit
  laporan:        10 * 60 * 1000,      // 10 menit
  default:        5 * 60 * 1000,       // 5 menit (dari 2 menit)
});

const STALE_WINDOW = Object.freeze({
  company:       8 * 60 * 60 * 1000,   // 8 jam
  accounts:      8 * 60 * 60 * 1000,   // 8 jam
  projects:      4 * 60 * 60 * 1000,   // 4 jam
  work_methods: 2 * 60 * 60 * 1000,    // 2 jam
  jsa:          2 * 60 * 60 * 1000,    // 2 jam
  jadwal:       1 * 60 * 60 * 1000,    // 1 jam
  manpower:     1 * 60 * 60 * 1000,    // 1 jam
  personnel:    2 * 60 * 60 * 1000,    // 2 jam
  procurement:  30 * 60 * 1000,        // 30 menit
  laporan:      1 * 60 * 60 * 1000,    // 1 jam
});

const BG_REFRESH_THRESHOLD = Object.freeze({
  procurement:  0.60,
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
  projects:     ['jsa', 'work_methods', 'manpower', 'procurement', 'jadwal'],
  work_methods: ['jsa', 'jadwal'],
  personnel:    ['manpower'],
  company:      ['laporan'],
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

export const AppCache = {
  _startPeriodicCleanup() {
    if (_cleanupTimer) return;
    _cleanupTimer = setInterval(() => this._evictExpiredEntries(), 10 * 60 * 1000); // 10 menit
    window.addEventListener('beforeunload', () => {
      if (_cleanupTimer) { clearInterval(_cleanupTimer); _cleanupTimer = null; }
      if (_memoryPressureTimer) { clearInterval(_memoryPressureTimer); _memoryPressureTimer = null; }
    });
    
    // 🆕 Memory pressure handler
    this._startMemoryPressureHandler();
  },

  // 🆕 Memory Pressure Handler
  _startMemoryPressureHandler() {
    if (_memoryPressureTimer) return;
    _memoryPressureTimer = setInterval(() => {
      if ('memory' in performance && performance.memory) {
        const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
        if (usedJSHeapSize > jsHeapSizeLimit * 0.75) {
          console.warn('[AppCache] Memory pressure detected, clearing 30% oldest entries');
          const entries = [..._cacheTimestamps.entries()]
            .sort((a, b) => a[1] - b[1])
            .slice(0, Math.floor(_cache.size * 0.3));
          entries.forEach(([key]) => {
            _cache.delete(key);
            _cacheTimestamps.delete(key);
            _cacheMeta.delete(key);
            _pending.delete(key);
          });
        }
      }
    }, 30000); // Check setiap 30 detik
  },

  _evictExpiredEntries() {
    const now = Date.now();
    const toDelete = [];
    _cacheTimestamps.forEach((ts, key) => {
      if (now - ts > MAX_CACHE_AGE) toDelete.push(key);
    });
    toDelete.forEach(key => {
      _cache.delete(key); _cacheTimestamps.delete(key);
      _cacheMeta.delete(key); _pending.delete(key);
    });
    if (toDelete.length > 0) console.debug(`[AppCache] Evicted ${toDelete.length} expired entries`);
  },

  _enforceMaxSize() {
    if (_cache.size <= MAX_CACHE_SIZE) return;
    const entries = [..._cacheTimestamps.entries()].sort((a, b) => a[1] - b[1]);
    const evictCount = _cache.size - MAX_CACHE_SIZE;
    entries.slice(0, evictCount).forEach(([key]) => {
      _cache.delete(key); _cacheTimestamps.delete(key); _cacheMeta.delete(key);
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
    let count = 0;
    const toDelete = [];
    _cacheMeta.forEach((meta, key) => {
      if (meta?.dependsOn?.includes(dependency)) toDelete.push(key);
    });
    toDelete.forEach(key => {
      _cache.delete(key); _cacheTimestamps.delete(key); _cacheMeta.delete(key); count++;
    });
    if (!dependency.includes(':')) {
      (DEPENDENCY_MAP[dependency] || []).forEach(dep => {
        _cacheMeta.forEach((meta, key) => {
          if (meta?.dependsOn?.includes(dep) && !toDelete.includes(key)) {
            _cache.delete(key); _cacheTimestamps.delete(key); _cacheMeta.delete(key); count++;
          }
        });
      });
    }
    return count;
  },

  invalidate(sheet, options = {}) {
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
    this.invalidate(sheet, options);
    const statsSheets = ['jsa','work_methods','manpower','procurement','jadwal','projects','company'];
    if (statsSheets.includes(sheet)) {
      this.invalidateByDependency('dashboard_stats');
      this.invalidateByDependency('laporan');
    }
    (DEPENDENCY_MAP[sheet] || []).forEach(dep => {
      if (options.projectId) this.invalidateByDependency(`projects:${options.projectId}`);
      else this.invalidate(dep);
    });
  },

  // 🆕 Invalidate hanya sheet spesifik (tanpa related)
  invalidateSheetOnly(sheet) {
    let count = 0;
    const toDelete = [];
    _cache.forEach((_, key) => { if (key === sheet || key.startsWith(sheet + '::')) toDelete.push(key); });
    toDelete.forEach(key => { _cache.delete(key); _cacheTimestamps.delete(key); _cacheMeta.delete(key); count++; });
    return count;
  },

  // 🆕 Invalidate hanya untuk project spesifik
  invalidateByProject(sheet, projectId) {
    if (!projectId) return this.invalidateSheetOnly(sheet);
    return this.invalidateByDependency(`projects:${projectId}`);
  },

  clear() {
    _cache.clear(); _cacheTimestamps.clear(); _cacheMeta.clear(); _pending.clear();
  },

  getPending(key)           { return _pending.get(key) || null; },
  setPending(key, promise)  { _pending.set(key, promise); },
  deletePending(key)        { _pending.delete(key); },

  getStats() {
    const bySheet = {};
    _cacheMeta.forEach((meta) => {
      const sheet = meta.sheet || 'unknown';
      if (!bySheet[sheet]) bySheet[sheet] = { count: 0, dependencies: new Set() };
      bySheet[sheet].count++;
      (meta.dependsOn || []).forEach(dep => bySheet[sheet].dependencies.add(dep));
    });
    return {
      totalKeys: _cache.size, cacheSize: _cache.size, pendingSize: _pending.size,
      bySheet: Object.fromEntries(Object.entries(bySheet).map(([s, d]) => [s, { count: d.count, dependencies: [...d.dependencies] }]))
    };
  },

  async warmup(sheets = null) {
    const sheetsToWarm = sheets || this.getPrioritySheets();
    console.log(`[AppCache] Warming up ${sheetsToWarm.length} sheets:`, sheetsToWarm);
    await Promise.allSettled(sheetsToWarm.map(async (sheet) => {
      try {
        if (!this.isValid(sheet, sheet, true)) {
          // Gunakan DB.getAll untuk memastikan data masuk ke cache
          const { DB } = await import('./db.js');
          await DB.getAll(sheet);
        }
      } catch (err) { 
        console.warn(`[AppCache] Warmup failed for ${sheet}:`, err.message); 
      }
    }));
    console.log('[AppCache] Warmup complete. Cache stats:', this.getStats());
  },

  // 🆕 Bulk warmup dengan single request
  async warmupBulk(sheets) {
    if (!sheets || sheets.length === 0) return;
    console.log(`[AppCache] Bulk warming up ${sheets.length} sheets:`, sheets);
    try {
      const { DB } = await import('./db.js');
      await DB.getAllBulk(sheets);
    } catch (err) {
      console.warn('[AppCache] Bulk warmup failed, falling back to individual:', err.message);
      await this.warmup(sheets);
    }
  },

  async refreshStale(sheet) {
    if (!this.hasStaleSupport(sheet)) return;
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
};

AppCache._startPeriodicCleanup();