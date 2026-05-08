// cache.js — v2.0 with Memory Management & Performance Optimization

const _cache = new Map(); // Gunakan Map untuk performa lebih baik
const _cacheTimestamps = new Map();
const _cacheMeta = new Map();
const _pending = new Map();

// Maximum cache size untuk mencegah memory leak
const MAX_CACHE_SIZE = 100;
const MAX_CACHE_AGE = 30 * 60 * 1000; // 30 menit

const PRIORITY_SHEETS = Object.freeze({
  company: { ttl: 60 * 60 * 1000, preload: true, staleWhileRevalidate: true },
  accounts: { ttl: 60 * 60 * 1000, preload: true, staleWhileRevalidate: true },
  projects: { ttl: 30 * 60 * 1000, preload: true, staleWhileRevalidate: true },
  work_methods: { ttl: 10 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  jsa: { ttl: 10 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  jadwal: { ttl: 10 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  manpower: { ttl: 5 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  personnel: { ttl: 5 * 60 * 1000, preload: false, staleWhileRevalidate: true },
  procurement: { ttl: 2 * 60 * 1000, preload: false, staleWhileRevalidate: true },
});

const CACHE_TTL = Object.freeze({
  company: 60 * 60 * 1000,
  accounts: 60 * 60 * 1000,
  projects: 30 * 60 * 1000,
  work_methods: 10 * 60 * 1000,
  jsa: 10 * 60 * 1000,
  jadwal: 10 * 60 * 1000,
  manpower: 5 * 60 * 1000,
  personnel: 5 * 60 * 1000,
  procurement: 2 * 60 * 1000,
  dashboard_stats: 10 * 60 * 1000,
  laporan: 5 * 60 * 1000,
  default: 2 * 60 * 1000,
});

const STALE_WINDOW = Object.freeze({
  company: 4 * 60 * 60 * 1000,
  accounts: 4 * 60 * 60 * 1000,
  projects: 2 * 60 * 60 * 1000,
  work_methods: 45 * 60 * 1000,
  jsa: 45 * 60 * 1000,
  jadwal: 45 * 60 * 1000,
  manpower: 20 * 60 * 1000,
  personnel: 20 * 60 * 1000,
  procurement: 10 * 60 * 1000,
  laporan: 20 * 60 * 1000,
});

const BG_REFRESH_THRESHOLD = Object.freeze({
  procurement: 0.60,
  jsa: 0.70,
  work_methods: 0.70,
  jadwal: 0.70,
  manpower: 0.70,
  personnel: 0.70,
  projects: 0.75,
  company: 0.80,
  accounts: 0.80,
  default: 0.70,
});

const DEPENDENCY_MAP = Object.freeze({
  'projects': ['jsa', 'work_methods', 'manpower', 'procurement', 'jadwal'],
  'work_methods': ['jsa', 'jadwal'],
  'personnel': ['manpower'],
  'company': ['laporan'],
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

// MEMORY LEAK FIX: Periodic cleanup timer
let _cleanupTimer = null;

const AppCache = {
  // MEMORY MANAGEMENT: Periodic cleanup untuk mencegah memory leak
  _startPeriodicCleanup() {
    if (_cleanupTimer) return;
    _cleanupTimer = setInterval(() => {
      this._evictExpiredEntries();
    }, 5 * 60 * 1000); // Setiap 5 menit
    
    // Cleanup timer saat page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (_cleanupTimer) {
          clearInterval(_cleanupTimer);
          _cleanupTimer = null;
        }
      });
    }
  },

  // MEMORY MANAGEMENT: Hapus cache yang expired
  _evictExpiredEntries() {
    const now = Date.now();
    const keysToDelete = [];
    
    _cacheTimestamps.forEach((timestamp, key) => {
      if (now - timestamp > MAX_CACHE_AGE) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      _cache.delete(key);
      _cacheTimestamps.delete(key);
      _cacheMeta.delete(key);
      _pending.delete(key);
    });
    
    if (keysToDelete.length > 0) {
      console.debug(`[AppCache] Evicted ${keysToDelete.length} expired entries`);
    }
  },

  // MEMORY MANAGEMENT: Enforce max cache size (LRU-like)
  _enforceMaxSize() {
    if (_cache.size > MAX_CACHE_SIZE) {
      // Hapus entry tertua
      const entries = [..._cacheTimestamps.entries()]
        .sort((a, b) => a[1] - b[1]);
      
      const toDelete = entries.slice(0, _cache.size - MAX_CACHE_SIZE);
      toDelete.forEach(([key]) => {
        _cache.delete(key);
        _cacheTimestamps.delete(key);
        _cacheMeta.delete(key);
      });
    }
  },

  getPrioritySheets() {
    return Object.keys(PRIORITY_SHEETS).filter(s => PRIORITY_SHEETS[s].preload);
  },

  getAllPrioritySheets() {
    return Object.keys(PRIORITY_SHEETS);
  },

  isPrioritySheet(sheet) {
    return !!PRIORITY_SHEETS[sheet];
  },

  hasStaleSupport(sheet) {
    return !!(PRIORITY_SHEETS[sheet]?.staleWhileRevalidate);
  },

  buildKey(sheet, params) {
    if (params && Object.keys(params).length > 0) {
      const sorted = {};
      Object.keys(params).sort().forEach(k => {
        sorted[k] = params[k];
      });
      return sheet + '::' + JSON.stringify(sorted);
    }
    return sheet;
  },

  extractDependencies(sheet, params = {}) {
    const deps = [sheet];
    
    if (params.filterField === 'project_id' && params.filterValue) {
      deps.push(`projects:${params.filterValue}`);
    }
    
    if (params.filterField === 'work_method_id' && params.filterValue) {
      deps.push(`work_methods:${params.filterValue}`);
    }
    
    if (params.filterField === 'personnel_id' && params.filterValue) {
      deps.push(`personnel:${params.filterValue}`);
    }
    
    const reverseDeps = REVERSE_DEPENDENCY_MAP[sheet] || [];
    reverseDeps.forEach(revDep => deps.push(revDep));
    
    return [...new Set(deps)];
  },

  getTTL(sheet) {
    return CACHE_TTL[sheet] || CACHE_TTL.default;
  },

  getStaleWindow(sheet) {
    return STALE_WINDOW[sheet] || 0;
  },

  getBgRefreshThreshold(sheet) {
    return BG_REFRESH_THRESHOLD[sheet] || BG_REFRESH_THRESHOLD.default;
  },

  isStale(key, sheet) {
    if (!_cache.has(key)) return false;
    const ts = _cacheTimestamps.get(key);
    if (!ts) return false;
    return (Date.now() - ts) >= this.getTTL(sheet || 'default');
  },

  isStaleWindowValid(key, sheet) {
    const sw = this.getStaleWindow(sheet);
    if (!sw) return false;
    if (!_cache.has(key)) return false;
    const ts = _cacheTimestamps.get(key);
    if (!ts) return false;
    return (Date.now() - ts) < (this.getTTL(sheet) + sw);
  },

  isValid(key, sheet, allowStale = false) {
    if (!_cache.has(key)) return false;
    const ts = _cacheTimestamps.get(key);
    if (!ts) return false;
    const age = Date.now() - ts;
    const ttl = this.getTTL(sheet || 'default');
    if (age < ttl) return true;
    if (allowStale && this.hasStaleSupport(sheet)) {
      return this.isStaleWindowValid(key, sheet);
    }
    return false;
  },

  get(key) {
    return _cache.get(key);
  },

  set(key, value, sheet, meta = {}) {
    const now = Date.now();
    
    let dependsOn = meta.dependsOn || [];
    
    if (key.includes('::')) {
      try {
        const parts = key.split('::');
        if (parts.length === 2) {
          const params = JSON.parse(parts[1]);
          dependsOn = [...dependsOn, ...this.extractDependencies(sheet, params)];
        }
      } catch (e) {
        dependsOn = [sheet];
      }
    } else {
      dependsOn = [sheet];
    }
    
    const reverseDeps = REVERSE_DEPENDENCY_MAP[sheet] || [];
    dependsOn = [...new Set([...dependsOn, ...reverseDeps])];
    
    _cache.set(key, value);
    _cacheTimestamps.set(key, now);
    _cacheMeta.set(key, {
      ..._cacheMeta.get(key),
      ...meta,
      sheet,
      dependsOn,
      isPriority: this.isPrioritySheet(sheet),
      hasStale: this.hasStaleSupport(sheet),
      lastUpdated: now
    });
    
    // MEMORY MANAGEMENT: Enforce max size
    this._enforceMaxSize();
  },

  invalidateByDependency(dependency) {
    let count = 0;
    const keysToDelete = [];
    
    _cacheMeta.forEach((meta, key) => {
      if (meta && meta.dependsOn && meta.dependsOn.includes(dependency)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      _cache.delete(key);
      _cacheTimestamps.delete(key);
      _cacheMeta.delete(key);
      count++;
    });
    
    if (!dependency.includes(':')) {
      const dependents = DEPENDENCY_MAP[dependency] || [];
      dependents.forEach(dep => {
        _cacheMeta.forEach((meta, key) => {
          if (meta && meta.dependsOn && meta.dependsOn.includes(dep) && !keysToDelete.includes(key)) {
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
    let count = 0;
    
    if (options.projectId) {
      count += this.invalidateByDependency(`projects:${options.projectId}`);
    } else if (options.entityId) {
      count += this.invalidateByDependency(`${sheet}:${options.entityId}`);
    } else {
      count += this.invalidateByDependency(sheet);
      
      const keysToDelete = [];
      _cache.forEach((_, key) => {
        if (key === sheet || key.startsWith(sheet + '::')) {
          keysToDelete.push(key);
        }
      });
      
      keysToDelete.forEach(key => {
        _cache.delete(key);
        _cacheTimestamps.delete(key);
        _cacheMeta.delete(key);
      });
      
      count += keysToDelete.length;
    }
    
    return count;
  },

  invalidateRelated(sheet, options = {}) {
    this.invalidate(sheet, options);
    
    const sheetToInvalidate = ['jsa', 'work_methods', 'manpower', 'procurement', 'jadwal', 'projects', 'company'];
    if (sheetToInvalidate.includes(sheet)) {
      this.invalidateByDependency('dashboard_stats');
      this.invalidateByDependency('laporan');
    }
    
    const dependents = DEPENDENCY_MAP[sheet] || [];
    dependents.forEach(dep => {
      if (options.projectId) {
        this.invalidateByDependency(`projects:${options.projectId}`);
      } else {
        this.invalidate(dep);
      }
    });
  },

  clear() {
    _cache.clear();
    _cacheTimestamps.clear();
    _cacheMeta.clear();
    _pending.clear();
  },

  getPending(key) { return _pending.get(key) || null; },
  setPending(key, promise) { _pending.set(key, promise); },
  deletePending(key) { _pending.delete(key); },

  getStats() {
    const totalKeys = _cache.size;
    const bySheet = {};
    
    _cacheMeta.forEach((meta, key) => {
      const sheet = meta.sheet || 'unknown';
      if (!bySheet[sheet]) bySheet[sheet] = { count: 0, dependencies: new Set() };
      bySheet[sheet].count++;
      (meta.dependsOn || []).forEach(dep => bySheet[sheet].dependencies.add(dep));
    });
    
    return {
      totalKeys,
      cacheSize: _cache.size,
      pendingSize: _pending.size,
      bySheet: Object.fromEntries(
        Object.entries(bySheet).map(([sheet, data]) => [
          sheet,
          { count: data.count, dependencies: [...data.dependencies] }
        ])
      )
    };
  },

  async warmup(sheets = null) {
    const sheetsToWarm = sheets || this.getPrioritySheets();
    const warmupPromises = sheetsToWarm.map(async (sheet) => {
      try {
        if (!this.isValid(sheet, sheet, true)) {
          if (sheet === 'company') {
            const all = await DB.getAll(sheet);
            const row = all.rows?.[0] || null;
            if (row) { this.set(sheet, row, sheet); }
          } else {
            await DB.getAll(sheet);
          }
        }
      } catch (err) {
        console.warn(`[AppCache] Warmup failed for ${sheet}:`, err.message);
      }
    });
    await Promise.allSettled(warmupPromises);
  },

  async refreshStale(sheet) {
    if (!this.hasStaleSupport(sheet)) return;
    const isStale = this.isStale(sheet, sheet);
    const isStaleValid = this.isStaleWindowValid(sheet, sheet);
    if (isStale && isStaleValid) {
      try {
        const result = await DB.getAll(sheet);
        this.set(sheet, result, sheet);
      } catch (err) {
        console.warn(`[AppCache] BG refresh failed for ${sheet}:`, err.message);
      }
    }
  },

  shouldBackgroundRefresh(key, sheet) {
    if (!this.hasStaleSupport(sheet)) return false;
    const age = this.getCacheAge(key);
    if (age === null) return false;
    const ttlSec = this.getTTL(sheet) / 1000;
    const threshold = this.getBgRefreshThreshold(sheet);
    return age > ttlSec * threshold;
  },

  getCacheAge(key) {
    const ts = _cacheTimestamps.get(key);
    if (!ts) return null;
    return Math.round((Date.now() - ts) / 1000);
  },
};

// MEMORY LEAK FIX: Mulai periodic cleanup
AppCache._startPeriodicCleanup();

window.AppCache = AppCache;