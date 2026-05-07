const _cache = {};
const _cacheTimestamps = {};
const _cacheMeta = {};
const _pending = {};

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

// DEPENDENCY MAP: Mendefinisikan hubungan antar sheet
// Format: { sheet: [sheets_yang_bergantung_padanya] }
const DEPENDENCY_MAP = Object.freeze({
  'projects': ['jsa', 'work_methods', 'manpower', 'procurement', 'jadwal'],
  'work_methods': ['jsa', 'jadwal'],
  'personnel': ['manpower'],
  'company': ['laporan'],
});

// REVERSE DEPENDENCY MAP: Untuk invalidasi naik (bottom-up)
// Format: { sheet: [sheets_yang_mempengaruhinya] }
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

const AppCache = {
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
      // Urutkan params untuk konsistensi key
      const sorted = {};
      Object.keys(params).sort().forEach(k => {
        sorted[k] = params[k];
      });
      return sheet + '::' + JSON.stringify(sorted);
    }
    return sheet;
  },

  /**
   * Ekstrak dependencies dari params cache key
   * @param {string} sheet - Nama sheet
   * @param {object} params - Parameter yang digunakan untuk fetch
   * @returns {string[]} Array dependency strings
   */
  extractDependencies(sheet, params = {}) {
    const deps = [sheet]; // Selalu depend pada sheet utamanya
    
    if (params.filterField === 'project_id' && params.filterValue) {
      deps.push(`projects:${params.filterValue}`);
    }
    
    if (params.filterField === 'work_method_id' && params.filterValue) {
      deps.push(`work_methods:${params.filterValue}`);
    }
    
    if (params.filterField === 'personnel_id' && params.filterValue) {
      deps.push(`personnel:${params.filterValue}`);
    }
    
    // Tambahkan reverse dependencies
    const reverseDeps = REVERSE_DEPENDENCY_MAP[sheet] || [];
    reverseDeps.forEach(revDep => deps.push(revDep));
    
    return [...new Set(deps)]; // Hapus duplikat
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
    if (!_cache[key]) return false;
    const ts = _cacheTimestamps[key];
    if (!ts) return false;
    return (Date.now() - ts) >= this.getTTL(sheet || 'default');
  },

  isStaleWindowValid(key, sheet) {
    const sw = this.getStaleWindow(sheet);
    if (!sw) return false;
    if (!_cache[key]) return false;
    const ts = _cacheTimestamps[key];
    if (!ts) return false;
    return (Date.now() - ts) < (this.getTTL(sheet) + sw);
  },

  isValid(key, sheet, allowStale = false) {
    if (!_cache[key]) return false;
    const ts = _cacheTimestamps[key];
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
    return _cache[key];
  },

  set(key, value, sheet, meta = {}) {
    const now = Date.now();
    
    // Ekstrak dependencies dari params di key
    let dependsOn = meta.dependsOn || [];
    
    // Jika key mengandung params (format: sheet::{"filterField":"project_id","filterValue":"proj_123"})
    if (key.includes('::')) {
      try {
        const parts = key.split('::');
        if (parts.length === 2) {
          const params = JSON.parse(parts[1]);
          dependsOn = [...dependsOn, ...this.extractDependencies(sheet, params)];
        }
      } catch (e) {
        // Key bukan JSON params, gunakan sebagai string biasa
        dependsOn = [sheet];
      }
    } else {
      // Key sederhana (hanya nama sheet)
      dependsOn = [sheet];
    }
    
    // Tambahkan reverse dependencies
    const reverseDeps = REVERSE_DEPENDENCY_MAP[sheet] || [];
    dependsOn = [...new Set([...dependsOn, ...reverseDeps])];
    
    _cache[key] = value;
    _cacheTimestamps[key] = now;
    _cacheMeta[key] = {
      ..._cacheMeta[key],
      ...meta,
      sheet,
      dependsOn,
      isPriority: this.isPrioritySheet(sheet),
      hasStale: this.hasStaleSupport(sheet),
      lastUpdated: now
    };
  },

  /**
   * Invalidasi cache berdasarkan dependency tag
   * @param {string} dependency - Tag dependency (e.g., 'jsa', 'projects:proj_123', 'work_methods:wm_456')
   */
  invalidateByDependency(dependency) {
    let count = 0;
    Object.keys(_cache).forEach(key => {
      const meta = _cacheMeta[key];
      if (meta && meta.dependsOn && meta.dependsOn.includes(dependency)) {
        delete _cache[key];
        delete _cacheTimestamps[key];
        delete _cacheMeta[key];
        count++;
      }
    });
    
    // Juga invalidasi cache yang bergantung pada sheet ini (cascading upward)
    if (!dependency.includes(':')) {
      const dependents = DEPENDENCY_MAP[dependency] || [];
      dependents.forEach(dep => {
        Object.keys(_cache).forEach(key => {
          const meta = _cacheMeta[key];
          if (meta && meta.dependsOn && meta.dependsOn.includes(dep)) {
            delete _cache[key];
            delete _cacheTimestamps[key];
            delete _cacheMeta[key];
            count++;
          }
        });
      });
    }
    
    return count;
  },

  /**
   * Invalidasi cache untuk sheet tertentu (presisi dengan dependencies)
   * @param {string} sheet - Nama sheet
   * @param {object} options - Opsi tambahan
   * @param {string} options.projectId - ID proyek spesifik (opsional)
   * @param {string} options.entityId - ID entitas spesifik (opsional)
   */
  invalidate(sheet, options = {}) {
    let count = 0;
    
    if (options.projectId) {
      // Invalidasi presisi: hanya cache yang terkait proyek tertentu
      count += this.invalidateByDependency(`projects:${options.projectId}`);
    } else if (options.entityId) {
      // Invalidasi presisi: hanya cache yang terkait entitas tertentu
      count += this.invalidateByDependency(`${sheet}:${options.entityId}`);
    } else {
      // Invalidasi global untuk sheet
      count += this.invalidateByDependency(sheet);
      
      // Juga invalidasi cache simple keys
      Object.keys(_cache).forEach(key => {
        if (key === sheet || key.startsWith(sheet + '::')) {
          delete _cache[key];
          delete _cacheTimestamps[key];
          delete _cacheMeta[key];
          count++;
        }
      });
    }
    
    return count;
  },

  /**
   * Invalidasi cache terkait (cascading) saat ada perubahan data
   * @param {string} sheet - Sheet yang diubah
   * @param {object} options - Opsi tambahan
   * @param {string} options.projectId - ID proyek spesifik (opsional)
   * @param {string} options.entityId - ID entitas spesifik (opsional)
   */
  invalidateRelated(sheet, options = {}) {
    // Invalidasi sheet yang diubah
    this.invalidate(sheet, options);
    
    // Invalidasi dashboard_stats dan laporan jika relevan
    const sheetToInvalidate = ['jsa', 'work_methods', 'manpower', 'procurement', 'jadwal', 'projects', 'company'];
    if (sheetToInvalidate.includes(sheet)) {
      this.invalidateByDependency('dashboard_stats');
      this.invalidateByDependency('laporan');
    }
    
    // Cascading invalidate berdasarkan dependency map
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
    Object.keys(_cache).forEach(k => {
      delete _cache[k];
      delete _cacheTimestamps[k];
      delete _cacheMeta[k];
    });
  },

  getPending(key) { return _pending[key] || null; },
  setPending(key, promise) { _pending[key] = promise; },
  deletePending(key) { delete _pending[key]; },

  /**
   * Dapatkan statistik cache untuk debugging
   */
  getStats() {
    const totalKeys = Object.keys(_cache).length;
    const bySheet = {};
    
    Object.entries(_cacheMeta).forEach(([key, meta]) => {
      const sheet = meta.sheet || 'unknown';
      if (!bySheet[sheet]) bySheet[sheet] = { count: 0, dependencies: new Set() };
      bySheet[sheet].count++;
      (meta.dependsOn || []).forEach(dep => bySheet[sheet].dependencies.add(dep));
    });
    
    return {
      totalKeys,
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
    const ts = _cacheTimestamps[key];
    if (!ts) return null;
    return Math.round((Date.now() - ts) / 1000);
  },
};

window.AppCache = AppCache;