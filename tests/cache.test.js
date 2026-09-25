// ยืนยันว่า "จำข้อมูลในคำขอ" (_rowsMemo) ไม่ทำให้อ่านได้ค่าเก่าหลังเขียน — ใช้ชีตจำลองตัวเดียวกับ perf.bench
const { makeWorld, load, seed } = require('./perf.bench.js');
let passed = 0, failed = 0;
const a = (c, n, x) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.log('  ✗ ' + n + (x !== undefined ? ' — ' + x : '')); } };
function fresh() { const w = makeWorld(); const ctx = load(w); seed(w, ctx); return { w, ctx }; }
const call = (ctx, body) => { const o = ctx.handleRequest({ parameter: { payload: JSON.stringify(body) } }); return JSON.parse(o.s || o); };

let { w, ctx } = fresh();
let r = call(ctx, { action: 'addMemberCups', lineUserId: 'Ubar', memberId: 'M0050', cups: 1 });
a(r.ok && r.member.paidCups === 17, 'เพิ่มแก้วแล้วผลที่คืนเห็นแถวใหม่ทันที (16 → 17)', JSON.stringify(r).slice(0, 120));
r = call(ctx, { action: 'addMemberCups', lineUserId: 'Ubar', memberId: 'M0050', cups: 3 });
a(r.member.paidCups === 20 && r.newRewards === 1 && r.member.available === 4, 'เพิ่มซ้ำอีกรอบ คำนวณแต้มต่อเนื่องถูก (20 แก้ว ได้ฟรีเพิ่ม 1)', JSON.stringify([r.member.paidCups, r.newRewards, r.member.available]));
const det = call(ctx, { action: 'getMember', lineUserId: 'Ubar', memberId: 'M0050' });
const mine = det.history.find(h => h.canUndo);
r = call(ctx, { action: 'undoMemberLog', lineUserId: 'Ubar', logId: mine.id });
a(r.ok && r.member.paidCups === 17, 'ลบรายการ (deleteRow) แล้วคำนวณใหม่ไม่ใช้ข้อมูลเก่า (20 → 17)', JSON.stringify([r.ok, r.error, r.member && r.member.paidCups]));

r = call(ctx, { action: 'createMember', lineUserId: 'Ubar', name: 'ทดสอบแคช', phone: '0999999991', scentId: 'lavender' });
a(r.ok && r.member.id === 'M0151', 'สมัครใหม่ได้รหัสถัดไปถูก M0151', r.error || r.member.id);
const g = call(ctx, { action: 'getMembers', lineUserId: 'Uowner' });
a(g.candles.find(c => c.id === 'lavender').stock === 74, 'สต๊อกเทียนลดจริงหลังสมัคร (75 → 74)');
r = call(ctx, { action: 'createMember', lineUserId: 'Ubar', name: 'ซ้ำ', phone: '0999999991', scentId: 'lavender' });
a(!r.ok && /เป็นสมาชิกอยู่แล้ว/.test(r.error), 'กันเบอร์ซ้ำทำงาน (อ่านแถวที่เพิ่งเขียน)', r.error);

r = call(ctx, { action: 'stockMove', lineUserId: 'Ubar', ingredientId: 'ing3', type: 'in', qty: 5 });
const st = call(ctx, { action: 'getStock', lineUserId: 'Ubar' });
a(st.ingredients.find(i => i.Ingredient_ID === 'ing3').Current_Stock === 15, 'รับเข้าสต๊อกแล้วอ่านเห็นยอดใหม่ 10 → 15');

// นำเข้ายอดจากอีเมลซ้ำวันเดิม = ลบแถวเก่า + เขียนใหม่ในคำขอเดียว (จุดที่เสี่ยงค่าเก่าที่สุด)
const P = { date: '2026-09-20', totalSales: 4000, cash: 700, creditCard: 0, thaiQR: 3300, thaiChuayThai: 0, discountCount: 0, discountTotal: 0,
  voidCount: 0, voidTotal: 0, guests: 30, bills: 30, drawerDiff: 0, categories: [{ name: 'COFFEE', count: 25, amount: 1500 }] };
const before = w.sheets.DailyClose.getDataRange().getValues().filter(r => ctx.dateKey(r[0]) === '2026-09-20').length;
a(before === 1, 'ก่อนนำเข้า: มียอดวันที่ 20/9 อยู่ 1 แถว');
const res = ctx.saveImportedClose(P);
const rows = w.sheets.DailyClose.getDataRange().getValues().filter(r => ctx.dateKey(r[0]) === '2026-09-20');
a(res === 'imported' && rows.length === 1 && rows[0][1] === 4000, 'นำเข้าซ้ำ = ทับเหลือแถวเดียวยอดใหม่ ไม่เบิ้ล', JSON.stringify([res, rows.length, rows[0] && rows[0][1]]));
const sales = w.sheets.SalesByCategory.getDataRange().getValues().filter(r => r[0] === '2026-09-20');
a(sales.length === 10 || sales.length === 11, 'แถวหมวดขายของวันนั้นถูกล้างแล้วเขียนชุดใหม่ ไม่ซ้อน', sales.length);
a(ctx.saveImportedClose(P) === 'unchanged', 'นำเข้าซ้ำยอดเดิม → "ไม่เปลี่ยน" (อ่านเห็นแถวที่เพิ่งเขียน)');

console.log('\n═══ ผลรวม: ' + passed + ' ผ่าน / ' + failed + ' ไม่ผ่าน ═══');
process.exit(failed ? 1 : 0);
