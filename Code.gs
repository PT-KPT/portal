const SHEET_ID = '1labR19GsvF8mFcn4eAsHpzFGenWFROSBfdG0b_yoSXQ';
const API_TOKEN = PropertiesService.getScriptProperties().getProperty('KPT_API_TOKEN') || '';

const SHEETS = {
  company:      { name: 'company',      headers: ['id','name','address','contact','email','website','updated_at'] },
  projects:     { name: 'projects',     headers: ['id','name','client','location','pic','start_date','end_date','contract_value','created_at','updated_at'] },
  jsa:          { name: 'jsa',          headers: ['id','project_id','document_number','revision','date','ppe','hazard_identification','emergency','permits','prepared_by','reviewed_by','approved_by','created_at','updated_at'] },
  work_methods: { name: 'work_methods', headers: ['id','project_id','document_number','revision','date','work_steps','prepared_by','reviewed_by','approved_by','created_at','updated_at'] },
  personnel:    { name: 'personnel',    headers: ['id','name','nik','birth_date','address','position','updated_at'] },
  manpower:     { name: 'manpower',     headers: ['id','project_id','personnel_id','updated_at'] },
  procurement:  { name: 'procurement',  headers: ['id','project_id','material_name','specification','quantity','unit','unit_price','total_price','supplier','date','created_at','updated_at'] },
  accounts:     { name: 'accounts',     headers: ['username','password','role','name'] },
  jadwal:       { name: 'jadwal',       headers: ['id','project_id','work_method_id','document_number','step_number','work_stage','work_process','start_date','end_date','updated_at'] },
};

// Kolom tanggal yang harus dikembalikan sebagai yyyy-MM-dd (bukan ISO string penuh)
// agar langsung kompatibel dengan input[type="date"] di browser
const DATE_ONLY_FIELDS = new Set([
  'start_date', 'end_date', 'birth_date', 'date'
]);

let _ssCache = null;
function _getSpreadsheet() {
  if (!_ssCache) _ssCache = SpreadsheetApp.openById(SHEET_ID);
  return _ssCache;
}

function _validateToken(tokenFromRequest) {
  if (!API_TOKEN) return true;
  return tokenFromRequest === API_TOKEN;
}

// ─────────────────────────────────────────────────────────────
// ENTRY POINTS
// ─────────────────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action || '';
  if (action !== 'ping') {
    const tok = e.parameter.token || '';
    if (!_validateToken(tok)) return jsonErr('Unauthorized');
  }
  try {
    if (action === 'ping')    return jsonOk({ message: 'KPT API ready', ts: new Date().toISOString() });
    if (action === 'getAll')  return jsonOk(getAllOptimized(e.parameter.sheet, {
      filterField: e.parameter.filterField, filterValue: e.parameter.filterValue,
      searchField: e.parameter.searchField, searchValue: e.parameter.searchValue,
      limit:  parseInt(e.parameter.limit)  || 0,
      offset: parseInt(e.parameter.offset) || 0,
      fields: e.parameter.fields ? e.parameter.fields.split(',') : null
    }));
    if (action === 'getById')  return jsonOk({ row: getById(e.parameter.sheet, e.parameter.id) });
    if (action === 'getCount') return jsonOk({ count: getCount(e.parameter.sheet) });
    if (action === 'getCounts')return jsonOk(getCounts(e.parameter.sheets ? e.parameter.sheets.split(',') : []));
    if (action === 'getStats') return jsonOk(getDashboardStats());
    if (action === 'getRecent')return jsonOk(getRecentOptimized(e.parameter.sheet, parseInt(e.parameter.limit) || 5));
    if (action === 'getSummary')return jsonOk(getProjectSummary(e.parameter.projectId));
    return jsonErr('Unknown GET action: ' + action);
  } catch (err) { return jsonErr(err.toString()); }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { action, sheet, data, id } = payload;
    if (action !== 'login' && !_validateToken(payload.token || '')) return jsonErr('Unauthorized');
    if (action === 'login')        return jsonOk(handleLogin(payload.username, payload.password));
    if (action === 'upsert')       return jsonOk({ row: upsert(sheet, data) });
    if (action === 'delete')       return jsonOk({ deleted: deleteRow(sheet, id) });
    if (action === 'deleteWhere')  return jsonOk({ deleted: deleteWhere(sheet, payload.field, payload.value) });
    if (action === 'batchUpsert')  return jsonOk({ rows: batchUpsert(payload.operations || []) });
    if (action === 'batchDelete')  return jsonOk({ deleted: batchDelete(payload.operations || []) });
    if (action === 'initSheets')   return jsonOk({ message: initAllSheets() });
    if (action === 'saveAccount')  return jsonOk({ row: handleSaveAccount(payload) });
    if (action === 'deleteProject')return jsonOk({ deleted: deleteProjectCascade(payload.projectId) });
    return jsonErr('Unknown POST action: ' + action);
  } catch (err) { return jsonErr(err.toString()); }
}

function doOptions(e) {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

// ─────────────────────────────────────────────────────────────
// READ OPERATIONS
// ─────────────────────────────────────────────────────────────

function getAllOptimized(sheetName, opts) {
  opts = opts || {};
  const ws      = getOrCreateSheet(sheetName);
  const headers = SHEETS[sheetName].headers;
  const lastRow = ws.getLastRow();
  const result  = { rows: [], total: 0 };
  if (lastRow < 2) return result;

  // Tentukan kolom yang akan dikembalikan (partial select)
  let colIndices  = headers.map((_, i) => i);
  let readHeaders = headers;
  if (opts.fields && opts.fields.length > 0) {
    const mapped = opts.fields.map(f => headers.indexOf(f)).filter(i => i !== -1);
    if (mapped.length > 0) { colIndices = mapped; readHeaders = opts.fields.filter(f => headers.indexOf(f) !== -1); }
  }

  const values   = ws.getRange(2, 1, lastRow - 1, headers.length).getValues();
  let   filtered = values.filter(row => row[0] !== '' && row[0] !== null && row[0] !== undefined);
  result.total   = filtered.length;

  // Filter
  if (opts.filterField && opts.filterValue !== undefined && opts.filterValue !== null && opts.filterValue !== '') {
    const ci = headers.indexOf(opts.filterField);
    if (ci !== -1) {
      filtered     = filtered.filter(row => String(row[ci]) === String(opts.filterValue));
      result.total = filtered.length;
    }
  }
  if (opts.searchField && opts.searchValue) {
    const ci          = headers.indexOf(opts.searchField);
    const searchLower = String(opts.searchValue).toLowerCase();
    if (ci !== -1) {
      filtered     = filtered.filter(row => row[ci] && String(row[ci]).toLowerCase().includes(searchLower));
      result.total = filtered.length;
    }
  }

  // Sort berdasarkan updated_at lalu created_at (terbaru di atas)
  const dateCI    = headers.indexOf('updated_at');
  const createdCI = headers.indexOf('created_at');
  if (dateCI !== -1 || createdCI !== -1) {
    filtered.sort((a, b) => {
      const rawA = (dateCI !== -1 ? a[dateCI] : null) || (createdCI !== -1 ? a[createdCI] : null) || '';
      const rawB = (dateCI !== -1 ? b[dateCI] : null) || (createdCI !== -1 ? b[createdCI] : null) || '';
      const tA   = rawA ? (rawA instanceof Date ? rawA.getTime() : new Date(rawA).getTime()) : 0;
      const tB   = rawB ? (rawB instanceof Date ? rawB.getTime() : new Date(rawB).getTime()) : 0;
      return tB - tA;
    });
  }

  // Pagination
  if (opts.limit > 0) filtered = filtered.slice(opts.offset || 0, (opts.offset || 0) + opts.limit);

  // Map ke objek
  result.rows = filtered.map(row => {
    if (opts.fields && colIndices.length > 0 && colIndices.length < headers.length) {
      const obj = {};
      colIndices.forEach((ci, i) => { obj[readHeaders[i]] = _parseValue(row[ci], readHeaders[i]); });
      return obj;
    }
    return rowToObj(headers, row);
  });
  return result;
}

/**
 * FIX: Sebelumnya mengambil N baris terakhir berdasarkan POSISI di sheet,
 * bukan berdasarkan tanggal terbaru. Jika data di-edit, baris tidak berpindah
 * posisi sehingga tidak muncul di "Terbaru".
 * SEKARANG: Ambil semua data, sort by updated_at/created_at, ambil N teratas.
 */
function getRecentOptimized(sheetName, limit) {
  const ws      = getOrCreateSheet(sheetName);
  const headers = SHEETS[sheetName].headers;
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return { rows: [], total: 0 };

  const values   = ws.getRange(2, 1, lastRow - 1, headers.length).getValues();
  let   filtered = values.filter(row => row[0] !== '' && row[0] !== null && row[0] !== undefined);

  // Sort by updated_at DESC lalu created_at DESC
  const dateCI    = headers.indexOf('updated_at');
  const createdCI = headers.indexOf('created_at');
  if (dateCI !== -1 || createdCI !== -1) {
    filtered.sort((a, b) => {
      const rawA = (dateCI !== -1 ? a[dateCI] : null) || (createdCI !== -1 ? a[createdCI] : null) || '';
      const rawB = (dateCI !== -1 ? b[dateCI] : null) || (createdCI !== -1 ? b[createdCI] : null) || '';
      const tA   = rawA ? (rawA instanceof Date ? rawA.getTime() : new Date(rawA).getTime()) : 0;
      const tB   = rawB ? (rawB instanceof Date ? rawB.getTime() : new Date(rawB).getTime()) : 0;
      return tB - tA;
    });
  }

  const top = filtered.slice(0, limit);
  return { rows: top.map(row => rowToObj(headers, row)), total: filtered.length };
}

function getById(sheetName, id) {
  if (!id) return null;
  const ws      = getOrCreateSheet(sheetName);
  const headers = SHEETS[sheetName].headers;
  const idCol   = headers.indexOf('id') + 1;
  if (idCol === 0) return null;
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return null;
  const finder = ws.getRange(2, idCol, lastRow - 1, 1).createTextFinder(String(id)).matchEntireCell(true);
  const cell   = finder.findNext();
  if (!cell) return null;
  return rowToObj(headers, ws.getRange(cell.getRow(), 1, 1, headers.length).getValues()[0]);
}

function getCount(sheetName) {
  const ws      = getOrCreateSheet(sheetName);
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return 0;
  const headers = SHEETS[sheetName].headers;
  const idCol   = headers.indexOf('id');
  const col     = idCol !== -1 ? idCol + 1 : headers.indexOf('username') + 1;
  if (col === 0) return 0;
  const vals = ws.getRange(2, col, lastRow - 1, 1).getValues().flat();
  return vals.filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
}

function getCounts(sheetNames) {
  const ss     = _getSpreadsheet();
  const counts = {};
  sheetNames.forEach(name => {
    if (!SHEETS[name]) { counts[name] = 0; return; }
    const cfg = SHEETS[name];
    const ws  = ss.getSheetByName(cfg.name);
    if (!ws || ws.getLastRow() < 2) { counts[name] = 0; return; }
    const idCol = cfg.headers.indexOf('id');
    const col   = idCol !== -1 ? idCol + 1 : cfg.headers.indexOf('username') + 1;
    if (col === 0) { counts[name] = 0; return; }
    const vals  = ws.getRange(2, col, ws.getLastRow() - 1, 1).getValues().flat();
    counts[name] = vals.filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
  });
  return counts;
}

function getDashboardStats() {
  const ss         = _getSpreadsheet();
  const sheetNames = ['projects', 'jsa', 'work_methods', 'procurement', 'manpower'];
  const counts     = {};
  sheetNames.forEach(name => {
    const ws = ss.getSheetByName(SHEETS[name].name);
    if (!ws || ws.getLastRow() < 2) { counts[name] = 0; return; }
    const idCol = SHEETS[name].headers.indexOf('id') + 1;
    if (idCol === 0) { counts[name] = 0; return; }
    const vals  = ws.getRange(2, idCol, ws.getLastRow() - 1, 1).getValues().flat();
    counts[name] = vals.filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
  });
  return {
    totalProjects:    counts['projects'],
    totalJSA:         counts['jsa'],
    totalWorkMethods: counts['work_methods'],
    totalPO:          counts['procurement'],
    totalManpower:    counts['manpower']
  };
}

function getProjectSummary(projectId) {
  if (!projectId) throw new Error('projectId required');
  const ss      = _getSpreadsheet();
  const summary = { jsa_count: 0, wm_count: 0, po_count: 0, mp_count: 0 };
  const map     = { jsa: 'jsa_count', work_methods: 'wm_count', procurement: 'po_count', manpower: 'mp_count' };
  for (const [sheetName, countKey] of Object.entries(map)) {
    const ws = ss.getSheetByName(SHEETS[sheetName].name);
    if (!ws || ws.getLastRow() < 2) continue;
    const projCol = SHEETS[sheetName].headers.indexOf('project_id');
    if (projCol === -1) continue;
    const vals       = ws.getRange(2, projCol + 1, ws.getLastRow() - 1, 1).getValues().flat();
    summary[countKey] = vals.filter(v => String(v) === String(projectId)).length;
  }
  return summary;
}

// ─────────────────────────────────────────────────────────────
// WRITE OPERATIONS
// ─────────────────────────────────────────────────────────────

function upsert(sheetName, data) {
  const ws      = getOrCreateSheet(sheetName);
  const headers = SHEETS[sheetName].headers;
  const idCol   = headers.indexOf('id');

  // Sheet tanpa kolom id (misalnya accounts yang pakai username sebagai key)
  if (idCol === -1) {
    const keyCol  = headers.indexOf('username');
    const lastRow = ws.getLastRow();
    if (lastRow >= 2) {
      const vals = ws.getRange(2, keyCol + 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < vals.length; i++) {
        if (String(vals[i][0]).toLowerCase() === String(data.username).toLowerCase()) {
          ws.getRange(i + 2, 1, 1, headers.length).setValues([objToRow(headers, data)]);
          return data;
        }
      }
    }
    ws.appendRow(objToRow(headers, data));
    return data;
  }

  // Cari baris yang sudah ada berdasarkan id
  const lastRow = ws.getLastRow();
  if (lastRow >= 2) {
    const finder = ws.getRange(2, idCol + 1, lastRow - 1, 1)
      .createTextFinder(String(data.id)).matchEntireCell(true);
    const cell = finder.findNext();
    if (cell) {
      ws.getRange(cell.getRow(), 1, 1, headers.length).setValues([objToRow(headers, data)]);
      return data;
    }
  }
  ws.appendRow(objToRow(headers, data));
  return data;
}

function deleteRow(sheetName, id) {
  const ws      = getOrCreateSheet(sheetName);
  const headers = SHEETS[sheetName].headers;
  const idCol   = headers.indexOf('id');
  if (idCol === -1) return false;
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return false;
  const finder = ws.getRange(2, idCol + 1, lastRow - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true);
  const cell = finder.findNext();
  if (!cell) return false;
  ws.deleteRow(cell.getRow());
  return true;
}

function deleteWhere(sheetName, field, value) {
  const ws      = getOrCreateSheet(sheetName);
  const headers = SHEETS[sheetName].headers;
  const col     = headers.indexOf(field);
  if (col === -1) return 0;
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return 0;
  const vals    = ws.getRange(2, col + 1, lastRow - 1, 1).getValues();
  let   deleted = 0;
  // Iterasi dari bawah ke atas agar row index tidak bergeser saat delete
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === String(value)) { ws.deleteRow(i + 2); deleted++; }
  }
  return deleted;
}

/**
 * FIX: Versi lama memanggil ws.getLastRow() di dalam loop setelah melakukan
 * setValues() pada baris yang ada, lalu memanggil ws.getLastRow()+1 untuk 
 * newRows. Ini bisa tidak akurat jika ada multiple sheets dalam satu batch.
 * SEKARANG: Hitung startRow untuk insert baru sekali saja setelah semua update selesai,
 * menggunakan ws.getLastRow() yang fresh.
 */
function batchUpsert(operations) {
  const results = [];
  const grouped = {};
  operations.forEach(op => {
    if (!op.sheet || !op.data) return;
    if (!grouped[op.sheet]) grouped[op.sheet] = [];
    grouped[op.sheet].push(op.data);
  });

  for (const [sheetName, dataArray] of Object.entries(grouped)) {
    if (!SHEETS[sheetName]) continue;
    const ws      = getOrCreateSheet(sheetName);
    const headers = SHEETS[sheetName].headers;
    const idCol   = headers.indexOf('id');

    // Sheet tanpa id — fallback ke upsert satu per satu
    if (idCol === -1) {
      dataArray.forEach(data => results.push(upsert(sheetName, data)));
      continue;
    }

    // Baca semua id yang sudah ada
    const lastRow    = ws.getLastRow();
    const existingIds = {};
    if (lastRow >= 2) {
      const idVals = ws.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
      idVals.forEach((v, i) => { if (v[0] !== '' && v[0] !== null) existingIds[String(v[0])] = i + 2; });
    }

    // Pisahkan: yang sudah ada (update) dan yang baru (insert)
    const newRows = [];
    dataArray.forEach(data => {
      const rowNum = existingIds[String(data.id)];
      if (rowNum) {
        ws.getRange(rowNum, 1, 1, headers.length).setValues([objToRow(headers, data)]);
      } else {
        newRows.push(objToRow(headers, data));
      }
      results.push(data);
    });

    // Insert baru: ambil lastRow SETELAH semua update selesai agar akurat
    if (newRows.length > 0) {
      const insertAt = ws.getLastRow() + 1;
      ws.getRange(insertAt, 1, newRows.length, headers.length).setValues(newRows);
    }
  }
  return results;
}

function batchDelete(operations) {
  let totalDeleted = 0;
  const grouped    = {};
  operations.forEach(op => {
    const key = op.sheet + '::' + op.field;
    if (!grouped[key]) grouped[key] = { sheet: op.sheet, field: op.field, values: [] };
    grouped[key].values.push(String(op.value));
  });
  for (const grp of Object.values(grouped)) {
    const ws      = getOrCreateSheet(grp.sheet);
    const headers = SHEETS[grp.sheet].headers;
    const col     = headers.indexOf(grp.field);
    if (col === -1) continue;
    const lastRow = ws.getLastRow();
    if (lastRow < 2) continue;
    const vals       = ws.getRange(2, col + 1, lastRow - 1, 1).getValues();
    const targetSet  = new Set(grp.values);
    const rowsToDelete = [];
    vals.forEach((v, i) => { if (targetSet.has(String(v[0]))) rowsToDelete.push(i + 2); });
    // Hapus dari bawah ke atas
    for (let i = rowsToDelete.length - 1; i >= 0; i--) { ws.deleteRow(rowsToDelete[i]); totalDeleted++; }
  }
  return totalDeleted;
}

function deleteProjectCascade(projectId) {
  if (!projectId) throw new Error('projectId wajib diisi');
  ['jsa', 'work_methods', 'procurement', 'manpower', 'jadwal'].forEach(sheetName => {
    deleteWhere(sheetName, 'project_id', projectId);
  });
  deleteRow('projects', projectId);
  return true;
}

// ─────────────────────────────────────────────────────────────
// SHEET MANAGEMENT
// ─────────────────────────────────────────────────────────────

function initAllSheets() {
  const ss = _getSpreadsheet();
  Object.values(SHEETS).forEach(cfg => {
    let ws = ss.getSheetByName(cfg.name);
    if (!ws) ws = ss.insertSheet(cfg.name);
    if (ws.getLastRow() === 0 || ws.getRange(1, 1).getValue() !== cfg.headers[0]) {
      ws.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
      ws.getRange(1, 1, 1, cfg.headers.length)
        .setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
      ws.setFrozenRows(1);
    }
  });
  // Buat akun default jika belum ada
  const accountWs = ss.getSheetByName('accounts');
  if (accountWs && accountWs.getLastRow() <= 1) {
    const defaults = [
      ['admin',   hashPassword('admin123'),   'admin',   'Administrator'],
      ['hse',     hashPassword('hse123'),     'hse',     'HSE Officer'],
      ['pembeli', hashPassword('pembeli123'), 'pembeli', 'Staff Pembeli']
    ];
    accountWs.getRange(2, 1, defaults.length, 4).setValues(defaults);
  }
  return 'All sheets initialized';
}

function getOrCreateSheet(sheetName) {
  const ss  = _getSpreadsheet();
  let   ws  = ss.getSheetByName(sheetName);
  if (!ws) {
    ws = ss.insertSheet(sheetName);
    const cfg = SHEETS[sheetName];
    if (cfg) {
      ws.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
      ws.getRange(1, 1, 1, cfg.headers.length)
        .setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff');
      ws.setFrozenRows(1);
    }
  }
  return ws;
}

// ─────────────────────────────────────────────────────────────
// DATA CONVERSION HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * FIX: Sebelumnya semua Date object dikembalikan sebagai ISO string penuh
 * (e.g. "2026-05-04T17:00:00.000Z"), menyebabkan error di input[type="date"] browser
 * yang hanya menerima format "yyyy-MM-dd".
 * 
 * SEKARANG: Kolom yang ada di DATE_ONLY_FIELDS dikembalikan sebagai "yyyy-MM-dd".
 * Kolom lain (created_at, updated_at) tetap sebagai ISO string penuh.
 */
function _parseValue(v, fieldName) {
  if (v instanceof Date) {
    if (fieldName && DATE_ONLY_FIELDS.has(fieldName)) {
      // Kembalikan sebagai yyyy-MM-dd — gunakan UTC agar tidak terpengaruh timezone server
      const yyyy = v.getUTCFullYear();
      const mm   = String(v.getUTCMonth() + 1).padStart(2, '0');
      const dd   = String(v.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return v.toISOString();
  }
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
    try { return JSON.parse(v); } catch (e) {}
  }
  // String tanggal yang sudah dalam format yyyy-MM-dd — kembalikan apa adanya
  if (fieldName && DATE_ONLY_FIELDS.has(fieldName) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return v.substring(0, 10);
  }
  return v;
}

function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = _parseValue(row[i], h); });
  return obj;
}

function objToRow(headers, obj) {
  return headers.map(h => {
    let v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object')         return JSON.stringify(v);
    // Cegah injeksi formula Google Sheets
    const s = String(v);
    return s.startsWith('=') ? "'" + s : s;
  });
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────

function hashPassword(password) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8
  );
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function handleLogin(username, password) {
  if (!username || !password) throw new Error('Username dan password wajib diisi.');
  const ws      = getOrCreateSheet('accounts');
  const headers = SHEETS.accounts.headers;
  const lastRow = ws.getLastRow();
  if (lastRow < 2) throw new Error('Tidak ada akun terdaftar.');

  const values  = ws.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const uCol    = headers.indexOf('username');
  const pwCol   = headers.indexOf('password');
  const roleCol = headers.indexOf('role');
  const nameCol = headers.indexOf('name');
  const inputHash = hashPassword(password);

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[uCol] || String(row[uCol]).toLowerCase() !== username.toLowerCase()) continue;

    let storedPw = String(row[pwCol] || '');
    // Migrasi otomatis: jika password tersimpan plain text (< 64 char), hash terlebih dulu
    if (storedPw.length < 64) storedPw = hashPassword(storedPw);

    if (storedPw !== inputHash) throw new Error('Username atau password salah.');

    return {
      session: {
        username: String(row[uCol]),
        name:     String(row[nameCol] || ''),
        role:     String(row[roleCol] || 'hse')
      }
    };
  }
  throw new Error('Username atau password salah.');
}

function handleSaveAccount(payload) {
  const { username, name, role, oldUsername, password } = payload;
  if (!username || !name) throw new Error('Data akun tidak lengkap.');

  let finalPasswordHash;
  if (password && password.trim() !== '') {
    finalPasswordHash = hashPassword(password);
  } else {
    // Edit tanpa ubah password — ambil hash yang sudah ada
    const ws      = getOrCreateSheet('accounts');
    const headers = SHEETS.accounts.headers;
    const lastRow = ws.getLastRow();
    const uCol    = headers.indexOf('username');
    const pwCol   = headers.indexOf('password');
    const targetUser = (oldUsername && oldUsername.trim() !== '') ? oldUsername : username;

    if (lastRow >= 2) {
      const values = ws.getRange(2, 1, lastRow - 1, headers.length).getValues();
      const row    = values.find(r => String(r[uCol] || '').toLowerCase() === targetUser.toLowerCase());
      if (row) finalPasswordHash = String(row[pwCol]);
    }
    if (!finalPasswordHash) throw new Error('Password wajib diisi untuk akun baru.');
  }

  // Jika username berubah, hapus record lama terlebih dulu
  if (oldUsername && oldUsername.trim() !== '' && oldUsername !== username) {
    deleteWhere('accounts', 'username', oldUsername);
  }

  return upsert('accounts', { username, password: finalPasswordHash, name, role });
}

// ─────────────────────────────────────────────────────────────
// RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────

function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}