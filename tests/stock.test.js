// ขั้นต่ำสต๊อก (ทุกคนแก้ได้) + กดเช็คสต๊อกแล้วคุณเลขาแจ้งของใกล้หมดลงกลุ่ม — รัน: node tests/stock.test.js
const { makeWorld, load, seed } = require('./perf.bench.js');
let passed = 0, failed = 0;
const a = (c, n, x) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.log('  ✗ ' + n + (x !== undefined ? ' — ' + x : '')); } };
function fresh() {
  const w = makeWorld(); const ctx = load(w); seed(w, ctx);
  const sent = []; ctx.notifyGroup = t => { sent.push(t); return { pushed: true }; };
  return { w, ctx, sent };
}
const call = (ctx, body) => { const o = ctx.handleRequest({ parameter: { payload: JSON.stringify(body) } }); return JSON.parse(o.s || o); };
const ing = (ctx, id) => call(ctx, { action: 'getStock', lineUserId: 'Ubar' }).ingredients.find(i => i.Ingredient_ID === id);

console.log('── ตั้ง/แก้ขั้นต่ำ ──');
let { ctx, sent } = fresh();
let r = call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing3', minStock: 12 });
a(r.ok && r.minStock === 12 && r.prev === 2 && r.low === true, 'บาริสต้าแก้ขั้นต่ำได้ (2 → 12) และบอกว่าตอนนี้ใกล้หมด', JSON.stringify(r));
a(ing(ctx, 'ing3').Min_Stock === 12, 'อ่านกลับเห็นขั้นต่ำใหม่');
a(ing(ctx, 'ing3').Current_Stock === 10, 'แก้ขั้นต่ำไม่แตะยอดคงเหลือ');
r = call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing3', minStock: 0 });
a(r.ok && r.minStock === 0 && r.low === false, 'ตั้งเป็น 0 ได้ (= ไม่เตือน เว้นแต่หมดเกลี้ยง)');
r = call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing3', minStock: -1 });
a(!r.ok && /ติดลบ/.test(r.error), 'กันค่าติดลบ', r.error);
r = call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing3', minStock: 'abc' });
a(!r.ok, 'กันค่าที่ไม่ใช่ตัวเลข', r.error);
r = call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing3', minStock: '' });
a(!r.ok, 'กันค่าว่าง (ไม่เผลอเซ็ตเป็น 0)', r.error);
r = call(ctx, { action: 'setIngredientMin', lineUserId: 'Unobody', ingredientId: 'ing3', minStock: 3 });
a(!r.ok, 'คนนอกระบบแก้ไม่ได้', r.error);
r = call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'nope', minStock: 3 });
a(!r.ok && /ไม่พบ/.test(r.error), 'วัตถุดิบไม่มีจริง → error');
a(sent.length === 0, 'แก้ขั้นต่ำเฉยๆ ไม่ส่งอะไรเข้ากลุ่ม');

console.log('── กดเช็คสต๊อก → แจ้งของใกล้หมด ──');
({ ctx, sent } = fresh());
call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing1', minStock: 10 });   // 10 ≤ 10 → ใกล้หมด
call(ctx, { action: 'stockMove', lineUserId: 'Ubar', ingredientId: 'ing2', type: 'count', qty: 0 });   // หมดเกลี้ยง
call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing5', minStock: 9 });     // 10 > 9 → ปกติ
r = call(ctx, { action: 'markStockChecked', lineUserId: 'Ubar' });
a(r.ok && !r.already && r.pushed && r.low.length === 2, 'เช็คครั้งแรกของวัน → แจ้ง 2 รายการ', JSON.stringify(r.low));
a(sent.length === 1, 'ส่งเข้ากลุ่ม 1 ข้อความ');
const msg = sent[0] || '';
a(/วัตถุดิบ1 เหลือ 10 ถุง \(ขั้นต่ำ 10\)/.test(msg), 'บอกชื่อ-คงเหลือ-หน่วย-ขั้นต่ำ', msg);
a(/วัตถุดิบ2 เหลือ 0 ถุง \(ขั้นต่ำ 2\) ❗หมดแล้ว/.test(msg), 'ของหมดมีป้าย ❗หมดแล้ว');
a(!/วัตถุดิบ5/.test(msg), 'ของที่ยังเกินขั้นต่ำไม่ถูกลิสต์');
a(/เช็คสต๊อกโดย เนส/.test(msg) && !/เนสคับ/.test(msg), 'ใช้ชื่อเล่น (เนส) ไม่ใช่ชื่อจริง');
a(!/฿|บาท/.test(msg), 'ไม่มีเรื่องเงินในข้อความกลุ่ม');
r = call(ctx, { action: 'markStockChecked', lineUserId: 'Uowner' });
a(r.ok && r.already && sent.length === 1, 'กดซ้ำวันเดียวกัน → ไม่ส่งซ้ำ (กัน spam)');

({ ctx, sent } = fresh());
r = call(ctx, { action: 'markStockChecked', lineUserId: 'Ubar' });
a(r.ok && r.low.length === 0 && !r.pushed && sent.length === 0, 'ของครบทุกอย่าง → ไม่ส่งอะไรเข้ากลุ่ม');

({ ctx, sent } = fresh());
call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing4', minStock: 50 });
call(ctx, { action: 'disableIngredient', lineUserId: 'Uowner', ingredientId: 'ing4' });
r = call(ctx, { action: 'markStockChecked', lineUserId: 'Ubar' });
a(r.low.length === 0 && sent.length === 0, 'วัตถุดิบที่เลิกใช้แล้วไม่ถูกแจ้ง', JSON.stringify(r.low));

({ ctx, sent } = fresh());
ctx.notifyGroup = () => ({ pushed: false, error: 'no token' });
call(ctx, { action: 'setIngredientMin', lineUserId: 'Ubar', ingredientId: 'ing1', minStock: 20 });
r = call(ctx, { action: 'markStockChecked', lineUserId: 'Ubar' });
a(r.ok && r.pushed === false && r.low.length === 1, 'ส่งไลน์ไม่สำเร็จ → การเช็คยังบันทึก และแอปรู้ว่าส่งไม่ออก');

console.log('\n═══ ผลรวม: ' + passed + ' ผ่าน / ' + failed + ' ไม่ผ่าน ═══');
process.exit(failed ? 1 : 0);
