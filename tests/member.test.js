const fs = require('fs'), vm = require('vm');
let passed = 0, failed = 0;
const a = (c, n, x) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.log('  ✗ ' + n + (x !== undefined ? ' — ' + x : '')); } };
const throws = (fn, re, n) => { try { fn(); a(false, n, 'ไม่ error'); } catch (e) { a(re.test(e.message), n, e.message); } };

const ctx = { console, Object, JSON, Math, Date, Array, String, Number, parseFloat, isNaN, Logger: { log() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSpreadsheetTimeZone: () => 'Asia/Bangkok' }) },
  Utilities: { formatDate: (d) => { const t = new Date(d.getTime() + 7 * 3600 * 1000);
    return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0'); } } };
ctx.globalThis = ctx; vm.createContext(ctx);
const path = require('path');
const ROOT = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas/Code.gs'), 'utf8'), ctx);

// ── ชีตจำลอง ──
const DB = {};
function reset() {
  Object.keys(ctx.HEADERS).forEach(k => DB[k] = []);
  ctx.SEED_CANDLES.forEach(c => DB.Candles.push({ Scent_ID: c[0], Name: c[1], Emoji: c[2], Stock: c[3], Min_Stock: c[4], Sort_Order: c[5], Active: true }));
}
ctx.readRows = n => (DB[n] || []).map((r, i) => Object.assign({}, r, { _rowIndex: i + 2 }));
ctx.appendRowObj = (n, o) => { const r = {}; ctx.HEADERS[n].forEach(h => r[h] = o[h] !== undefined ? o[h] : ''); DB[n].push(r); };
ctx.updateRowObj = (n, idx, o) => { a(o._rowIndex === undefined, 'ไม่มี _rowIndex หลุดลงชีต (' + n + ')'); DB[n][idx - 2] = Object.assign({}, o); };
ctx.getSheet = n => ({ deleteRow: idx => DB[n].splice(idx - 2, 1) });
ctx.getConfig = () => ({});
const STAFF = { barista: { Name: 'เนสคับ', Role: 'barista' }, owner: { Name: 'ปาล์ม', Role: 'owner' }, meena: { Name: 'มีนา', Role: 'barista' } };
ctx.requireStaff = req => STAFF[req.as || 'barista'];
ctx.requireRole = (req, min) => { const s = STAFF[req.as || 'barista']; if (ctx.ROLE_LEVEL[s.Role] < ctx.ROLE_LEVEL[min]) throw new Error('สิทธิ์ไม่เพียงพอ'); return s; };
const today = ctx.todayKey();
const addD = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

console.log('\n── วันที่ ──');
a(ctx.addMonthsISO('2026-09-25', 6) === '2027-03-25', '25 ก.ย. 69 + 6 เดือน = 25 มี.ค. 70');
a(ctx.addMonthsISO('2026-08-31', 6) === '2027-02-28', '31 ส.ค. + 6 = 28 ก.พ. (ตัดปลายเดือน)', ctx.addMonthsISO('2026-08-31', 6));
a(ctx.addMonthsISO('2027-08-31', 6) === '2028-02-29', 'ปีอธิกสุรทิน → 29 ก.พ.');
a(ctx.addMonthsISO('2026-12-15', 6) === '2027-06-15', 'ข้ามปี');
a(ctx.daysBetweenISO('2026-09-25', '2027-03-25') === 181, 'นับวันถึงหมดอายุ = 181');

console.log('\n── อ่านโปรสมาชิกจากอีเมลจริง 23/9 ──');
const email = `รายงานปิดรอบ ประจำวันที่ 23/09/2026
End Drawer Time :
23/09/2026 - 16:48
| Sales by Category |
| COFFEE | 9 | 500.00 |
| Sub Total | 31 | 1,835.00 |
| Discount | -190.50 |
| Total Sales | 1,644.50 |

| Discount & Promotions |
| โปรโมชั่นสำหรับสมาชิกซื้อ5แก้ว ฟรี1แก้ว | 1 | -55.00 |
| Sub.TTL DC.(%) | 5 | -135.50 |

| Payments |
| By Cash | 5 | 635.00 |
| By Thai QR | 11 | 1,009.50 |`;
const P = ctx.parseDrawerReport(email);
a(P.discountTotal === 190.5, 'ส่วนลดรวม 190.50 ตรงกับบรรทัด Discount ในอีเมล (เดิมได้ 135.50)', P.discountTotal);
a(P.discountCount === 6, 'ส่วนลด 6 ครั้ง (1+5)', P.discountCount);
a(P.memberFreeCups === 1 && P.memberFreeValue === 55, 'แยกโปรสมาชิกได้ 1 แก้ว / 55 บาท');
a(P.cash === 635 && P.totalSales === 1644.5, 'ช่องอื่นไม่กระทบ');
const plain = email.replace(/\|/g, ' ');
const P2 = ctx.parseDrawerReport(plain);
a(P2.memberFreeCups === 1 && P2.discountTotal === 190.5, 'รูปแบบไม่มี | ก็อ่านได้ (ตัวเลขในชื่อโปร 5/1 ไม่ปน)', JSON.stringify([P2.memberFreeCups, P2.discountTotal]));
const old = 'รายงานปิดรอบ ประจำวันที่ 17/08/2026\n| Total Sales | 2,963.75 |\n| Sub.TTL DC.(%) | 9 | -271.25 |\n| Sub.TTL DC.(Amt) | 11 | -650.00 |';
const P3 = ctx.parseDrawerReport(old);
a(P3.discountTotal === 921.25 && P3.memberFreeCups === 0, 'อีเมลรูปแบบเก่า (ไม่มีหัวหมวด) ยังรวมส่วนลดถูก 921.25');

const emailCats = email.replace('| COFFEE | 9 | 500.00 |', '| COFFEE | 9 | 500.00 |\n| PREMIUM | 1 | 80.00 |\n| BAKERY | 6 | 215.00 |');
const PC = ctx.parseDrawerReport(emailCats).categories;
a(PC.length === 3 && PC[0].name === 'COFFEE' && PC[0].count === 9 && PC[2].count === 6, 'หมวดสินค้ายังแกะถูก (ย้อนหลัง)', JSON.stringify(PC));
a(ctx.calcCommissionCups({ coffee: 9, bakery: 6 }, [{ Category_ID: 'coffee', Count_Commission: true }, { Category_ID: 'bakery', Count_Commission: 'FALSE' }]) === 9, 'แก้วค่าคอมไม่นับเบเกอรี่ (ย้อนหลัง)');

console.log('\n── การ์ดกลุ่ม: บอกแก้วฟรีสมาชิก ไม่มีเงิน ──');
const flex = JSON.stringify(ctx.buildDailyFlex({ Date: '2026-09-23', Category_Counts_JSON: '{"coffee":9}', Premium_Counts_JSON: '{}',
  Note: '📩 ดึงจากอีเมล POS | ลูกค้า 16 คน / 16 บิล | สมาชิกแลกฟรี 1 แก้ว', Submitted_By: 'FoodStory (อัตโนมัติ)' },
  [{ Category_ID: 'coffee', Name: 'Coffee', Unit: 'แก้ว', Count_Commission: true }], [], {}));
a(flex.includes('🎁 สมาชิกแลกฟรี') && flex.includes('1 แก้ว') && !/บาท|฿/.test(flex), 'การ์ดมีบรรทัดแก้วฟรีสมาชิก และไม่มีตัวเงิน');

console.log('\n── สมัครสมาชิก ──');
reset();
let r = ctx.actionCreateMember({ name: 'แพรวา สุขใจ', nickname: 'แพร', phone: '081-234-5678', scentId: 'lavender', payMethod: 'cash' });
a(r.member.id === 'M0001', 'รหัสสมาชิก M0001');
a(r.member.expiresAt === ctx.addMonthsISO(today, 6), 'หมดอายุ = วันนี้ + 6 เดือน');
a(DB.Candles.find(c => c.Scent_ID === 'lavender').Stock === 74, 'ตัดสต๊อกเทียนลาเวนเดอร์ 75 → 74');
a(DB.CandleLog.length === 1 && DB.CandleLog[0].Member_ID === 'M0001' && DB.CandleLog[0].Type === 'give', 'จดสมุดเทียน: แจกให้ M0001');
a(DB.Members[0].Phone === '0812345678' && DB.Members[0].Fee === 100, 'เก็บเบอร์แบบตัวเลขล้วน + ค่าสมาชิก 100');
a(DB.MemberLog[0].Type === 'join' && DB.MemberLog[0].Amount === 100, 'สมุดสมาชิกมีรายการสมัคร 100 ฿');
throws(() => ctx.actionCreateMember({ name: 'ซ้ำ', phone: '0812345678', scentId: 'coffee' }), /เป็นสมาชิกอยู่แล้ว/, 'เบอร์ซ้ำ → บล็อก');
a(DB.Candles.find(c => c.Scent_ID === 'coffee').Stock === 150, 'สมัครไม่สำเร็จ = เทียนไม่ถูกตัดฟรี ๆ');
throws(() => ctx.actionCreateMember({ name: '' }), /กรอกชื่อ/, 'ไม่มีชื่อ → บล็อก');
throws(() => ctx.actionCreateMember({ name: 'อนาคต', joinedAt: addD(today, 3) }), /อนาคต/, 'วันที่สมัครในอนาคต → บล็อก');
DB.Candles.find(c => c.Scent_ID === 'mango').Stock = 0;
throws(() => ctx.actionCreateMember({ name: 'มะม่วง', scentId: 'mango' }), /หมดสต๊อก/, 'กลิ่นหมด → บอกให้เลือกกลิ่นอื่น');
a(DB.Members.length === 1, 'ไม่มีสมาชิกครึ่งๆ กลางๆ หลุดเข้าชีต');

console.log('\n── สะสมแก้ว / แลกฟรี ──');
r = ctx.actionAddMemberCups({ memberId: 'M0001', cups: 3 });
a(r.member.progress === 3 && r.member.available === 0 && r.newRewards === 0, 'ซื้อ 3 แก้ว → 3/5 ยังไม่ได้ฟรี');
throws(() => ctx.actionRedeemMember({ memberId: 'M0001' }), /ยังไม่มีแก้วฟรี/, 'แต้มไม่ครบแล้วกดแลก → บล็อก');
r = ctx.actionAddMemberCups({ memberId: 'M0001', cups: 4 });
a(r.newRewards === 1 && r.member.available === 1 && r.member.progress === 2, 'ซื้อเพิ่ม 4 (รวม 7) → ได้ฟรี 1 เหลือ 2/5');
r = ctx.actionAddMemberCups({ memberId: 'M0001', cups: 8 });
a(r.newRewards === 2 && r.member.available === 3 && r.member.progress === 0, 'ซื้อทีเดียว 8 (รวม 15) → ได้ฟรีเพิ่ม 2 รวม 3');
r = ctx.actionRedeemMember({ memberId: 'M0001' });
a(r.member.available === 2 && r.member.redeemed === 1 && r.member.paidCups === 15, 'แลก 1 → เหลือฟรี 2 · แก้วฟรีไม่นับเป็นแต้ม');
a(r.member.visits === 4, 'นับการมาร้าน 4 ครั้ง (ซื้อ 3 + แลก 1)');
throws(() => ctx.actionAddMemberCups({ memberId: 'M0001', cups: 0 }), /1–30/, 'จำนวนแก้ว 0 → บล็อก');

console.log('\n── ยกเลิกรายการที่กดผิด ──');
const buyLog = DB.MemberLog.filter(l => l.Type === 'buy').pop();
r = ctx.actionUndoMemberLog({ logId: buyLog.Log_ID });
a(r.member.paidCups === 7 && r.member.available === 0 && r.member.redeemed === 1, 'ลบ +8 ที่กดผิด → แต้มคำนวณใหม่ถูกต้อง (7 แก้ว ฟรีที่ได้ 1 แลกไปแล้ว)', JSON.stringify([r.member.paidCups, r.member.available]));
const joinLog = DB.MemberLog.find(l => l.Type === 'join');
throws(() => ctx.actionUndoMemberLog({ logId: joinLog.Log_ID, as: 'owner' }), /ยกเลิกตรงนี้ไม่ได้/, 'ลบรายการสมัคร → บล็อก (ให้ใช้ยกเลิกสมาชิกแทน)');
const b2 = DB.MemberLog.filter(l => l.Type === 'buy').pop();
throws(() => ctx.actionUndoMemberLog({ logId: b2.Log_ID, as: 'meena' }), /เฉพาะรายการที่คุณบันทึกเอง/, 'พนักงานอื่นลบรายการของเนส → บล็อก');
ctx.actionUndoMemberLog({ logId: b2.Log_ID, as: 'owner' });
a(true, 'เจ้าของลบรายการของใครก็ได้');

console.log('\n── หมดอายุ / ต่ออายุ ──');
DB.Members[0].Expires_At = addD(today, -1);
throws(() => ctx.actionAddMemberCups({ memberId: 'M0001', cups: 1 }), /หมดอายุแล้ว/, 'หมดอายุแล้วสะสม → บล็อก');
throws(() => ctx.actionRedeemMember({ memberId: 'M0001' }), /หมดอายุ/, 'หมดอายุแล้วแลก → บล็อก');
r = ctx.actionRenewMember({ memberId: 'M0001', scentId: 'coffee', payMethod: 'transfer' });
a(r.member.expiresAt === ctx.addMonthsISO(today, 6) && r.member.status === 'active', 'ต่ออายุหลังหมด → นับ 6 เดือนใหม่จากวันนี้');
a(r.member.paidCups === 3, 'ต่ออายุแล้วแต้มเดิมยังอยู่');
a(DB.Candles.find(c => c.Scent_ID === 'coffee').Stock === 149, 'ต่ออายุแจกเทียนกาแฟ 150 → 149');
const exp1 = r.member.expiresAt;
r = ctx.actionRenewMember({ memberId: 'M0001', scentId: 'none', payMethod: 'cash' });
a(r.member.expiresAt === ctx.addMonthsISO(exp1, 6), 'ต่อก่อนหมด → ต่อจากวันหมดอายุเดิม ไม่เสียวันที่เหลือ');
a(DB.Candles.find(c => c.Scent_ID === 'coffee').Stock === 149, 'เลือก "ไม่รับเทียน" = ไม่ตัดสต๊อก');
DB.Members[0].Expires_At = addD(today, 20);
a(ctx.actionGetMembers({}).members[0].status === 'expiring', 'เหลือ 20 วัน → สถานะ "ใกล้หมดอายุ"');

console.log('\n── ผู้บริหารแก้ไข / ยกเลิก / สิทธิ์ ──');
throws(() => ctx.actionUpdateMember({ memberId: 'M0001', note: 'x' }), /สิทธิ์ไม่เพียงพอ/, 'บาริสต้าแก้ข้อมูลสมาชิก → บล็อก');
r = ctx.actionUpdateMember({ as: 'owner', memberId: 'M0001', adjustCups: 2, adjustNote: 'ลืมบันทึก' });
a(r.member.paidCups === 5 && r.member.earned === 1 && r.member.available === 0, 'ปรับแต้ม +2 → ครบ 5 ได้ฟรี 1 (แลกไปแล้ว 1 = คงเหลือ 0)', JSON.stringify([r.member.paidCups, r.member.earned, r.member.available]));
r = ctx.actionUpdateMember({ as: 'owner', memberId: 'M0001', status: 'cancelled' });
a(r.member.status === 'cancelled', 'ยกเลิกสมาชิกได้');
throws(() => ctx.actionAddMemberCups({ memberId: 'M0001', cups: 1 }), /ถูกยกเลิก/, 'สมาชิกถูกยกเลิก → สะสมไม่ได้');
ctx.actionUpdateMember({ as: 'owner', memberId: 'M0001', status: 'active' });

console.log('\n── หน้ารวม: สถิติ + ซ่อนเงินจากบาริสต้า ──');
let g = ctx.actionGetMembers({});
a(g.stats.feesThisMonth === undefined && g.members.every(m => m.fees === undefined), 'บาริสต้าไม่เห็นยอดค่าสมาชิก');
g = ctx.actionGetMembers({ as: 'owner' });
a(g.stats.feesThisMonth === 300, 'เจ้าของเห็นค่าสมาชิกเดือนนี้ 300 ฿ (สมัคร 100 + ต่อ 2 ครั้ง)', g.stats.feesThisMonth);
a(g.candles.length === 5 && g.candles[0].name === 'กลิ่นกาแฟ', 'เทียนครบ 5 กลิ่นเรียงตามลำดับ');
a(g.rules.fee === 100 && g.rules.months === 6 && g.rules.stamps === 5, 'กติกาค่าเริ่มต้นถูก (100฿ / 6 เดือน / 5 แก้ว)');
const det = ctx.actionGetMember({ memberId: 'M0001' });
a(det.history.length > 0 && det.history.every(h => h.amount === undefined), 'ประวัติของบาริสต้าไม่มียอดเงิน');

console.log('\n── สต๊อกเทียน ──');
let c = ctx.actionAdjustCandle({ scentId: 'mango', type: 'in', qty: 50 });
a(c.candles.find(x => x.id === 'mango').stock === 50, 'รับเทียนมะม่วงเข้า 50');
throws(() => ctx.actionAdjustCandle({ scentId: 'mango', type: 'out', qty: 60 }), /เกินสต๊อก/, 'ตัดออกเกินสต๊อก → บล็อก');
c = ctx.actionAdjustCandle({ scentId: 'mango', type: 'count', qty: 42 });
a(c.candles.find(x => x.id === 'mango').stock === 42, 'นับสต๊อกทับ = 42');

console.log('\n── นำเข้าจาก LMWN ──');
const imp = ctx.actionImportMembers({ as: 'owner', rows: [
  { name: 'ลูกค้า A', phone: '0899999999', joinedAt: '2026-06-01', cups: 4 },
  { name: 'ซ้ำเบอร์', phone: '0812345678' },
  { name: 'ลูกค้า B', phone: '0888888888', joinedAt: '2026-03-01' },
] });
a(imp.added === 2 && imp.skipped.length === 1, 'นำเข้า 2 คน ข้ามเบอร์ซ้ำ 1', JSON.stringify(imp));
g = ctx.actionGetMembers({ as: 'owner' });
const A = g.members.find(m => m.name === 'ลูกค้า A'), B = g.members.find(m => m.name === 'ลูกค้า B');
a(A.expiresAt === '2026-12-01' && A.progress === 4, 'A: หมดอายุ 1 ธ.ค. 69 + แก้วยกมา 4/5');
a(B.status === 'expired', 'B สมัคร 1 มี.ค. → หมดอายุแล้ว (1 ก.ย.)');
a(A.id === 'M0002' && B.id === 'M0003', 'รหัสต่อเนื่อง M0002, M0003');
a(DB.CandleLog.every(l => l.Member_ID !== 'M0002'), 'นำเข้าไม่แจกเทียน/ไม่ตัดสต๊อก');
throws(() => ctx.actionImportMembers({ rows: [{ name: 'x' }] }), /สิทธิ์ไม่เพียงพอ/, 'บาริสต้านำเข้า → บล็อก');

console.log('\n── ฝั่งแอป: แกะข้อความที่วางจาก Excel ──');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = scripts[scripts.length - 1];
const fn = n => { const m = src.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n}', 'm')); if (!m) throw new Error('missing ' + n); return m[0]; };
const cc = { console, Math, JSON, String, Date, Number }; vm.createContext(cc);
['pad2', 'parseMemberImport', 'addMonthsISO'].forEach(n => vm.runInContext(fn(n), cc));
const rows = cc.parseMemberImport('ชื่อ\tเบอร์\tวันที่สมัคร\tแก้ว\nสมชาย ใจดี\t081-234-5678\t15/09/2569\t3\n+66 89 111 2222, มานี มีนา, 2026-08-01\n\nวิชัย|15/9/69');
a(rows.length === 3, 'อ่านได้ 3 คน ข้ามหัวตาราง+บรรทัดว่าง', rows.length);
a(rows[0].name === 'สมชาย ใจดี' && rows[0].phone === '0812345678' && rows[0].joinedAt === '2026-09-15' && rows[0].cups === 3, 'แถวมาตรฐาน + ปี พ.ศ. 2569 → 2026', JSON.stringify(rows[0]));
a(rows[1].name === 'มานี มีนา' && rows[1].phone === '0891112222' && rows[1].joinedAt === '2026-08-01', 'ลำดับคอลัมน์สลับ + เบอร์ +66 → 0', JSON.stringify(rows[1]));
a(rows[2].joinedAt === '2026-09-15' && rows[2].phone === '', 'ปี 2 หลัก 69 → 2026 · ไม่มีเบอร์ก็ได้', JSON.stringify(rows[2]));
['2026-08-31', '2027-08-31', '2026-09-25', '2026-12-15'].forEach(d =>
  a(cc.addMonthsISO(d, 6) === ctx.addMonthsISO(d, 6), 'วันหมดอายุในแอป = GAS (' + d + ')'));

console.log('\n═══ ผลรวม: ' + passed + ' ผ่าน / ' + failed + ' ไม่ผ่าน ═══');
process.exit(failed ? 1 : 0);
