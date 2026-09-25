// วัดจำนวนครั้งที่เรียก Google Sheets ต่อ 1 action (ตัวแปรหลักของความหน่วงใน GAS)
// รัน: node tests/perf.bench.js  — ใช้ชีตจำลองขนาดใกล้ของจริง (ร้านเปิด ~3 เดือน)
const fs = require('fs'), vm = require('vm'), path = require('path');
const COST = { getActiveSpreadsheet: 5, getSheetByName: 30, getSheets: 40, getValues: 150, getSpreadsheetTimeZone: 30, write: 120 };

function makeWorld() {
  const cnt = {}; const hit = k => cnt[k] = (cnt[k] || 0) + 1;
  const sheets = {};
  const mkSheet = (name, rows) => {
    const data = rows;
    const sh = {
      getName: () => name,
      getDataRange: () => ({ getValues: () => { hit('getValues'); return data.map(r => r.slice()); } }),
      getRange: (r, c, nr, nc) => ({ setValues: v => { hit('write'); v.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((x, j) => data[r - 1 + i][c - 1 + j] = x); }); } }),
      appendRow: row => { hit('write'); data.push(row.slice()); },
      deleteRow: i => { hit('write'); data.splice(i - 1, 1); },
      setFrozenRows: () => {},
    };
    sheets[name] = sh; return sh;
  };
  const ss = {
    getSheetByName: n => { hit('getSheetByName'); return sheets[n] || null; },
    getSheets: () => { hit('getSheets'); return Object.values(sheets); },
    insertSheet: n => { hit('write'); return mkSheet(n, []); },
    getSpreadsheetTimeZone: () => { hit('getSpreadsheetTimeZone'); return 'Asia/Bangkok'; },
  };
  return { cnt, sheets, mkSheet, ss };
}

function load(world) {
  const ctx = { console, Object, JSON, Math, Date, Array, String, Number, parseFloat, isNaN, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => { world.cnt.getActiveSpreadsheet = (world.cnt.getActiveSpreadsheet || 0) + 1; return world.ss; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return s; }, s }) },
    Utilities: { formatDate: (d, tz, f) => { const t = new Date(d.getTime() + 7 * 3600e3); const p = n => String(n).padStart(2, '0');
      return f === 'HHmm' ? p(t.getUTCHours()) + p(t.getUTCMinutes()) : t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()); } },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) } };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas/Code.gs'), 'utf8'), ctx);
  return ctx;
}

function seed(world, ctx) {
  const H = ctx.HEADERS, S = {};
  Object.keys(H).forEach(k => S[k] = [H[k].slice()]);
  const d0 = new Date('2026-07-01T00:00:00+07:00');
  S.Staff.push(['Uowner', 'ปาล์ม', 'ปาล์ม', 'owner', true, d0], ['Ubar', 'เนสคับ', 'เนส', 'barista', true, d0]);
  for (let i = 0; i < 5; i++) S.Staff.push(['U' + i, 'พนักงาน' + i, 'p' + i, 'barista', true, d0]);
  ctx.SEED_CATEGORIES.forEach(c => S.Categories.push([c[0], c[1], c[2], c[3], c[4], c[5], true]));
  ctx.SEED_CANDLES.forEach(c => S.Candles.push([c[0], c[1], c[2], c[3], c[4], c[5], true]));
  S.Config.push(['SHOP_NAME', 'Old Days'], ['COMMISSION_PER_CUP', '3']);
  for (let i = 0; i < 90; i++) {
    const d = new Date(d0.getTime() + i * 864e5); const iso = ctx.Utilities.formatDate(d, '', 'yyyy-MM-dd');
    S.DailyClose.push([d, 3000, 500, 1500, 1000, 0, 0, 5, 150, 0, 0, '{"coffee":20,"bakery":5}', '{}', 20, 3, 60, '', 'ลูกค้า 30 คน / 30 บิล', 'FoodStory (อัตโนมัติ)', d]);
    for (let c = 0; c < 12; c++) S.SalesByCategory.push([iso, 'category', 'C' + c, 3, 'แก้ว']);
    S.CommissionPay.push([d, 'เนสคับ', 60, 'unpaid', '', '', '']);
  }
  for (let i = 0; i < 25; i++) S.Ingredients.push(['ing' + i, 'วัตถุดิบ' + i, 'ถุง', 2, 10, true, d0]);
  for (let i = 0; i < 400; i++) S.StockMoves.push([d0, 'ing' + (i % 25), 'วัตถุดิบ', 'in', 1, 10, '', 'เนสคับ']);
  for (let i = 0; i < 40; i++) S.Purchases.push(['po' + i, d0, 'เนสคับ', 'นม', 100, 'purchased', '', '', 100, d0, '']);
  for (let i = 1; i <= 150; i++) {
    const id = 'M' + String(i).padStart(4, '0');
    S.Members.push([id, 'สมาชิก' + i, '', '08' + String(10000000 + i), '2026-09-01', '2027-03-01', 'coffee', 100, 'cash', 'shop', '', 'active', '', 'เนสคับ', d0]);
    S.MemberLog.push(['Lj' + i, d0, id, 'join', 0, 100, 'coffee', '', 'เนสคับ']);
    for (let k = 0; k < 8; k++) S.MemberLog.push(['L' + i + '_' + k, d0, id, 'buy', 2, 0, '', '', 'เนสคับ']);
  }
  Object.keys(S).forEach(k => world.mkSheet(k, S[k]));
}

const ACTIONS = [
  ['bootstrap (เปิดแอป)', { action: 'bootstrap', lineUserId: 'Ubar' }],
  ['getReport (หน้าแรก/รายงาน)', { action: 'getReport', lineUserId: 'Uowner', month: '2026-09' }],
  ['getStock (สต๊อก)', { action: 'getStock', lineUserId: 'Ubar' }],
  ['getPurchases (เบิกซื้อ)', { action: 'getPurchases', lineUserId: 'Uowner' }],
  ['getMembers (หน้าสมาชิก)', { action: 'getMembers', lineUserId: 'Ubar' }],
  ['getMember (เปิดบัตรสมาชิก)', { action: 'getMember', lineUserId: 'Ubar', memberId: 'M0050' }],
  ['addMemberCups (+แก้ว)', { action: 'addMemberCups', lineUserId: 'Ubar', memberId: 'M0050', cups: 1 }],
  ['getCommissionAdmin (ค่าคอม)', { action: 'getCommissionAdmin', lineUserId: 'Uowner', month: '2026-09' }],
  ['stockMove (รับเข้า)', { action: 'stockMove', lineUserId: 'Ubar', ingredientId: 'ing3', type: 'in', qty: 1 }],
];

module.exports = { makeWorld, load, seed };
if (require.main === module) {

const out = [];
let total = 0;
ACTIONS.forEach(([label, body]) => {
  const w = makeWorld(); const ctx = load(w); seed(w, ctx);
  Object.keys(w.cnt).forEach(k => delete w.cnt[k]);
  const res = ctx.handleRequest({ parameter: { payload: JSON.stringify(body) } });
  const r = JSON.parse(res.s || res);
  const ms = Object.keys(w.cnt).reduce((s, k) => s + (COST[k] || 0) * w.cnt[k], 0);
  total += ms;
  out.push({ label, ok: r.ok ? '✓' : '✗ ' + r.error, reads: w.cnt.getValues || 0, lookups: (w.cnt.getSheetByName || 0) + (w.cnt.getSheets || 0),
    tz: w.cnt.getSpreadsheetTimeZone || 0, ms });
});
console.log('action'.padEnd(32), 'ok', 'อ่านชีต', 'หาแท็บ', 'tz', '≈ms');
out.forEach(o => console.log(o.label.padEnd(32), o.ok, String(o.reads).padStart(6), String(o.lookups).padStart(6), String(o.tz).padStart(4), String(o.ms).padStart(6)));
console.log('รวม ≈' + total + ' ms (ค่าประมาณจากต้นทุนต่อครั้งของ Google Sheets — ไว้เทียบก่อน/หลัง)');
}
