// DM ยอดเงินรายวัน (pushOwnerMoneySummary) + Config MONEY_DM_SKIP — รัน: node tests/moneydm.test.js
// ข้อมูลสมมติทั้งหมด ไม่แตะชีต/LINE จริง
const { makeWorld, load, seed } = require('./perf.bench.js');
let passed = 0, failed = 0;
const a = (c, n, x) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.log('  ✗ ' + n + (x !== undefined ? ' — ' + x : '')); } };

function fresh(skip) {
  const w = makeWorld(); const ctx = load(w); seed(w, ctx);
  const d0 = new Date('2026-07-01T00:00:00+07:00');
  const staff = w.sheets.Staff;
  // เจ้าของ/ผู้บริหารสมมติเพิ่ม (Uowner = ปาล์ม มีจาก seed แล้ว)
  staff.appendRow(['Uboss1', 'บอสหนึ่ง', 'หนึ่ง', 'owner', true, d0]);
  staff.appendRow(['Uboss2', 'Boss Two', 'Two', 'manager', true, d0]);
  staff.appendRow(['Uboss3', 'บอสสาม', 'สาม', 'owner', false, d0]); // ปิดใช้งาน → ไม่ได้อยู่แล้ว
  if (skip !== undefined) w.sheets.Config.appendRow(['MONEY_DM_SKIP', skip]);
  const dm = [], group = [];
  ctx.getLineCredentials = () => ({ token: 'fake-token' });
  ctx.linePush = (cred, msgs, to) => { dm.push(to); return { pushed: true }; };
  ctx.notifyGroup = t => { group.push(t); return { pushed: true }; };
  return { w, ctx, dm, group };
}
const record = { Date: '2026-11-12', Total_Sales: 3000, Cash: 1000, Transfer: 1500, Thai_Chuay_Thai: 500,
  Commission_Cups: 20, Commission_Total: 60, Discount_Count: 1, Discount_Total: 20, Note: '' };
const run = t => t.ctx.pushOwnerMoneySummary(record, t.ctx.getConfig());
const same = (x, y) => JSON.stringify(x.slice().sort()) === JSON.stringify(y.slice().sort());

console.log('── ไม่ตั้งค่า = ส่งทุกคนเหมือนเดิม ──');
let t = fresh(); let r = run(t);
a(same(t.dm, ['Uowner', 'Uboss1', 'Uboss2']), 'ไม่มีแถว MONEY_DM_SKIP → ผู้บริหารที่ Active ได้ครบ', JSON.stringify(t.dm));
a(r.sent === 3, 'นับส่งได้ 3');
a(!t.dm.includes('Ubar') && !t.dm.includes('Uboss3'), 'บาริสต้า/คนปิดใช้งานไม่ได้ (เหมือนเดิม)');
t = fresh('   '); run(t);
a(t.dm.length === 3, 'ค่าว่าง/ช่องว่าง = เหมือนไม่ตั้ง');

console.log('── ข้ามคนในรายการ ──');
t = fresh('ปาล์ม'); r = run(t);
a(!t.dm.includes('Uowner'), 'ใส่ชื่อเล่น "ปาล์ม" → ปาล์มไม่ได้ DM');
a(same(t.dm, ['Uboss1', 'Uboss2']), 'คนอื่นยังได้ครบ', JSON.stringify(t.dm));
t = fresh('Uowner'); run(t);
a(same(t.dm, ['Uboss1', 'Uboss2']), 'ใส่ LINE_User_ID ก็ข้ามได้');
t = fresh('บอสหนึ่ง'); run(t);
a(same(t.dm, ['Uowner', 'Uboss2']), 'ใส่ชื่อ (คอลัมน์ Name) ก็ข้ามได้');
t = fresh(' ปาล์ม , two '); run(t);
a(same(t.dm, ['Uboss1']), 'หลายคนคั่นด้วย , / มีช่องว่าง / ตัวพิมพ์เล็กใหญ่ไม่ตรงก็ได้', JSON.stringify(t.dm));
t = fresh('ปาล์ม,หนึ่ง,Two'); r = run(t);
a(t.dm.length === 0 && !r.pushed, 'ข้ามทุกคน → ไม่ส่งเลย ไม่ error', JSON.stringify(r));
t = fresh('ปาล'); run(t);
a(t.dm.includes('Uowner'), 'ต้องตรงทั้งคำ (ชื่อบางส่วนไม่นับ กันข้ามผิดคน)');

console.log('── การ์ดกลุ่ม + แจ้งของใกล้หมด ไม่เกี่ยว ──');
t = fresh('ปาล์ม');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'gas/Code.gs'), 'utf8');
const pdsBody = src.slice(src.indexOf('function pushDailySummary'), src.indexOf('function', src.indexOf('function pushDailySummary') + 10));
a(!/MONEY_DM_SKIP|moneyDmSkipped_/.test(pdsBody), 'pushDailySummary (การ์ดกลุ่ม) ไม่อ่าน MONEY_DM_SKIP');
t.w.sheets.Ingredients.appendRow(['ingX', 'นมสมมติ', 'ลิตร', 5, 1, true, new Date()]);
r = JSON.parse((o => o.s || o)(t.ctx.handleRequest({ parameter: { payload: JSON.stringify({ action: 'markStockChecked', lineUserId: 'Uowner' }) } })));
a(r.ok && r.pushed && t.group.length === 1 && /นมสมมติ/.test(t.group[0]), 'ปาล์มอยู่ในรายการข้าม แต่กดเช็คสต๊อกแล้วแจ้งของใกล้หมดลงกลุ่มเหมือนเดิม', JSON.stringify(r));

console.log('\n' + passed + ' ผ่าน / ' + failed + ' พัง');
process.exit(failed ? 1 : 0);
