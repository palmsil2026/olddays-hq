// 👆 วันเข้างานจากสแกนนิ้ว (เงินเดือนโรงน้ำ) → เข้ากะ + ค่าคอม — รัน: node tests/scansync.test.js
const { makeWorld, load, seed } = require('./perf.bench.js');
let passed = 0, failed = 0;
const a = (c, n, x) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.log('  ✗ ' + n + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); } };
const call = (ctx, body) => { const o = ctx.handleRequest({ parameter: { payload: JSON.stringify(body) } }); return JSON.parse(o.s || o); };

function fresh(scans) {
  const w = makeWorld(); const ctx = load(w); seed(w, ctx);
  // ร้านเปิด 1–6 ก.ย. (seed มี 90 วันตั้งแต่ 1 ก.ค. + ค่าคอมของเนสทุกวัน) — ล้างค่าคอมที่ seed ไว้ให้เห็นผลชัด
  const pay = w.sheets.CommissionPay; const head = pay.getDataRange().getValues()[0];
  w.mkSheet('CommissionPay', [head]);
  w.sheets.Config.appendRow(['PLANT_SHEET_ID', 'plant']);
  w.sheets.Config.appendRow(['SHIFT_SYNC_FROM', '2026-09-01']);
  const plantRows = [['Scan_ID', 'Period_ID', 'ชื่อในไฟล์สแกน', 'รหัสสแกน', 'วันที่', 'เข้า(นาที)', 'ออก(นาที)']].concat(scans);
  const plant = { getSheetByName: n => n === 'PayrollScans' ? { getDataRange: () => ({ getValues: () => plantRows.map(r => r.slice()) }) } : null };
  ctx.SpreadsheetApp.openById = id => { if (id !== 'plant') throw new Error('wrong id ' + id); return plant; };
  return { w, ctx };
}
const N = 'กัณฑ์อเนก/เนส';
const scans = [
  ['s1', 'P', N, '', '2026-09-01', 440, ''],      // มา (เข้าอย่างเดียว)
  ['s2', 'P', N, '', '2026-09-02', '', ''],       // แถวว่าง = ไม่มา
  ['s3', 'P', N, '', '2026-09-03', 450, 1020],    // มา
  ['s4', 'P', 'คนอื่น/อื่น', '', '2026-09-04', 450, 1020], // คนที่ไม่อยู่ใน map ไม่สน
];
let { w, ctx } = fresh(scans);
const day = d => w.sheets.DailyClose.getDataRange().getValues().find(r => ctx.dateKey(r[0]) === d);
const pays = () => w.sheets.CommissionPay.getDataRange().getValues().slice(1);
let r = call(ctx, { action: 'syncShiftsFromScans', lineUserId: 'Uowner' });
a(r.ok, 'ผู้บริหารกดดึงได้', r);
a(day('2026-09-01')[16] === 'เนสคับ' && day('2026-09-03')[16] === 'เนสคับ', 'วันที่มีสแกน → ใส่เนสเข้ากะ');
a(day('2026-09-02')[16] === '', 'แถวสแกนว่าง = ไม่มา → ไม่ใส่เข้ากะ');
a(day('2026-09-05')[16] === '', 'วันที่ไฟล์สแกนยังไม่ครอบ → ไม่แตะ');
a(pays().length === 2 && pays().every(p => p[1] === 'เนสคับ' && p[3] === 'unpaid' && p[2] === 60), 'ใส่ค่าคอม (ยังไม่จ่าย) เฉพาะ 2 วันที่มีสแกน', pays());
a(r.shifts === 2 && r.pays === 2 && r.amount === 120 && r.lastScanDate === '2026-09-03', 'สรุปผลถูก', r);
r = call(ctx, { action: 'syncShiftsFromScans', lineUserId: 'Uowner' });
a(r.ok && r.shifts === 0 && r.pays === 0 && pays().length === 2, 'กดซ้ำไม่เพิ่มซ้ำ', r);
r = call(ctx, { action: 'syncShiftsFromScans', lineUserId: 'Ubar' });
a(!r.ok, 'บาริสต้ากดไม่ได้', r.error);

// มีคนอื่นเข้ากะด้วย (ผู้จัดการเลือกเอง) → ชื่อนั้นคงไว้ · กะมี 2 คน → ไม่ตัดสินค่าคอมให้
({ w, ctx } = fresh(scans));
call(ctx, { action: 'saveShift', lineUserId: 'Uowner', date: '2026-09-01', names: 'พนักงาน1' });
call(ctx, { action: 'saveShift', lineUserId: 'Uowner', date: '2026-09-02', names: 'เนสคับ' });
r = call(ctx, { action: 'syncShiftsFromScans', lineUserId: 'Uowner' });
a(day('2026-09-01')[16] === 'พนักงาน1, เนสคับ', 'ชื่อที่ผู้จัดการเลือกไว้คงอยู่ + เติมเนส', day('2026-09-01')[16]);
a(day('2026-09-02')[16] === '', 'เลือกเนสไว้แต่ไม่มีสแกน → เอาออก');
a(!pays().some(p => ctx.dateKey(p[0]) === '2026-09-01'), 'กะ 2 คน → ไม่ใส่ค่าคอมเอง (ให้ผู้จัดการเลือก)');

// ค่าคอมที่ระบุไว้แล้วไม่แตะ — ถ้าขัดกับสแกนแจ้งกลับ
({ w, ctx } = fresh(scans));
call(ctx, { action: 'assignCommission', lineUserId: 'Uowner', date: '2026-09-02', staffName: 'เนสคับ' });
r = call(ctx, { action: 'syncShiftsFromScans', lineUserId: 'Uowner' });
a(pays().filter(p => ctx.dateKey(p[0]) === '2026-09-02').length === 1, 'แถวค่าคอมเดิมไม่ถูกลบ/แก้');
a(r.conflicts.length === 1 && /2026-09-02/.test(r.conflicts[0]), 'แจ้งว่าวันนั้นไม่มีสแกนแต่มีค่าคอม', r.conflicts);

// ก่อน SHIFT_SYNC_FROM ไม่แตะ
({ w, ctx } = fresh([['x', 'P', N, '', '2026-08-30', 440, '']]));
r = call(ctx, { action: 'syncShiftsFromScans', lineUserId: 'Uowner' });
a(r.shifts === 0 && r.pays === 0, 'วันก่อน SHIFT_SYNC_FROM ไม่แตะ', r);

console.log('\n═══ ผลรวม: ' + passed + ' ผ่าน / ' + failed + ' ไม่ผ่าน ═══');
process.exit(failed ? 1 : 0);
