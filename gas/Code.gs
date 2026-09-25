/**
 * ═══════════════════════════════════════════════════════════════
 *  Old Days ☕ — ระบบหลังบ้านร้านกาแฟ (Google Apps Script)
 *
 *  ทำหน้าที่:
 *   - API สำหรับ LIFF app (olddays/index.html)
 *   - เก็บข้อมูลทั้งหมดลง Google Sheets (สร้างแท็บให้อัตโนมัติ)
 *   - คำนวณค่าคอมเครื่องดื่ม (ค่าเริ่มต้น 3 บาท/แก้ว)
 *   - ส่งสรุปยอดรายวันเป็น Flex Message เข้ากลุ่ม LINE "Old Days"
 *
 *  วิธีติดตั้ง: ดู olddays/README.md
 * ═══════════════════════════════════════════════════════════════
 */

// ── ค่าคงที่ ──────────────────────────────────────────────────
var SHEET_TABS = {
  STAFF: 'Staff',
  CATEGORIES: 'Categories',
  PREMIUM: 'PremiumItems',
  MENU: 'MenuItems',
  DAILY: 'DailyClose',
  SALES_ROWS: 'SalesByCategory',
  COMMISSION: 'Commission',
  INGREDIENTS: 'Ingredients',
  STOCK_MOVES: 'StockMoves',
  PURCHASES: 'Purchases',
  CONFIG: 'Config',
  IMPORT_LOG: 'ImportLog',
  STAFF_PAY: 'StaffPay',
  COM_PAY: 'CommissionPay',
  STOCK_CHECKS: 'StockChecks',
  MEMBERS: 'Members',
  MEMBER_LOG: 'MemberLog',
  CANDLES: 'Candles',
  CANDLE_LOG: 'CandleLog',
};

// ชื่อผู้ส่งของ record ที่ดึงจากอีเมล POS อัตโนมัติ — แอปใช้แยกว่ายังรอคนยืนยัน
var AUTO_SUBMITTER = 'FoodStory (อัตโนมัติ)';

// groupId กลุ่ม Old Days ฝังไว้ในโค้ดเลย — เคยหายจากแท็บ Config จนการ์ดไม่เข้ากลุ่มทั้งวัน
// (ค่าในแท็บ Config ยัง override ได้ถ้าอยากเปลี่ยนกลุ่ม)
var DEFAULT_LINE_GROUP_ID = 'Ca2b030f987abfc615db5533ebb7495f4';

var HEADERS = {
  Staff: ['LINE_User_ID', 'Name', 'Nickname', 'Role', 'Active', 'Created_At'],
  Categories: ['Category_ID', 'Name', 'Emoji', 'Unit', 'Count_Commission', 'Sort_Order', 'Active'],
  PremiumItems: ['Item_ID', 'Name', 'Emoji', 'Unit', 'Sort_Order', 'Active'],
  MenuItems: ['Menu_ID', 'Category_ID', 'Name', 'Price', 'Active', 'Note'],
  DailyClose: ['Date', 'Total_Sales', 'Cash', 'Thai_Chuay_Thai', 'Transfer', 'Cash_Over',
    'Channel_Diff', 'Discount_Count', 'Discount_Total', 'Void_Count', 'Void_Total',
    'Category_Counts_JSON', 'Premium_Counts_JSON', 'Commission_Cups', 'Commission_Rate',
    'Commission_Total', 'Staff_On_Shift', 'Note', 'Submitted_By', 'Submitted_At'],
  SalesByCategory: ['Date', 'Type', 'Name', 'Count', 'Unit'],
  Commission: ['Date', 'Staff_Name', 'Cups_Share', 'Amount', 'Note'],
  Ingredients: ['Ingredient_ID', 'Name', 'Unit', 'Min_Stock', 'Current_Stock', 'Active', 'Updated_At'],
  StockMoves: ['Timestamp', 'Ingredient_ID', 'Ingredient_Name', 'Type', 'Qty', 'Balance_After', 'Note', 'By'],
  Purchases: ['Purchase_ID', 'Requested_At', 'Requested_By', 'Items', 'Est_Cost', 'Status',
    'Approved_By', 'Approved_At', 'Actual_Cost', 'Purchased_At', 'Note'],
  Config: ['Key', 'Value'],
  ImportLog: ['Message_ID', 'Date', 'Imported_At', 'Status'],
  StaffPay: ['Staff_Name', 'PromptPay', 'Note'],
  CommissionPay: ['Date', 'Staff_Name', 'Amount', 'Status', 'Paid_At', 'Paid_By', 'Note'],
  StockChecks: ['Date', 'Checked_By', 'Checked_At', 'Note'],
  // 🎫 ระบบสมาชิก (ซื้อครบ 5 แก้ว ฟรี 1 · ค่าสมาชิก 100 ฿ + เทียนหอม · อายุ 6 เดือน)
  Members: ['Member_ID', 'Name', 'Nickname', 'Phone', 'Joined_At', 'Expires_At', 'Candle_Scent',
    'Fee', 'Pay_Method', 'Source', 'LMWN_Ref', 'Status', 'Note', 'Created_By', 'Created_At'],
  MemberLog: ['Log_ID', 'Timestamp', 'Member_ID', 'Type', 'Cups', 'Amount', 'Scent_ID', 'Note', 'By'],
  Candles: ['Scent_ID', 'Name', 'Emoji', 'Stock', 'Min_Stock', 'Sort_Order', 'Active'],
  CandleLog: ['Timestamp', 'Scent_ID', 'Scent_Name', 'Type', 'Qty', 'Balance_After', 'Member_ID', 'Note', 'By'],
};

// เทียนหอมแถมสมาชิก — [id, ชื่อ, emoji, สต๊อกเริ่มต้น, เตือนเมื่อเหลือ ≤, ลำดับ]
var SEED_CANDLES = [
  ['coffee', 'กลิ่นกาแฟ', '☕', 150, 15, 1],
  ['jasmine-tea', 'กลิ่นชามะลิ', '🌼', 100, 10, 2],
  ['lavender', 'กลิ่นลาเวนเดอร์', '💜', 75, 10, 3],
  ['mango', 'กลิ่นมะม่วง', '🥭', 100, 10, 4],
  ['strawberry', 'กลิ่นสตรอเบอรี่', '🍓', 75, 10, 5],
];

var SEED_CATEGORIES = [
  // [id, name, emoji, unit, countCommission, sort]
  ['signature', 'Signature', '🌟', 'แก้ว', true, 1],
  ['coffee', 'Coffee', '☕', 'แก้ว', true, 2],
  ['premium-coffee', 'Premium Coffee', '✨', 'แก้ว', true, 3],
  ['non-coffee', 'Non Coffee', '🥤', 'แก้ว', true, 4],
  ['matcha', 'Matcha', '🍵', 'แก้ว', true, 5],
  ['soft-cream', 'Soft Cream', '🍦', 'แก้ว', true, 6],
  ['dirty', 'Dirty', '🥛', 'แก้ว', true, 7],
  ['soda', 'Soda', '🫧', 'แก้ว', true, 8],
  ['beer', 'Beer', '🍺', 'ขวด', false, 9],
  ['bakery', 'Bakery', '🍰', 'รายการ', false, 10],
];

var SEED_PREMIUM = [
  ['blueberry-shake', 'BLUEBERRY MILK SHAKE', '🫐', 'แก้ว', 1],
  ['eth-strawberry', 'ETHIOPIA STRAWBERRY BOMBO', '🍓', 'แก้ว', 2],
  ['eth-natural', 'ETHIOPIA NATURAL', '🍒', 'แก้ว', 3],
  ['brazil-santos', 'BRAZIL SANTOS', '🇧🇷', 'แก้ว', 4],
  ['premium-beans', 'เมล็ดกาแฟพรีเมียม (ถุง)', '🌱', 'ถุง', 5],
  ['gummy-berries', 'Gummy berries', '🍬', 'ชิ้น', 6],
];

var SEED_INGREDIENTS = [
  // [id, name, unit, minStock, currentStock]
  ['milk', 'นมสด', 'ลัง', 2, 0],
  ['beans-house', 'เมล็ดกาแฟ House Blend', 'กก.', 3, 0],
  ['matcha-powder', 'ผงมัทฉะ', 'ถุง', 1, 0],
  ['cup-hot', 'แก้วร้อน', 'แพ็ค', 2, 0],
  ['cup-cold', 'แก้วเย็น + ฝา', 'แพ็ค', 2, 0],
  ['straw', 'หลอด', 'แพ็ค', 1, 0],
];

var SEED_CONFIG = [
  ['SHOP_NAME', 'Old Days'],
  ['COMMISSION_PER_CUP', '3'],
  ['LINE_GROUP_ID', ''], // ใส่ groupId ของกลุ่ม Old Days เพื่อให้บอทเลขาส่งสรุป
];

var ROLE_LEVEL = { barista: 1, manager: 2, owner: 3 };

// ═══════════════════════════════════════════════════════════════
//  Entry points
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

// action ที่แก้ข้อมูล ต้องเข้าคิวทีละคน — ส่วน read ปล่อยขนานได้
// ไม่งั้นหน้า dashboard (ยิง 4 read พร้อมกัน) จะไปต่อคิวกันเองจนช้า
var WRITE_ACTIONS = {
  registerStaff: 1, submitDailyClose: 1, stockMove: 1, addIngredient: 1,
  deleteStockMove: 1, createPurchase: 1, updatePurchase: 1, saveMenuItem: 1,
  importFromGmail: 1, assignCommission: 1, payCommission: 1, payAllCommission: 1, saveStaffPay: 1,
  unpayCommission: 1, disableIngredient: 1, setCategoryCommission: 1, markStockChecked: 1,
  setStaffRole: 1, saveShift: 1,
  createMember: 1, addMemberCups: 1, redeemMember: 1, renewMember: 1, updateMember: 1,
  undoMemberLog: 1, adjustCandle: 1, importMembers: 1,
};

function handleRequest(e) {
  var lock = null;
  try {
    var params = (e && e.parameter) || {};
    var body = {};
    if (params.payload) {
      body = JSON.parse(params.payload);
    } else if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var req = Object.assign({}, params, body);
    var action = req.action || '';

    ensureSetup();

    if (WRITE_ACTIONS[action]) {
      lock = LockService.getScriptLock();
      try {
        lock.waitLock(20000);
      } catch (lockErr) {
        lock = null;
        throw new Error('ระบบกำลังยุ่ง กรุณาลองใหม่');
      }
    }

    var result = route(action, req);
    return jsonOut(Object.assign({ ok: true }, result));
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function route(action, req) {
  switch (action) {
    // ── ทั่วไป ──
    case 'bootstrap':        return actionBootstrap(req);
    case 'registerStaff':    return actionRegisterStaff(req);

    // ── ปิดยอดรายวัน ──
    case 'submitDailyClose': return actionSubmitDailyClose(req);
    case 'getDailyClose':    return actionGetDailyClose(req);
    case 'getReport':        return actionGetReport(req);
    case 'resendSummary':    return actionResendSummary(req);
    case 'importFromGmail':  return actionImportFromGmail(req);

    // ── ค่าคอม (หลังบ้าน manager+ เท่านั้น) ──
    case 'getCommissionAdmin': return actionGetCommissionAdmin(req);
    case 'assignCommission':   return actionAssignCommission(req);
    case 'payCommission':      return actionPayCommission(req);
    case 'payAllCommission':   return actionPayAllCommission(req);
    case 'unpayCommission':    return actionUnpayCommission(req);
    case 'saveStaffPay':       return actionSaveStaffPay(req);
    case 'saveShift':          return actionSaveShift(req);
    case 'disableIngredient':  return actionDisableIngredient(req);
    case 'setCategoryCommission': return actionSetCategoryCommission(req);
    case 'getStaffAdmin':      return actionGetStaffAdmin(req);
    case 'setStaffRole':       return actionSetStaffRole(req);

    // 🎫 สมาชิก
    case 'getMembers':       return actionGetMembers(req);
    case 'getMember':        return actionGetMember(req);
    case 'createMember':     return actionCreateMember(req);
    case 'addMemberCups':    return actionAddMemberCups(req);
    case 'redeemMember':     return actionRedeemMember(req);
    case 'renewMember':      return actionRenewMember(req);
    case 'updateMember':     return actionUpdateMember(req);
    case 'undoMemberLog':    return actionUndoMemberLog(req);
    case 'adjustCandle':     return actionAdjustCandle(req);
    case 'importMembers':    return actionImportMembers(req);

    // ── สต๊อก ──
    case 'getStock':         return actionGetStock(req);
    case 'addIngredient':    return actionAddIngredient(req);
    case 'stockMove':        return actionStockMove(req);
    case 'deleteStockMove':  return actionDeleteStockMove(req);
    case 'markStockChecked': return actionMarkStockChecked(req);

    // ── เบิกซื้อ ──
    case 'getPurchases':     return actionGetPurchases(req);
    case 'createPurchase':   return actionCreatePurchase(req);
    case 'updatePurchase':   return actionUpdatePurchase(req);

    // ── เมนู ──
    case 'getMenu':          return actionGetMenu(req);
    case 'saveMenuItem':     return actionSaveMenuItem(req);

    default:
      throw new Error('ไม่รู้จักคำสั่ง: ' + action);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Setup: สร้างแท็บ + seed ข้อมูลอัตโนมัติ
// ═══════════════════════════════════════════════════════════════

function ensureSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = false;
  Object.keys(HEADERS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(HEADERS[name]);
      sheet.setFrozenRows(1);
      created = true;
      seedSheet(name, sheet);
    }
  });
  return created;
}

function seedSheet(name, sheet) {
  if (name === SHEET_TABS.CATEGORIES) {
    SEED_CATEGORIES.forEach(function (c) {
      sheet.appendRow([c[0], c[1], c[2], c[3], c[4], c[5], true]);
    });
  } else if (name === SHEET_TABS.PREMIUM) {
    SEED_PREMIUM.forEach(function (p) {
      sheet.appendRow([p[0], p[1], p[2], p[3], p[4], true]);
    });
  } else if (name === SHEET_TABS.INGREDIENTS) {
    SEED_INGREDIENTS.forEach(function (i) {
      sheet.appendRow([i[0], i[1], i[2], i[3], i[4], true, new Date()]);
    });
  } else if (name === SHEET_TABS.CONFIG) {
    SEED_CONFIG.forEach(function (c) { sheet.appendRow(c); });
  } else if (name === SHEET_TABS.CANDLES) {
    SEED_CANDLES.forEach(function (c) {
      sheet.appendRow([c[0], c[1], c[2], c[3], c[4], c[5], true]);
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helpers: sheet <-> object
// ═══════════════════════════════════════════════════════════════

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readRows(name) {
  var sheet = getSheet(name);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = values[i][j];
    row._rowIndex = i + 1; // 1-based row ใน sheet
    rows.push(row);
  }
  return rows;
}

function appendRowObj(name, obj) {
  var sheet = getSheet(name);
  var headers = HEADERS[name];
  sheet.appendRow(headers.map(function (h) {
    return obj[h] !== undefined ? obj[h] : '';
  }));
}

function updateRowObj(name, rowIndex, obj) {
  var sheet = getSheet(name);
  var headers = HEADERS[name];
  var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

function getConfig() {
  var config = {};
  readRows(SHEET_TABS.CONFIG).forEach(function (r) { config[r.Key] = r.Value; });
  return config;
}

function isTrue(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

/**
 * Sheets ชอบแปลง string "2026-08-12" เป็น Date object ตอนเขียนลงเซลล์
 * ต้อง normalize กลับเป็น yyyy-MM-dd ก่อนเทียบเสมอ
 */
function dateKey(v) {
  if (v && typeof v.getTime === 'function') {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v);
}

function num(v) {
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmtMoney(n) {
  return num(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** วันที่ yyyy-MM-dd → "12/8/2569" (พ.ศ.) */
function thaiDate(isoDate) {
  var parts = String(isoDate).split('-');
  if (parts.length !== 3) return String(isoDate);
  return num(parts[2]) + '/' + num(parts[1]) + '/' + (num(parts[0]) + 543);
}

// ═══════════════════════════════════════════════════════════════
//  Auth
// ═══════════════════════════════════════════════════════════════

function findStaff(lineUserId) {
  var rows = readRows(SHEET_TABS.STAFF);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].LINE_User_ID === lineUserId && isTrue(rows[i].Active)) return rows[i];
  }
  return null;
}

function requireStaff(req) {
  var staff = findStaff(req.lineUserId);
  if (!staff) throw new Error('ยังไม่ได้ลงทะเบียนพนักงาน');
  return staff;
}

function requireRole(req, minRole) {
  var staff = requireStaff(req);
  if ((ROLE_LEVEL[staff.Role] || 0) < ROLE_LEVEL[minRole]) {
    throw new Error('สิทธิ์ไม่เพียงพอ (ต้องเป็น ' + minRole + ' ขึ้นไป)');
  }
  return staff;
}

// ═══════════════════════════════════════════════════════════════
//  Actions: ทั่วไป
// ═══════════════════════════════════════════════════════════════

function actionBootstrap(req) {
  var staff = findStaff(req.lineUserId);
  var config = getConfig();
  return {
    staff: staff,
    staffList: readRows(SHEET_TABS.STAFF)
      .filter(function (s) { return isTrue(s.Active); })
      .map(function (s) { return { name: s.Name, nickname: s.Nickname, role: s.Role }; }),
    categories: readRows(SHEET_TABS.CATEGORIES)
      .filter(function (c) { return isTrue(c.Active); })
      .sort(function (a, b) { return num(a.Sort_Order) - num(b.Sort_Order); }),
    premiumItems: readRows(SHEET_TABS.PREMIUM)
      .filter(function (p) { return isTrue(p.Active); })
      .sort(function (a, b) { return num(a.Sort_Order) - num(b.Sort_Order); }),
    config: {
      shopName: config.SHOP_NAME || 'Old Days',
      commissionPerCup: num(config.COMMISSION_PER_CUP || 3),
      lineGroupConfigured: !!(config.LINE_GROUP_ID &&
        PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN')),
    },
  };
}

function actionRegisterStaff(req) {
  if (!req.lineUserId) throw new Error('ไม่พบ LINE user id');
  if (!req.name) throw new Error('กรุณากรอกชื่อ');
  var all = readRows(SHEET_TABS.STAFF);

  // เคยมีบัญชีอยู่แล้ว (รวมที่ถูกปิดใช้งาน) — ห้ามสมัครซ้ำเพื่อชุบตัวเอง
  for (var i = 0; i < all.length; i++) {
    if (all[i].LINE_User_ID === req.lineUserId) {
      if (isTrue(all[i].Active)) return { staff: all[i] };
      throw new Error('บัญชีนี้ถูกปิดการใช้งาน ติดต่อเจ้าของร้าน');
    }
  }

  // ชื่อใช้เป็นตัวระบุค่าคอม/สิทธิ์แก้ยอด — ห้ามซ้ำเด็ดขาด
  var newName = String(req.name).trim();
  for (var j = 0; j < all.length; j++) {
    if (String(all[j].Name).trim().toLowerCase() === newName.toLowerCase()) {
      throw new Error('มีชื่อ "' + newName + '" อยู่แล้ว กรุณาใช้ชื่อที่ไม่ซ้ำ');
    }
  }
  req.name = newName;

  // คนแรกที่ลงทะเบียน = เจ้าของร้าน คนถัดไป = บาริสต้า (เจ้าของแก้ role ได้ในแท็บ Staff)
  var isFirst = all.length === 0;
  var staff = {
    LINE_User_ID: req.lineUserId,
    Name: req.name,
    Nickname: req.nickname || '',
    Role: isFirst ? 'owner' : 'barista',
    Active: true,
    Created_At: new Date(),
  };
  appendRowObj(SHEET_TABS.STAFF, staff);
  return { staff: staff };
}

// ═══════════════════════════════════════════════════════════════
//  Actions: ปิดยอดรายวัน + ค่าคอม
// ═══════════════════════════════════════════════════════════════

/**
 * คำนวณจำนวนแก้วที่นับค่าคอม จาก counts ต่อหมวด
 * เฉพาะหมวดที่ Count_Commission = TRUE (เครื่องดื่ม ไม่รวม Beer/Bakery)
 */
function calcCommissionCups(categoryCounts, categories) {
  var cups = 0;
  categories.forEach(function (c) {
    if (isTrue(c.Count_Commission)) cups += num(categoryCounts[c.Category_ID]);
  });
  return cups;
}

function actionSubmitDailyClose(req) {
  var staff = requireStaff(req);
  var date = String(req.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('รูปแบบวันที่ไม่ถูกต้อง');

  var categories = readRows(SHEET_TABS.CATEGORIES).filter(function (c) { return isTrue(c.Active); });
  var premiumItems = readRows(SHEET_TABS.PREMIUM).filter(function (p) { return isTrue(p.Active); });
  var config = getConfig();
  var rate = num(config.COMMISSION_PER_CUP || 3);

  var categoryCounts = req.categoryCounts || {};
  var premiumCounts = req.premiumCounts || {};
  var staffOnShift = Array.isArray(req.staffOnShift) ? req.staffOnShift : [];

  var total = num(req.totalSales);
  var cash = num(req.cash);
  var tct = num(req.thaiChuayThai);
  var transfer = num(req.transfer);
  var channelDiff = Math.round((cash + tct + transfer - total) * 100) / 100;

  var cups = calcCommissionCups(categoryCounts, categories);
  var commissionTotal = Math.round(cups * rate * 100) / 100;

  // มีของวันเดียวกันอยู่แล้ว → แทนที่ (แก้ยอดย้อนหลังต้องเป็น manager ขึ้นไป
  // หรือเป็นคนเดิมที่ส่งเอง)
  var existing = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date) === date;
  });
  if (existing.length) {
    var last = existing[existing.length - 1];
    // record ที่ดึงจาก POS อัตโนมัติ = ฉบับร่างรอคนยืนยัน ใครก็ยืนยันทับได้เลยไม่ต้องถาม
    var isAutoDraft = last.Submitted_By === AUTO_SUBMITTER;
    var canOverwrite = isAutoDraft || (ROLE_LEVEL[staff.Role] >= ROLE_LEVEL.manager) ||
      last.Submitted_By === staff.Name;
    if (!canOverwrite) throw new Error('วันที่นี้ถูกปิดยอดไปแล้วโดย ' +
      last.Submitted_By + ' (ให้ผู้บริหารเป็นคนแก้)');
    if (!isAutoDraft && !req.confirmOverwrite) {
      return { needConfirm: true, existing: last };
    }
    // ลบแถวเก่า (จากล่างขึ้นบนกัน index เลื่อน)
    var sheet = getSheet(SHEET_TABS.DAILY);
    existing.sort(function (a, b) { return b._rowIndex - a._rowIndex; })
      .forEach(function (r) { sheet.deleteRow(r._rowIndex); });
    deleteRowsByDate(SHEET_TABS.SALES_ROWS, date);
    // CommissionPay ไม่ลบ — การจ่ายค่าคอมเป็นเรื่องหลังบ้าน แยกจากการแก้ยอด
  }

  var record = {
    Date: date,
    Total_Sales: total,
    Cash: cash,
    Thai_Chuay_Thai: tct,
    Transfer: transfer,
    Cash_Over: num(req.cashOver),
    Channel_Diff: channelDiff,
    Discount_Count: num(req.discountCount),
    Discount_Total: num(req.discountTotal),
    Void_Count: num(req.voidCount),
    Void_Total: num(req.voidTotal),
    Category_Counts_JSON: JSON.stringify(categoryCounts),
    Premium_Counts_JSON: JSON.stringify(premiumCounts),
    Commission_Cups: cups,
    Commission_Rate: rate,
    Commission_Total: commissionTotal,
    Staff_On_Shift: staffOnShift.join(', '),
    Note: req.note || '',
    Submitted_By: staff.Name,
    Submitted_At: new Date(),
  };
  appendRowObj(SHEET_TABS.DAILY, record);

  // แถว normalize สำหรับทำ pivot ใน Sheets
  categories.forEach(function (c) {
    appendRowObj(SHEET_TABS.SALES_ROWS, {
      Date: date, Type: 'category', Name: c.Name,
      Count: num(categoryCounts[c.Category_ID]), Unit: c.Unit,
    });
  });
  premiumItems.forEach(function (p) {
    appendRowObj(SHEET_TABS.SALES_ROWS, {
      Date: date, Type: 'premium', Name: p.Name,
      Count: num(premiumCounts[p.Item_ID]), Unit: p.Unit,
    });
  });

  // ค่าคอมไม่ผูกกับการปิดยอดแล้ว — ผู้บริหาร/เจ้าของเลือกจ่ายทีหลังในหน้า "จ่ายค่าคอม"
  // (ยอด Commission_Cups/Total ยังคำนวณเก็บไว้ในแถวเป็นฐานให้หน้าหลังบ้านใช้)

  // ส่ง infographic เข้ากลุ่ม LINE
  var push = pushDailySummary(record, categories, premiumItems, config);

  return { record: record, pushed: push.pushed, pushError: push.error || null };
}

function deleteRowsByDate(tabName, date) {
  var sheet = getSheet(tabName);
  var rows = readRows(tabName).filter(function (r) { return dateKey(r.Date) === date; });
  rows.sort(function (a, b) { return b._rowIndex - a._rowIndex; })
    .forEach(function (r) { sheet.deleteRow(r._rowIndex); });
}

function actionGetDailyClose(req) {
  var staff = requireStaff(req);
  var rows = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date) === String(req.date);
  });
  var rec = rows.length ? rows[rows.length - 1] : null;
  if (rec) {
    delete rec._rowIndex;
    rec.Date = dateKey(rec.Date); // กัน timezone เพี้ยนตอน serialize เป็น JSON
    stripCommission(rec, staff);  // ค่าคอม (บาท) เป็นเรื่องหลังบ้าน — ไม่ส่งให้บาริสต้า
  }
  return { record: rec };
}

// ตัดตัวเลขเงินค่าคอมออกจากข้อมูลที่ส่งให้พนักงานระดับต่ำกว่า manager
// (จำนวนแก้ว Commission_Cups ไม่ลับ — ใช้โชว์ "เครื่องดื่มรวม" ทั้งในแอปและการ์ดกลุ่ม)
// ตัวเงินทุกอย่าง (ยอดขาย/ช่องทาง/ส่วนลดบาท/ลิ้นชัก/ค่าคอมบาท) เป็นเรื่องหลังบ้าน
// บาริสต้าเห็นได้แค่ "จำนวน" — แก้ว / บิล / ครั้ง / รายการ
var MONEY_FIELDS = ['Commission_Total', 'Commission_Rate', 'Total_Sales', 'Cash', 'Thai_Chuay_Thai',
  'Transfer', 'Cash_Over', 'Channel_Diff', 'Discount_Total', 'Void_Total'];
function stripCommission(rec, staff) {
  if (ROLE_LEVEL[staff.Role] >= ROLE_LEVEL.manager) return rec;
  MONEY_FIELDS.forEach(function (k) { delete rec[k]; });
  rec.Note = String(rec.Note || '')
    .replace(/\s*\|?\s*ลิ้นชัก:[^|]*/, '')
    .replace(/\s*\|?\s*รวมบัตรเครดิต[^|]*/, '');
  return rec;
}

function actionGetReport(req) {
  var staff = requireStaff(req);
  var month = String(req.month || ''); // 'yyyy-MM'
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('รูปแบบเดือนไม่ถูกต้อง');

  var days = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date).indexOf(month) === 0;
  }).map(function (r) {
    delete r._rowIndex;
    // ส่งวันที่เป็น string yyyy-MM-dd ตามเวลาไทยเสมอ — ถ้าปล่อยเป็น Date object
    // ตอนแปลง JSON มันกลายเป็นเวลา UTC แล้วหน้าแอปโชว์วันถอยหลังไป 1 วัน
    r.Date = dateKey(r.Date);
    return stripCommission(r, staff);
  });

  var canSeeMoney = ROLE_LEVEL[staff.Role] >= ROLE_LEVEL.manager;
  var totals = { days: days.length, cups: 0, discountCount: 0 };
  if (canSeeMoney) { totals.sales = 0; totals.cash = 0; totals.tct = 0; totals.transfer = 0; totals.discount = 0; totals.commission = 0; }
  days.forEach(function (d) {
    totals.cups += num(d.Commission_Cups);
    totals.discountCount += num(d.Discount_Count);
    if (!canSeeMoney) return;   // บาริสต้า: ไม่ส่งยอดเงินรวมด้วย
    totals.sales += num(d.Total_Sales);
    totals.cash += num(d.Cash);
    totals.tct += num(d.Thai_Chuay_Thai);
    totals.transfer += num(d.Transfer);
    totals.discount += num(d.Discount_Total);
    totals.commission += num(d.Commission_Total);
  });

  // ค่าคอมรายคน: บาริสต้าเห็นแค่ของตัวเอง / manager+ เห็นทุกคน
  var commissionRows = readRows(SHEET_TABS.COMMISSION).filter(function (r) {
    return dateKey(r.Date).indexOf(month) === 0;
  });
  var canSeeAll = ROLE_LEVEL[staff.Role] >= ROLE_LEVEL.manager;
  var byStaff = {};
  commissionRows.forEach(function (r) {
    if (!canSeeAll && r.Staff_Name !== staff.Name) return;
    if (!byStaff[r.Staff_Name]) byStaff[r.Staff_Name] = { amount: 0, days: 0 };
    byStaff[r.Staff_Name].amount += num(r.Amount);
    byStaff[r.Staff_Name].days += 1;
  });

  return { days: days, totals: totals, commissionByStaff: byStaff };
}

function actionResendSummary(req) {
  requireStaff(req);
  var rows = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date) === String(req.date);
  });
  if (!rows.length) throw new Error('ไม่พบยอดของวันที่นี้');
  var categories = readRows(SHEET_TABS.CATEGORIES).filter(function (c) { return isTrue(c.Active); });
  var premiumItems = readRows(SHEET_TABS.PREMIUM).filter(function (p) { return isTrue(p.Active); });
  var push = pushDailySummary(rows[rows.length - 1], categories, premiumItems, getConfig());
  if (!push.pushed) throw new Error(push.error || 'ส่งไม่สำเร็จ');
  return { pushed: true };
}

// ═══════════════════════════════════════════════════════════════
//  Actions: สต๊อก
// ═══════════════════════════════════════════════════════════════

function actionGetStock(req) {
  requireStaff(req);
  var ingredients = readRows(SHEET_TABS.INGREDIENTS).filter(function (i) { return isTrue(i.Active); });
  var moves = readRows(SHEET_TABS.STOCK_MOVES);
  // แจ้งฝั่งหน้าเว็บด้วยว่ารายการไหนคือ "ล่าสุด" ของวัตถุดิบนั้นๆ — มีปุ่มลบได้เฉพาะรายการนั้น (กันยอดคงเหลือเพี้ยน)
  var latestRowByIng = {};
  moves.forEach(function (m) { latestRowByIng[m.Ingredient_ID] = m._rowIndex; });
  var recent = moves.slice(-30).reverse().map(function (m) {
    return {
      RowIndex: m._rowIndex,
      Timestamp: m.Timestamp, Ingredient_ID: m.Ingredient_ID, Ingredient_Name: m.Ingredient_Name,
      Type: m.Type, Qty: m.Qty, Balance_After: m.Balance_After, Note: m.Note, By: m.By,
      IsLatest: latestRowByIng[m.Ingredient_ID] === m._rowIndex,
    };
  });
  return {
    ingredients: ingredients,
    recentMoves: recent,
    todayCheck: todayStockCheck(),
  };
}

// ── เช็คสต๊อกประจำวัน: พนักงานกด "เช็คสต๊อกแล้ว" วันละครั้ง — ไม่กด = บอทเตือนในกลุ่มตอนเย็น ──
function todayStockCheck() {
  var today = dateKey(new Date());
  var rows = readRows(SHEET_TABS.STOCK_CHECKS).filter(function (r) { return dateKey(r.Date) === today; });
  if (!rows.length) return null;
  var r = rows[rows.length - 1];
  return { by: r.Checked_By, at: r.Checked_At };
}
function actionMarkStockChecked(req) {
  var staff = requireStaff(req);
  var existing = todayStockCheck();
  if (existing) return { already: true, by: existing.by, at: existing.at };
  var now = new Date();
  appendRowObj(SHEET_TABS.STOCK_CHECKS, { Date: dateKey(now), Checked_By: staff.Name, Checked_At: now, Note: String(req.note || '') });
  return { already: false, by: staff.Name, at: now };
}

// ลบ/undo รายการเคลื่อนไหวสต๊อกที่เพิ่งกดผิด — ลบได้เฉพาะรายการ "ล่าสุด" ของวัตถุดิบนั้นๆ เท่านั้น
// (ถ้าลบรายการเก่ากว่านั้นได้ ยอดคงเหลือของรายการหลังจากมันจะเพี้ยนหมด) รายการเก่ากว่าให้ใช้ "นับสต๊อก" แก้แทน
function actionDeleteStockMove(req) {
  requireStaff(req);
  var rowIndex = parseInt(req.rowIndex, 10);
  if (!rowIndex) throw new Error('ไม่พบรายการนี้');

  var moves = readRows(SHEET_TABS.STOCK_MOVES);
  var target = null;
  for (var i = 0; i < moves.length; i++) {
    if (moves[i]._rowIndex === rowIndex) { target = moves[i]; break; }
  }
  if (!target) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)');

  var sameIng = moves.filter(function (m) { return m.Ingredient_ID === target.Ingredient_ID; });
  var latest = sameIng[sameIng.length - 1];
  if (latest._rowIndex !== target._rowIndex) {
    throw new Error('ลบได้เฉพาะรายการล่าสุดของ "' + target.Ingredient_Name + '" เท่านั้นค่ะ — '
      + 'ถ้ารายการเก่ากว่านี้ผิด ให้ใช้ "นับสต๊อก" ปรับยอดปัจจุบันให้ตรงแทนนะคะ');
  }

  // หายอดคงเหลือ "ก่อน" รายการนี้ — ถ้ามีรายการก่อนหน้าของวัตถุดิบเดียวกัน ใช้ยอดนั้นเลย
  // ถ้าเป็นรายการแรกของวัตถุดิบนี้ ย้อนคำนวณจากยอดปัจจุบันตามชนิดการเคลื่อนไหว (นับสต๊อกย้อนไม่ได้ ต้องนับใหม่เอง)
  var ingRows = readRows(SHEET_TABS.INGREDIENTS);
  var ing = null;
  for (var k = 0; k < ingRows.length; k++) {
    if (ingRows[k].Ingredient_ID === target.Ingredient_ID) { ing = ingRows[k]; break; }
  }
  if (!ing) throw new Error('ไม่พบวัตถุดิบนี้แล้วในระบบ');

  var prevBalance;
  if (sameIng.length >= 2) {
    prevBalance = num(sameIng[sameIng.length - 2].Balance_After);
  } else if (target.Type === 'in') {
    prevBalance = num(ing.Current_Stock) - num(target.Qty);
  } else if (target.Type === 'out') {
    prevBalance = num(ing.Current_Stock) + num(target.Qty);
  } else {
    prevBalance = num(ing.Current_Stock); // count รายการแรก — ย้อนยอดก่อนหน้าไม่ได้ ต้องนับสต๊อกใหม่เองถ้าไม่ตรง
  }

  var keep = ing._rowIndex;
  delete ing._rowIndex;
  ing.Current_Stock = prevBalance;
  ing.Updated_At = new Date();
  updateRowObj(SHEET_TABS.INGREDIENTS, keep, ing);

  getSheet(SHEET_TABS.STOCK_MOVES).deleteRow(target._rowIndex);

  return { balance: prevBalance };
}

function actionAddIngredient(req) {
  requireStaff(req);
  if (!req.name) throw new Error('กรุณากรอกชื่อวัตถุดิบ');
  var id = 'ing-' + Date.now();
  appendRowObj(SHEET_TABS.INGREDIENTS, {
    Ingredient_ID: id,
    Name: req.name,
    Unit: req.unit || 'ชิ้น',
    Min_Stock: num(req.minStock),
    Current_Stock: num(req.currentStock),
    Active: true,
    Updated_At: new Date(),
  });
  return { id: id };
}

function actionStockMove(req) {
  var staff = requireStaff(req);
  var type = req.type; // 'in' | 'out' | 'count'
  if (['in', 'out', 'count'].indexOf(type) === -1) throw new Error('ประเภทไม่ถูกต้อง');
  var qty = num(req.qty);
  if (type !== 'count' && qty <= 0) throw new Error('จำนวนต้องมากกว่า 0');
  if (type === 'count' && qty < 0) throw new Error('จำนวนติดลบไม่ได้');

  var rows = readRows(SHEET_TABS.INGREDIENTS);
  var ing = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Ingredient_ID === req.ingredientId) { ing = rows[i]; break; }
  }
  if (!ing) throw new Error('ไม่พบวัตถุดิบ');

  var current = num(ing.Current_Stock);
  if (type === 'out' && qty > current) {
    throw new Error('ตัดออก ' + qty + ' ไม่ได้ — คงเหลือแค่ ' + current + ' ' + ing.Unit +
      ' (ถ้าของจริงไม่ตรง ใช้ "นับสต๊อก" แทน)');
  }
  var balance;
  if (type === 'in') balance = current + qty;
  else if (type === 'out') balance = current - qty;
  else balance = qty; // count = นับใหม่ทับเลย

  ing.Current_Stock = balance;
  ing.Updated_At = new Date();
  var keep = ing._rowIndex;
  delete ing._rowIndex;
  updateRowObj(SHEET_TABS.INGREDIENTS, keep, ing);

  appendRowObj(SHEET_TABS.STOCK_MOVES, {
    Timestamp: new Date(),
    Ingredient_ID: req.ingredientId,
    Ingredient_Name: ing.Name,
    Type: type,
    Qty: qty,
    Balance_After: balance,
    Note: req.note || '',
    By: staff.Name,
  });

  return { balance: balance, low: balance <= num(ing.Min_Stock) };
}

// ═══════════════════════════════════════════════════════════════
//  Actions: เบิกซื้อ
// ═══════════════════════════════════════════════════════════════

function actionGetPurchases(req) {
  requireStaff(req);
  // pending/approved ต้องเห็นเสมอไม่ว่าเก่าแค่ไหน (ไม่งั้นค้างอนุมัติแบบเงียบ ๆ)
  var all = readRows(SHEET_TABS.PURCHASES);
  var open = all.filter(function (p) { return p.Status === 'pending' || p.Status === 'approved'; });
  var closed = all.filter(function (p) { return p.Status !== 'pending' && p.Status !== 'approved'; }).slice(-50);
  var merged = open.concat(closed).sort(function (a, b) { return a._rowIndex - b._rowIndex; });
  return { purchases: merged.reverse() };
}

function actionCreatePurchase(req) {
  var staff = requireStaff(req);
  if (!req.items) throw new Error('กรุณากรอกรายการที่จะซื้อ');
  var id = 'po-' + Date.now();
  appendRowObj(SHEET_TABS.PURCHASES, {
    Purchase_ID: id,
    Requested_At: new Date(),
    Requested_By: staff.Name,
    Items: req.items,
    Est_Cost: num(req.estCost),
    Status: 'pending',
    Approved_By: '', Approved_At: '', Actual_Cost: '', Purchased_At: '',
    Note: req.note || '',
  });
  notifyGroup('🛒 ขอเบิกซื้อใหม่จาก ' + staff.Name + '\n' + req.items +
    (num(req.estCost) ? '\nประมาณ ' + fmtMoney(req.estCost) + ' บาท' : '') +
    '\n\nเปิดแอปเพื่ออนุมัติ');
  return { id: id };
}

function actionUpdatePurchase(req) {
  var rows = readRows(SHEET_TABS.PURCHASES);
  var po = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Purchase_ID === req.purchaseId) { po = rows[i]; break; }
  }
  if (!po) throw new Error('ไม่พบรายการเบิกซื้อ');

  var newStatus = req.status; // approved | rejected | purchased | cancelled | unapprove
  var staff;
  if (newStatus === 'approved' || newStatus === 'rejected') {
    staff = requireRole(req, 'manager');
    if (po.Status !== 'pending') {
      throw new Error('รายการนี้ถูก' + (po.Status === 'purchased' ? 'ซื้อ' : 'ตัดสิน') +
        'ไปแล้ว (สถานะ: ' + po.Status + ')');
    }
    po.Status = newStatus;
    po.Approved_By = staff.Name;
    po.Approved_At = new Date();
  } else if (newStatus === 'cancelled') {
    // ถอนคำขอ — คนที่ขอเองหรือผู้บริหาร ยกเลิกได้เฉพาะตอนยังรออนุมัติ
    staff = requireStaff(req);
    if (po.Status !== 'pending') throw new Error('ยกเลิกได้เฉพาะรายการที่ยังรออนุมัติ');
    if (po.Requested_By !== staff.Name && ROLE_LEVEL[staff.Role] < ROLE_LEVEL.manager) {
      throw new Error('ยกเลิกได้เฉพาะคนที่ขอเองหรือผู้บริหาร');
    }
    po.Status = 'cancelled';
    po.Note = (po.Note ? po.Note + ' | ' : '') + 'ยกเลิกโดย ' + staff.Name;
  } else if (newStatus === 'unapprove') {
    // ถอนอนุมัติกลับเป็นรออนุมัติ — ทำได้ก่อนบันทึกซื้อ
    staff = requireRole(req, 'manager');
    if (po.Status !== 'approved') throw new Error('ถอนอนุมัติได้เฉพาะรายการที่อนุมัติแล้วและยังไม่บันทึกซื้อ');
    po.Status = 'pending';
    po.Note = (po.Note ? po.Note + ' | ' : '') + 'ถอนอนุมัติโดย ' + staff.Name;
    po.Approved_By = '';
    po.Approved_At = '';
  } else if (newStatus === 'purchased') {
    staff = requireStaff(req);
    if (po.Status === 'purchased') {
      // แก้ยอดจ่ายจริงย้อนหลัง — ผู้บริหารขึ้นไป (เก็บยอดเดิมไว้ใน Note)
      if (ROLE_LEVEL[staff.Role] < ROLE_LEVEL.manager) throw new Error('แก้ยอดย้อนหลังต้องเป็นผู้บริหาร');
      po.Note = (po.Note ? po.Note + ' | ' : '') + 'แก้ยอดจาก ' + fmtMoney(po.Actual_Cost) + ' โดย ' + staff.Name;
      po.Actual_Cost = num(req.actualCost);
    } else if (po.Status === 'approved') {
      po.Status = 'purchased';
      po.Actual_Cost = num(req.actualCost);
      po.Purchased_At = new Date();
      if (req.note) po.Note = (po.Note ? po.Note + ' | ' : '') + req.note;
    } else {
      throw new Error('ต้องอนุมัติก่อนถึงบันทึกซื้อได้');
    }
  } else {
    throw new Error('สถานะไม่ถูกต้อง');
  }

  var keep = po._rowIndex;
  delete po._rowIndex;
  updateRowObj(SHEET_TABS.PURCHASES, keep, po);
  return { purchase: po };
}

// ═══════════════════════════════════════════════════════════════
//  Actions: เมนู (โครงไว้ให้พนักงานกรอกรายละเอียด)
// ═══════════════════════════════════════════════════════════════

function actionGetMenu(req) {
  requireStaff(req);
  return { menuItems: readRows(SHEET_TABS.MENU) };
}

function actionSaveMenuItem(req) {
  requireRole(req, 'manager');
  if (!req.name) throw new Error('กรุณากรอกชื่อเมนู');
  if (req.menuId) {
    var rows = readRows(SHEET_TABS.MENU);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].Menu_ID === req.menuId) {
        var row = rows[i];
        row.Category_ID = req.categoryId || row.Category_ID;
        row.Name = req.name;
        row.Price = num(req.price);
        row.Active = req.active !== false;
        row.Note = req.note || '';
        var keep = row._rowIndex;
        delete row._rowIndex;
        updateRowObj(SHEET_TABS.MENU, keep, row);
        return { menuId: req.menuId };
      }
    }
    throw new Error('ไม่พบเมนู');
  }
  var id = 'menu-' + Date.now();
  appendRowObj(SHEET_TABS.MENU, {
    Menu_ID: id, Category_ID: req.categoryId || '', Name: req.name,
    Price: num(req.price), Active: true, Note: req.note || '',
  });
  return { menuId: id };
}

// ═══════════════════════════════════════════════════════════════
//  LINE: บอทเลขาส่งสรุปยอดเข้ากลุ่ม Old Days
// ═══════════════════════════════════════════════════════════════

function getLineCredentials() {
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var groupId = getConfig().LINE_GROUP_ID || DEFAULT_LINE_GROUP_ID;
  return { token: token, groupId: groupId };
}

/**
 * 🧪 รันฟังก์ชันนี้ใน editor เพื่อทดสอบการส่งเข้ากลุ่มแบบเห็นผลทันที
 * สำเร็จ = ข้อความทดสอบเด้งในกลุ่ม Old Days / ล้มเหลว = error สีแดงพร้อมสาเหตุ (เช่น token หาย)
 */
function testGroupPush() {
  var r = notifyGroup('🧪 ทดสอบระบบร้าน Old Days — เห็นข้อความนี้ = การส่งอัตโนมัติพร้อมใช้แล้วค่ะ');
  if (!r.pushed) throw new Error('ส่งไม่สำเร็จ: ' + r.error);
  return 'ส่งเข้ากลุ่มสำเร็จ ✅';
}

function notifyGroup(text) {
  var cred = getLineCredentials();
  if (!cred.token || !cred.groupId) return { pushed: false, error: 'ยังไม่ได้ตั้งค่า LINE bot' };
  return linePush(cred, [{ type: 'text', text: text }]);
}

/** ชื่อเล่นจากชื่อจริง (ชื่อจริงเป็น key ใน Sheet — การแสดงผลใช้ชื่อเล่นให้เป็นกันเอง) */
function nickOf(name) {
  try {
    var rows = readRows(SHEET_TABS.STAFF);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].Name === name && rows[i].Nickname) return String(rows[i].Nickname);
    }
  } catch (e) {}
  return String(name || '');
}

function pushDailySummary(record, categories, premiumItems, config) {
  var cred = getLineCredentials();
  if (!cred.token || !cred.groupId) {
    return { pushed: false, error: 'ยังไม่ได้ตั้งค่า LINE bot (token/groupId)' };
  }
  var display = Object.assign({}, record, { Submitted_By: nickOf(record.Submitted_By) });
  var flex = buildDailyFlex(display, categories, premiumItems, config);
  return linePush(cred, [flex]);
}

function linePush(cred, messages, to) {
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + cred.token },
      payload: JSON.stringify({ to: to || cred.groupId, messages: messages }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) return { pushed: true };
    return { pushed: false, error: 'LINE API: ' + res.getContentText() };
  } catch (err) {
    return { pushed: false, error: String(err) };
  }
}

/**
 * Flex Message รายงานขายรายวัน "ฉบับกลุ่มพนักงาน" — ไม่มีตัวเงินเลย
 * โชว์ 2 ตัวเลขหลักที่ทีมต้องใช้: 🥤 แก้วที่นับค่าคอม กับ 📦 รายการทั้งหมด
 * (ยอดเงิน/ค่าคอมเป็นเรื่องหลังบ้าน — ผู้บริหารดูในแอป หรือรับสรุปเงินทาง DM)
 */
function buildDailyFlex(record, categories, premiumItems, config) {
  var C = {
    bg: '#241A14', card: '#33261C', cream: '#F5EBDD', gold: '#D9A05B',
    dim: '#B9A58E', green: '#7FB77E', blue: '#7EA8C9', pink: '#D98BA0',
  };
  var date = thaiDate(dateKey(record.Date));
  var catCounts = safeParse(record.Category_Counts_JSON);

  // แยก 2 กลุ่ม: หมวดที่นับแก้วค่าคอม กับหมวดที่ไม่นับ (เบียร์/เบเกอรี่)
  var drinkRows = [], otherRows = [];
  var drinkCups = 0, otherItems = 0;
  categories.forEach(function (c) {
    var count = num(catCounts[c.Category_ID]);
    if (!count) return;   // โชว์เฉพาะที่ขายได้ การ์ดจะได้ไม่ยาวเกิน
    var row = {
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: (c.Emoji ? c.Emoji + ' ' : '') + c.Name, size: 'sm', color: C.cream, flex: 6, wrap: true },
        { type: 'text', text: count + ' ' + c.Unit, size: 'sm', color: C.gold, align: 'end', flex: 3, weight: 'bold' },
      ],
    };
    if (isTrue(c.Count_Commission)) { drinkRows.push(row); drinkCups += count; }
    else { otherRows.push(row); otherItems += count; }
  });
  var totalItems = drinkCups + otherItems;

  // ── หัวการ์ด: แก้วค่าคอมตัวใหญ่ + รายการทั้งหมด ──
  var body = [
    {
      type: 'box', layout: 'vertical', alignItems: 'center', spacing: 'none',
      contents: [
        { type: 'text', text: '🥤 เครื่องดื่มที่ขายได้', size: 'sm', color: C.dim },
        { type: 'text', text: String(drinkCups), size: '3xl', weight: 'bold', color: C.gold },
        { type: 'text', text: 'แก้ว', size: 'sm', color: C.dim },
      ],
    },
    {
      type: 'box', layout: 'horizontal', margin: 'lg', paddingAll: '10px',
      backgroundColor: '#1A120D', cornerRadius: 'md',
      contents: [
        { type: 'text', text: '📦 รายการทั้งหมด', size: 'sm', color: C.cream, flex: 5 },
        { type: 'text', text: totalItems + ' รายการ', size: 'sm', color: C.cream, align: 'end', flex: 4, weight: 'bold' },
      ],
    },
  ];

  if (drinkRows.length) {
    body = body.concat([
      { type: 'separator', margin: 'lg', color: '#4A3826' },
      { type: 'text', text: '🥤 เครื่องดื่ม (นับแก้ว)', size: 'sm', weight: 'bold', color: C.gold, margin: 'lg' },
    ], drinkRows, [{
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: 'รวมแก้วเครื่องดื่ม', size: 'xs', color: C.dim, flex: 6 },
        { type: 'text', text: drinkCups + ' แก้ว', size: 'xs', color: C.gold, align: 'end', flex: 3, weight: 'bold' },
      ],
    }]);
  }

  if (otherRows.length) {
    body = body.concat([
      { type: 'separator', margin: 'lg', color: '#4A3826' },
      { type: 'text', text: '🍰 อื่น ๆ (ไม่นับแก้ว)', size: 'sm', weight: 'bold', color: C.gold, margin: 'lg' },
    ], otherRows, [{
      type: 'box', layout: 'horizontal', margin: 'md',
      contents: [
        { type: 'text', text: 'รวมรายการอื่น', size: 'xs', color: C.dim, flex: 6 },
        { type: 'text', text: otherItems + ' รายการ', size: 'xs', color: C.dim, align: 'end', flex: 3 },
      ],
    }]);
  }

  var premCounts = safeParse(record.Premium_Counts_JSON);
  var premRows = [];
  premiumItems.forEach(function (p) {
    var count = num(premCounts[p.Item_ID]);
    if (!count) return;
    premRows.push({
      type: 'box', layout: 'horizontal', margin: 'sm',
      contents: [
        { type: 'text', text: (p.Emoji ? p.Emoji + ' ' : '') + p.Name, size: 'sm', color: C.cream, flex: 7, wrap: true },
        { type: 'text', text: count + ' ' + p.Unit, size: 'sm', color: C.gold, align: 'end', flex: 2, weight: 'bold' },
      ],
    });
  });
  if (premRows.length) {
    body = body.concat([
      { type: 'separator', margin: 'lg', color: '#4A3826' },
      { type: 'text', text: '✨ เมนูพรีเมียม', size: 'sm', weight: 'bold', color: C.gold, margin: 'lg' },
    ], premRows);
  }

  // ── ตัวเลขปฏิบัติการ (ไม่มีเงิน): ลูกค้า/บิล จาก Note + จำนวนส่วนลด/Void ──
  var guests = String(record.Note || '').match(/ลูกค้า (\d+) คน \/ (\d+) บิล/);
  var opsRows = [];
  if (guests) opsRows.push(kvRow('👥 ลูกค้า', guests[1] + ' คน / ' + guests[2] + ' บิล', C));
  if (num(record.Discount_Count)) opsRows.push(kvRow('🏷️ ส่วนลด', num(record.Discount_Count) + ' รายการ', C));
  if (num(record.Void_Count)) opsRows.push(kvRow('🗑️ บิล Void', num(record.Void_Count) + ' บิล', C));
  var memFree = String(record.Note || '').match(/สมาชิกแลกฟรี (\d+) แก้ว/);
  if (memFree) opsRows.push(kvRow('🎁 สมาชิกแลกฟรี', memFree[1] + ' แก้ว', C));
  if (opsRows.length) {
    body = body.concat([{ type: 'separator', margin: 'lg', color: '#4A3826' }], opsRows);
  }

  var fromPos = String(record.Submitted_By).indexOf('FoodStory') !== -1;
  return {
    type: 'flex',
    altText: '☕ ' + (config.SHOP_NAME || 'Old Days') + ' ' + date + ' — เครื่องดื่ม ' + drinkCups +
      ' แก้ว / รวม ' + totalItems + ' รายการ',
    contents: {
      type: 'bubble', size: 'mega',
      styles: { header: { backgroundColor: C.bg }, body: { backgroundColor: C.bg } },
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px', paddingBottom: '0px',
        contents: [
          { type: 'text', text: '☕ ' + (config.SHOP_NAME || 'Old Days'), weight: 'bold', size: 'lg', color: C.cream },
          { type: 'text', text: 'รายงานขายประจำวัน ' + date, size: 'sm', color: C.dim, margin: 'xs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: C.bg,
        contents: [{
          type: 'text', size: 'xxs', color: C.dim, align: 'center', wrap: true,
          text: (fromPos ? '📩 จากรายงานปิดรอบ POS อัตโนมัติ' : 'บันทึกโดย ' + record.Submitted_By) +
            (record.Staff_On_Shift ? ' · 👥 ' + record.Staff_On_Shift : ''),
        }],
      },
    },
  };
}

/**
 * 💰 สรุป "ตัวเงิน" ส่งเข้า DM ของผู้บริหาร/เจ้าของเท่านั้น
 * (การ์ดในกลุ่มไม่มีเงินแล้ว — ฝั่งผู้บริหารยังต้องเห็นยอดทุกวันโดยไม่ต้องเปิดแอป)
 */
function pushOwnerMoneySummary(record, config) {
  var cred = getLineCredentials();
  if (!cred.token) return { pushed: false, error: 'ไม่มี LINE token' };
  var bosses = readRows(SHEET_TABS.STAFF).filter(function (s) {
    return isTrue(s.Active) && s.LINE_User_ID &&
      (ROLE_LEVEL[s.Role] || 0) >= ROLE_LEVEL.manager;
  });
  if (!bosses.length) return { pushed: false, error: 'ไม่มีผู้บริหารในทะเบียน' };

  var drawer = String(record.Note || '').match(/ลิ้นชัก: [^|]+/);
  var text = '💰 ยอดขาย ' + (config.SHOP_NAME || 'Old Days') + ' ' + thaiDate(dateKey(record.Date)) + '\n' +
    '(ข้อความนี้ส่งเฉพาะผู้บริหาร ไม่ได้ลงกลุ่ม)\n' +
    '━━━━━━━━━━━━━━\n' +
    '💵 รวม ' + fmtMoney(record.Total_Sales) + ' บาท\n' +
    '• เงินสด ' + fmtMoney(record.Cash) + '\n' +
    '• ไทยช่วยไทย ' + fmtMoney(record.Thai_Chuay_Thai) + '\n' +
    '• เงินโอน ' + fmtMoney(record.Transfer) + '\n' +
    '━━━━━━━━━━━━━━\n' +
    '🥤 เครื่องดื่ม ' + num(record.Commission_Cups) + ' แก้ว → ค่าคอม ' + fmtMoney(record.Commission_Total) + ' บาท\n' +
    '🏷️ ส่วนลด ' + num(record.Discount_Count) + ' รายการ / ' + fmtMoney(record.Discount_Total) + ' บาท' +
    (num(record.Void_Count) ? '\n🗑️ Void ' + num(record.Void_Count) + ' บิล / ' + fmtMoney(record.Void_Total) + ' บาท' : '') +
    (drawer ? '\n🗄️ ' + drawer[0].trim() : '');

  var sent = 0;
  bosses.forEach(function (b) {
    if (linePush(cred, [{ type: 'text', text: text }], String(b.LINE_User_ID)).pushed) sent++;
  });
  return { pushed: sent > 0, sent: sent };
}

function kvRow(label, value, C) {
  return {
    type: 'box', layout: 'horizontal', margin: 'xs',
    contents: [
      { type: 'text', text: label, size: 'xs', color: C.dim, flex: 5 },
      { type: 'text', text: value, size: 'xs', color: C.cream, align: 'end', flex: 5 },
    ],
  };
}

function safeParse(json) {
  try { return JSON.parse(json) || {}; } catch (e) { return {}; }
}

// ═══════════════════════════════════════════════════════════════
//  ค่าคอม (หลังบ้าน) — manager/owner เลือกจ่าย + ยืนยันจ่ายผ่านพร้อมเพย์
// ═══════════════════════════════════════════════════════════════

function actionGetCommissionAdmin(req) {
  requireRole(req, 'manager');
  var month = String(req.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('รูปแบบเดือนไม่ถูกต้อง');

  var days = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date).indexOf(month) === 0;
  }).map(function (r) {
    return {
      date: dateKey(r.Date),
      cups: num(r.Commission_Cups),
      amount: num(r.Commission_Total),
      submittedBy: r.Submitted_By,
      shift: String(r.Staff_On_Shift || ''),
    };
  });

  var pays = readRows(SHEET_TABS.COM_PAY).filter(function (r) {
    return dateKey(r.Date).indexOf(month) === 0;
  }).map(function (r) {
    return {
      date: dateKey(r.Date), staffName: r.Staff_Name, amount: num(r.Amount),
      status: r.Status, paidAt: r.Paid_At, paidBy: r.Paid_By,
    };
  });

  var staffPay = {};
  readRows(SHEET_TABS.STAFF_PAY).forEach(function (r) { staffPay[r.Staff_Name] = String(r.PromptPay || ''); });

  var staffNames = readRows(SHEET_TABS.STAFF)
    .filter(function (s) { return isTrue(s.Active) && s.Role !== 'owner'; })
    .map(function (s) { return { name: s.Name, nickname: s.Nickname }; });

  return { days: days, pays: pays, staffPay: staffPay, staffNames: staffNames };
}

/** 👥 บันทึกว่าใครเข้ากะวันไหน (หลังบ้าน manager+) — เก็บใน Staff_On_Shift ของ DailyClose
 *  ใช้จากหน้าจ่ายค่าคอม: แตะชิปชื่อ = บันทึกทันที เปลี่ยนกี่รอบก็ได้ (เขียนทับค่าเดิม) */
/**
 * เปิด/ปิด "นับค่าคอม" ของหมวดสินค้า (manager+) แล้วคำนวณแก้วค่าคอมย้อนหลังใหม่ทุกวัน
 * — หมวดที่ POS ส่งมาใหม่ (เช่น PREMIUM, Secret Kub eiei) ระบบสร้างให้แบบ "ไม่นับ" ไว้ก่อน เจ้าของมาเปิดเองที่นี่
 */
function actionSetCategoryCommission(req) {
  requireRole(req, 'manager');
  var id = String(req.categoryId || '');
  var rows = readRows(SHEET_TABS.CATEGORIES);
  var cat = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].Category_ID === id) { cat = rows[i]; break; }
  if (!cat) throw new Error('ไม่พบหมวดสินค้า');
  cat.Count_Commission = isTrue(req.count);
  var keep = cat._rowIndex;
  delete cat._rowIndex;
  updateRowObj(SHEET_TABS.CATEGORIES, keep, cat);
  var result = recalcCommissionAll();
  return { categoryId: id, count: cat.Count_Commission, recalculated: result.days, paysUpdated: result.pays };
}

/**
 * คำนวณ Commission_Cups / Commission_Total ของทุกวันใน DailyClose ใหม่ตามธง Count_Commission ปัจจุบัน
 * + ปรับยอดใน CommissionPay ที่ยัง unpaid ให้ตรง (ที่จ่ายไปแล้วไม่แตะ)
 */
function recalcCommissionAll() {
  var cats = readRows(SHEET_TABS.CATEGORIES).filter(function (c) { return isTrue(c.Active); });
  var defaultRate = num(getConfig().COMMISSION_PER_CUP || 3);
  var totalByDate = {};
  var changedDays = 0;
  readRows(SHEET_TABS.DAILY).forEach(function (r) {
    var counts = {};
    try { counts = JSON.parse(r.Category_Counts_JSON || '{}') || {}; } catch (e) {}
    var cups = calcCommissionCups(counts, cats);
    var rate = num(r.Commission_Rate) || defaultRate;
    var total = Math.round(cups * rate * 100) / 100;
    totalByDate[dateKey(r.Date)] = total;
    if (num(r.Commission_Cups) === cups && num(r.Commission_Total) === total) return;
    var idx = r._rowIndex;
    delete r._rowIndex;
    r.Commission_Cups = cups;
    r.Commission_Rate = rate;
    r.Commission_Total = total;
    updateRowObj(SHEET_TABS.DAILY, idx, r);
    changedDays++;
  });
  var changedPays = 0;
  readRows(SHEET_TABS.COM_PAY).forEach(function (p) {
    if (p.Status !== 'unpaid') return;
    var t = totalByDate[dateKey(p.Date)];
    if (t === undefined || num(p.Amount) === t) return;
    var idx = p._rowIndex;
    delete p._rowIndex;
    p.Amount = t;
    updateRowObj(SHEET_TABS.COM_PAY, idx, p);
    changedPays++;
  });
  return { days: changedDays, pays: changedPays };
}

/** รันมือครั้งเดียวจาก Apps Script editor: เปิดนับค่าคอมให้ PREMIUM + Secret Kub eiei แล้วคำนวณย้อนหลัง */
function fixCountPremiumAndSecretKub() {
  var want = { PREMIUM: 1, SECRETKUBEIEI: 1 };
  readRows(SHEET_TABS.CATEGORIES).forEach(function (c) {
    if (!want[normalizeCatName(c.Name)] || isTrue(c.Count_Commission)) return;
    c.Count_Commission = true;
    var idx = c._rowIndex;
    delete c._rowIndex;
    updateRowObj(SHEET_TABS.CATEGORIES, idx, c);
  });
  var r = recalcCommissionAll();
  console.log('recalc: ' + r.days + ' days, ' + r.pays + ' unpaid rows updated');
}

/** 👥 ทะเบียนพนักงาน+สิทธิ์ (เจ้าของเท่านั้น) — LINE_User_ID ไม่ส่งให้ใครนอกจากเจ้าของ */
function actionGetStaffAdmin(req) {
  var me = requireRole(req, 'owner');
  return {
    meId: String(me.LINE_User_ID),
    staff: readRows(SHEET_TABS.STAFF).map(function (s) {
      return {
        id: String(s.LINE_User_ID), name: String(s.Name || ''),
        nickname: String(s.Nickname || ''), role: String(s.Role || 'barista'),
        active: isTrue(s.Active), createdAt: dateKey(s.Created_At),
      };
    }),
  };
}

/**
 * เปลี่ยนสิทธิ์ / เปิด-ปิดการใช้งาน / แก้ชื่อเล่นของพนักงาน (เจ้าของเท่านั้น)
 * กันล็อกตัวเอง: ห้ามลดสิทธิ์/ปิดใช้งานตัวเอง และต้องเหลือเจ้าของที่ใช้งานได้ ≥ 1 คนเสมอ
 */
function actionSetStaffRole(req) {
  var me = requireRole(req, 'owner');
  var targetId = String(req.staffId || '');
  var rows = readRows(SHEET_TABS.STAFF);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].LINE_User_ID) === targetId) { target = rows[i]; break; }
  }
  if (!target) throw new Error('ไม่พบพนักงานคนนี้ในทะเบียน');

  var role = req.role === undefined ? String(target.Role) : String(req.role);
  if (['barista', 'manager', 'owner'].indexOf(role) === -1) throw new Error('สิทธิ์ไม่ถูกต้อง');
  var active = req.active === undefined ? isTrue(target.Active) : (req.active === true || req.active === 'true');
  var demoting = (role !== 'owner' || !active);

  if (targetId === String(me.LINE_User_ID) && demoting) {
    throw new Error('เปลี่ยนสิทธิ์ของตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ) — ให้เจ้าของอีกคนเปลี่ยนให้');
  }
  var activeOwners = rows.filter(function (r) {
    return isTrue(r.Active) && String(r.Role) === 'owner';
  });
  if (demoting && activeOwners.length <= 1 && String(activeOwners[0] && activeOwners[0].LINE_User_ID) === targetId) {
    throw new Error('ต้องเหลือเจ้าของที่ใช้งานได้อย่างน้อย 1 คน');
  }

  var idx = target._rowIndex;
  delete target._rowIndex;
  target.Role = role;
  target.Active = active;
  if (req.nickname !== undefined) target.Nickname = String(req.nickname).trim();
  updateRowObj(SHEET_TABS.STAFF, idx, target);
  return { id: targetId, name: target.Name, nickname: target.Nickname, role: role, active: active };
}

function actionSaveShift(req) {
  requireRole(req, 'manager');
  var date = String(req.date || '');
  var rows = readRows(SHEET_TABS.DAILY).filter(function (r) { return dateKey(r.Date) === date; });
  if (!rows.length) throw new Error('ไม่พบยอดของวันที่นี้');
  var rec = rows[rows.length - 1];
  var idx = rec._rowIndex;
  delete rec._rowIndex;
  rec.Staff_On_Shift = String(req.names || '').trim();
  updateRowObj(SHEET_TABS.DAILY, idx, rec);
  return { date: date, names: rec.Staff_On_Shift };
}

function findComPayRow(date) {
  var rows = readRows(SHEET_TABS.COM_PAY);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (dateKey(rows[i].Date) === date) return rows[i];
  }
  return null;
}

/** เลือกว่าค่าคอมของวันนี้เป็นของใคร (ยังไม่ถือว่าจ่าย) */
function actionAssignCommission(req) {
  requireRole(req, 'manager');
  var date = String(req.date || '');
  var staffName = String(req.staffName || '').trim();
  if (!staffName) throw new Error('เลือกพนักงานก่อน');

  var daily = readRows(SHEET_TABS.DAILY).filter(function (r) { return dateKey(r.Date) === date; });
  if (!daily.length) throw new Error('ไม่พบยอดของวันที่นี้');
  var amount = num(daily[daily.length - 1].Commission_Total);

  var existing = findComPayRow(date);
  if (existing) {
    if (existing.Status === 'paid') throw new Error('วันนี้จ่ายไปแล้ว (' + existing.Staff_Name + ') แก้ได้ในแท็บ CommissionPay');
    existing.Staff_Name = staffName;
    existing.Amount = amount;
    var keep = existing._rowIndex;
    delete existing._rowIndex;
    updateRowObj(SHEET_TABS.COM_PAY, keep, existing);
  } else {
    appendRowObj(SHEET_TABS.COM_PAY, {
      Date: date, Staff_Name: staffName, Amount: amount,
      Status: 'unpaid', Paid_At: '', Paid_By: '', Note: '',
    });
  }
  return { date: date, staffName: staffName, amount: amount };
}

function actionPayCommission(req) {
  var staff = requireRole(req, 'manager');
  var row = findComPayRow(String(req.date || ''));
  if (!row) throw new Error('ยังไม่ได้เลือกคนรับของวันนี้');
  row.Status = 'paid';
  row.Paid_At = new Date();
  row.Paid_By = staff.Name;
  var keep = row._rowIndex;
  delete row._rowIndex;
  updateRowObj(SHEET_TABS.COM_PAY, keep, row);
  return { paid: true };
}

/** จ่ายรวมทุกวันที่ค้างของพนักงานคนหนึ่งในเดือนนั้น */
function actionPayAllCommission(req) {
  var staff = requireRole(req, 'manager');
  var month = String(req.month || '');
  var staffName = String(req.staffName || '');
  var rows = readRows(SHEET_TABS.COM_PAY).filter(function (r) {
    return r.Staff_Name === staffName && r.Status === 'unpaid' &&
      dateKey(r.Date).indexOf(month) === 0;
  });
  if (!rows.length) throw new Error('ไม่มียอดค้างจ่ายของ ' + staffName);
  var total = 0;
  rows.forEach(function (r) {
    total += num(r.Amount);
    r.Status = 'paid';
    r.Paid_At = new Date();
    r.Paid_By = staff.Name;
    var keep = r._rowIndex;
    delete r._rowIndex;
    updateRowObj(SHEET_TABS.COM_PAY, keep, r);
  });
  return { paid: true, days: rows.length, total: total };
}

/** ยกเลิกสถานะ "จ่ายแล้ว" กลับเป็นค้างจ่าย — สำหรับกดผิดคน/กดผิดปุ่ม (เก็บประวัติไว้ใน Note) */
function actionUnpayCommission(req) {
  var staff = requireRole(req, 'manager');
  var row = findComPayRow(String(req.date || ''));
  if (!row || row.Status !== 'paid') throw new Error('วันนี้ยังไม่อยู่ในสถานะจ่ายแล้ว');
  row.Note = (row.Note ? row.Note + ' | ' : '') + 'ยกเลิกจ่าย (เดิมจ่ายให้ ' + row.Staff_Name + ') โดย ' + staff.Name;
  row.Status = 'unpaid';
  row.Paid_At = '';
  row.Paid_By = '';
  var keep = row._rowIndex;
  delete row._rowIndex;
  updateRowObj(SHEET_TABS.COM_PAY, keep, row);
  return { unpaid: true };
}

/** เลิกใช้วัตถุดิบ (เพิ่มผิด/เลิกขาย) — ซ่อนจากแอป ประวัติใน Sheet ยังอยู่ครบ */
function actionDisableIngredient(req) {
  requireRole(req, 'manager');
  var rows = readRows(SHEET_TABS.INGREDIENTS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Ingredient_ID === req.ingredientId) {
      rows[i].Active = false;
      rows[i].Updated_At = new Date();
      var keep = rows[i]._rowIndex;
      delete rows[i]._rowIndex;
      updateRowObj(SHEET_TABS.INGREDIENTS, keep, rows[i]);
      return { disabled: true };
    }
  }
  throw new Error('ไม่พบวัตถุดิบ');
}

/** บันทึกพร้อมเพย์ของพนักงาน (ใช้สร้างลิงก์จ่ายเงิน) */
function actionSaveStaffPay(req) {
  requireRole(req, 'manager');
  var staffName = String(req.staffName || '').trim();
  var promptpay = String(req.promptpay || '').replace(/[^0-9]/g, '');
  if (!staffName) throw new Error('ไม่พบชื่อพนักงาน');
  if (promptpay.length < 10) throw new Error('เบอร์พร้อมเพย์ไม่ถูกต้อง (10-13 หลัก)');

  var rows = readRows(SHEET_TABS.STAFF_PAY);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Staff_Name === staffName) {
      rows[i].PromptPay = promptpay;
      var keep = rows[i]._rowIndex;
      delete rows[i]._rowIndex;
      updateRowObj(SHEET_TABS.STAFF_PAY, keep, rows[i]);
      return { saved: true };
    }
  }
  appendRowObj(SHEET_TABS.STAFF_PAY, { Staff_Name: staffName, PromptPay: promptpay, Note: '' });
  return { saved: true };
}

// ═══════════════════════════════════════════════════════════════
//  ดึงรายงานปิดรอบ FoodStory จาก Gmail อัตโนมัติ
//  เงื่อนไข: Apps Script ต้องรันด้วยบัญชี Google เดียวกับที่รับอีเมล
//  เปิดใช้: รัน setupImportTrigger ครั้งเดียวใน editor (จะขอสิทธิ์ Gmail)
// ═══════════════════════════════════════════════════════════════

// ย้อนหลัง 7 วัน — กว้างพอให้กด force ซ่อมข้อมูลย้อนหลังได้ (กันซ้ำด้วย ImportLog อยู่แล้ว ไม่เปลือง)
var IMPORT_QUERY = 'from:noreply@foodstory.co subject:"Close Drawer Report" newer_than:7d';

/**
 * ตั้ง trigger ดึงอีเมล — รันซ้ำได้ปลอดภัย: ลบ trigger เก่าของฟังก์ชันนี้ทั้งหมด
 * แล้วสร้างใหม่แบบทุก 15 นาที (แบบรายชั่วโมงเคยหลับยาว อีเมลเข้า 17:40 กว่าจะดึงคือเช้าวันถัดไป)
 */
function setupImportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importDrawerReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('importDrawerReports').timeBased().everyMinutes(15).create();
  // รันทันทีหนึ่งรอบให้เห็นผลเลย
  return importDrawerReports();
}

/** ปุ่มในแอป: ดึงตอนนี้เลย — force = ดึงซ้ำอีเมลเดิมด้วย (ทับได้เฉพาะฉบับร่างอัตโนมัติ ไม่แตะของคน) */
function actionImportFromGmail(req) {
  requireStaff(req);
  return importDrawerReports(true);
}

// ⏱️ รอบอัตโนมัติทำงานเฉพาะช่วงเย็น 16:30–18:10 (อีเมลปิดรอบปกติเข้า ~16:30-17:40)
// และหยุดทันทีที่ยอดของวันนี้เข้าระบบแล้ว — นอกช่วงนี้ trigger ตื่นมาแล้วจบเลย ไม่แตะ Gmail
// ปุ่ม "ดึงตอนนี้เลย" ในแอป (force) ใช้ได้ตลอดเวลา ไม่ติดช่วงนี้
function inImportWindow_() {
  var now = new Date();
  var hm = Number(Utilities.formatDate(now, 'GMT+7', 'HHmm'));
  if (hm < 1630 || hm > 1810) return false;
  var today = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd');
  var got = readRows(SHEET_TABS.DAILY).some(function (r) { return dateKey(r.Date) === today; });
  return !got;   // ยอดวันนี้เข้าแล้ว = รอบที่เหลือของวันไม่ต้องทำอะไร
}

function importDrawerReports(force) {
  // ⚠️ trigger ตามเวลาจะยัด event object มาเป็น argument แรก — ถ้าไม่กรอง force จะเป็น true ทุกรอบ
  // (บั๊กเดิม: ดึงซ้ำ+ส่งการ์ดเข้ากลุ่มซ้ำทุก 15 นาที) force จริงต้องเป็น boolean true เท่านั้น
  force = (force === true);
  ensureSetup();
  if (!force && !inImportWindow_()) return { imported: [], skipped: 'นอกช่วงดึงอัตโนมัติ (16:30–18:10) หรือยอดวันนี้เข้าแล้ว' };
  var doneIds = {};
  readRows(SHEET_TABS.IMPORT_LOG).forEach(function (r) { doneIds[r.Message_ID] = true; });

  var results = [];
  var threads = GmailApp.search(IMPORT_QUERY);
  threads.forEach(function (th) {
    th.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (!force && doneIds[id]) return;
      var status;
      var parsed = null;
      try {
        parsed = parseDrawerReport(msg.getPlainBody());
        status = parsed && parsed.date ? saveImportedClose(parsed) : 'parse-failed';
      } catch (e) {
        status = 'error: ' + e.message;
      }
      if (!doneIds[id]) {
        appendRowObj(SHEET_TABS.IMPORT_LOG, {
          Message_ID: id,
          Date: parsed && parsed.date ? parsed.date : '',
          Imported_At: new Date(),
          Status: status,
        });
      }
      results.push({ date: parsed && parsed.date, status: status });
    });
  });
  return { imported: results };
}

/** ดึงเลขตัวสุดท้ายของบรรทัด เช่น "| By Cash | 4 | 233.50 |" → 233.50 */
function lastNum(line) {
  var m = String(line).replace(/\|/g, ' ').match(/(-?[\d,]+\.?\d*)\s*$/);
  return m ? num(m[1].replace(/,/g, '')) : 0;
}

/** ดึงเลข 2 ตัวท้ายของบรรทัด (count, amount) */
function lastTwoNums(line) {
  var nums = String(line).replace(/\|/g, ' ').match(/-?[\d,]+\.?\d*/g) || [];
  var take = nums.slice(-2).map(function (s) { return num(s.replace(/,/g, '')); });
  return take.length === 2 ? take : [0, take[0] || 0];
}

/**
 * แกะอีเมล "รายงานปิดรอบ" ของ FoodStory/Wongnai POS เป็น object
 * (ฟอร์แมตบรรทัดแบบ | ชื่อ | จำนวน | เงิน |)
 */
function parseDrawerReport(text) {
  var lines = String(text).split('\n').map(function (l) { return l.trim(); });
  var joined = lines.join('\n');

  // วันที่ของยอด: ใช้ "End Drawer Time" (วันปิดลิ้นชัก = วันขายจริง) เป็นหลัก
  // "ประจำวันที่" ของ FoodStory คือวันเปิดลิ้นชัก — ลิ้นชักที่เปิดค้างเย็นวันก่อน
  // จะทำให้ยอดของวันนี้ถูกตีตราเป็นเมื่อวาน (เจอจริง 18/8: หัวเขียน 17/08 แต่ยอดคือของ 18/8)
  var dm = joined.match(/End Drawer Time[\s\S]{0,40}?(\d{2})\/(\d{2})\/(\d{4})/)
        || joined.match(/ประจำวันที่\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dm) return null;
  var date = dm[3] + '-' + dm[2] + '-' + dm[1];

  function findLine(needle, exclude) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(needle) !== -1 && (!exclude || lines[i].indexOf(exclude) === -1)) return lines[i];
    }
    return '';
  }

  // ── หมวดขาย: ระหว่าง "Sales by Category" ถึง "Sub Total" ──
  // GAS getPlainBody() แปลงตาราง HTML ได้หลายแบบ ต้องรองรับทั้ง:
  //   1) "| SIGNATURE | 1 | 90.00 |"   2) "SIGNATURE 1 90.00"
  //   3) ชื่อกับตัวเลขแยกคนละบรรทัด
  var isNumLike = function (s) { return /^[-\d,.\s]+$/.test(String(s).trim()); };
  var numClean = function (s) { return num(String(s).replace(/,/g, '')); };
  var categories = [];
  var inCat = false;
  var pendName = null, pendNums = [];
  var flushPending = function () {
    if (pendName && pendNums.length >= 2) {
      categories.push({ name: pendName, count: pendNums[0], amount: pendNums[1] });
    }
    pendName = null; pendNums = [];
  };
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('Sales by Category') !== -1) { inCat = true; continue; }
    if (!inCat) continue;
    if (lines[i].indexOf('Sub Total') !== -1) { flushPending(); break; }
    var line = lines[i];
    if (!line) continue;

    var parts = line.split('|').map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length >= 3 && !isNumLike(parts[0]) && isNumLike(parts[1]) && isNumLike(parts[2])) {
      flushPending();
      categories.push({ name: parts[0], count: numClean(parts[1]), amount: numClean(parts[2]) });
      continue;
    }
    var m = line.match(/^(.+?)\s+(\d[\d,]*)\s+(-?[\d,]+\.\d{1,2})\s*$/);
    if (m && !isNumLike(m[1])) {
      flushPending();
      categories.push({ name: m[1].trim(), count: numClean(m[2]), amount: numClean(m[3]) });
      continue;
    }
    if (isNumLike(line)) {
      if (pendName) pendNums.push(numClean(line));
      continue;
    }
    // ข้อความล้วน = ชื่อหมวด (ฟอร์แมตแยกบรรทัด)
    flushPending();
    pendName = line.replace(/\|/g, '').trim();
  }

  // ส่วนลด = ทุกบรรทัดในหมวด "Discount & Promotions" (จนถึง Payments) — มีทั้ง Sub.TTL DC.(%)/(Amt)
  // และโปรสมาชิก "ซื้อ5แก้ว ฟรี1แก้ว" (บั๊กเดิมนับแค่ Sub.TTL DC → 23/9 ส่วนลดสมาชิก 55 บาทหาย)
  var promo = parsePromotions(lines);
  var discount = [promo.count, promo.amount];
  var tctLine = findLine('ไทยช่วยไทย') || findLine('By Custom Payment');
  var voidAll = lastTwoNums(findLine('Void All'));

  return {
    date: date,
    totalSales: lastNum(findLine('Total Sales')),
    cash: lastNum(findLine('By Cash')),
    creditCard: lastNum(findLine('By Credit Card')),
    thaiQR: lastNum(findLine('By Thai QR')),
    thaiChuayThai: lastNum(tctLine),
    // จำนวน "ครั้ง" ต่อช่องทาง (ตัวเลขกลางบรรทัด เช่น "| By Cash | 11 | 985.25 |") — ไว้โชว์ให้พนักงานแทนยอดบาท
    cashCount: lastTwoNums(findLine('By Cash'))[0],
    creditCount: lastTwoNums(findLine('By Credit Card'))[0],
    qrCount: lastTwoNums(findLine('By Thai QR'))[0],
    tctCount: lastTwoNums(tctLine)[0],
    discountCount: Math.abs(discount[0]),
    discountTotal: Math.abs(discount[1]),
    voidCount: voidAll[0],
    voidTotal: voidAll[1],
    guests: lastNum(findLine('Number of Guests')),
    bills: lastNum(findLine('Total Bills')),
    drawerExpected: lastNum(findLine('Expected in Drawer')),
    drawerActual: lastNum(findLine('Actual in Drawer')),
    drawerDiff: lastNum(findLine('Difference')),
    memberFreeCups: promo.memberCount,
    memberFreeValue: promo.memberAmount,
    categories: categories,
  };
}

/**
 * อ่านหมวด "Discount & Promotions" ทั้งหมด → รวมส่วนลด + แยกยอดโปรสมาชิก
 * บรรทัดเช่น "| โปรโมชั่นสำหรับสมาชิกซื้อ5แก้ว ฟรี1แก้ว | 1 | -55.00 |" → ตัวเลข 2 ตัวท้าย = ครั้ง, ยอด
 * (ตัวเลขในชื่อโปร เช่น 5, 1 ไม่กระทบเพราะหยิบ 2 ตัวท้ายเสมอ)
 */
function parsePromotions(lines) {
  var out = { count: 0, amount: 0, memberCount: 0, memberAmount: 0 };
  var start = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('Discount & Promotions') !== -1) { start = i + 1; break; }
  }
  var take = function (l) {
    var d = lastTwoNums(l);
    if (!d[1]) return;
    out.count += Math.abs(d[0]);
    out.amount += Math.abs(d[1]);
    if (/สมาชิก|member/i.test(l)) {
      out.memberCount += Math.abs(d[0]);
      out.memberAmount += Math.abs(d[1]);
    }
  };
  if (start >= 0) {
    for (var j = start; j < lines.length; j++) {
      if (/Payments|By Cash|Total Revenue/.test(lines[j])) break;
      if (lines[j]) take(lines[j]);
    }
  } else {
    // รายงานรูปแบบเก่าที่ไม่มีหัวหมวด — ใช้วิธีเดิม
    lines.forEach(function (l) { if (l.indexOf('Sub.TTL DC') !== -1) take(l); });
  }
  out.amount = Math.round(out.amount * 100) / 100;
  out.memberAmount = Math.round(out.memberAmount * 100) / 100;
  return out;
}

/** จับชื่อหมวดจากอีเมลเข้ากับ Category_ID ในระบบ (ตัด emoji/ช่องว่าง เทียบแบบหลวม) */
function normalizeCatName(s) {
  return String(s).toUpperCase()
    .replace(/[^A-Z฀-๿]/g, ''); // เหลือแค่ตัวอักษรอังกฤษ+ไทย
}

function saveImportedClose(parsed) {
  var date = parsed.date;
  var existing = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date) === date;
  });
  if (existing.length && existing[existing.length - 1].Submitted_By !== AUTO_SUBMITTER) {
    return 'skipped-human-record'; // มีคนปิดยอดเองแล้ว ไม่ทับของคน
  }
  if (existing.length) {
    // ยอดเดิมตรงกับอีเมลทุกบาทอยู่แล้ว → ไม่ต้องเซฟใหม่ ไม่ส่งการ์ดซ้ำ (กัน force/อีเมลส่งซ้ำสแปมกลุ่ม)
    // เทียบส่วนลดด้วย — ไม่งั้น force ซ่อมข้อมูลส่วนลดที่เคยบันทึกขาดไม่ได้ (ยอดรวมเท่าเดิม)
    var last = existing[existing.length - 1];
    if (num(last.Total_Sales) === num(parsed.totalSales) && num(last.Cash) === num(parsed.cash)
        && num(last.Discount_Total) === num(parsed.discountTotal)) {
      return 'unchanged';
    }
  }
  if (existing.length) {
    // ทับฉบับร่างเก่าของตัวเอง (เช่นอีเมลส่งซ้ำ/แก้)
    var sheet = getSheet(SHEET_TABS.DAILY);
    existing.sort(function (a, b) { return b._rowIndex - a._rowIndex; })
      .forEach(function (r) { sheet.deleteRow(r._rowIndex); });
    deleteRowsByDate(SHEET_TABS.SALES_ROWS, date);
  }

  var cats = readRows(SHEET_TABS.CATEGORIES).filter(function (c) { return isTrue(c.Active); });
  var config = getConfig();
  var rate = num(config.COMMISSION_PER_CUP || 3);

  // จับคู่หมวดจากอีเมล → Category_ID (ไม่เจอ = สร้างหมวดใหม่ให้เลย ไม่นับค่าคอม)
  var categoryCounts = {};
  var noteExtra = [];
  parsed.categories.forEach(function (pc) {
    var match = null;
    for (var i = 0; i < cats.length; i++) {
      if (normalizeCatName(cats[i].Name) === normalizeCatName(pc.name)) { match = cats[i]; break; }
    }
    if (!match) {
      var newId = 'cat-' + Date.now() + '-' + Math.floor(num(pc.amount));
      appendRowObj(SHEET_TABS.CATEGORIES, {
        Category_ID: newId, Name: pc.name, Emoji: '', Unit: 'รายการ',
        Count_Commission: false, Sort_Order: 50, Active: true,
      });
      match = { Category_ID: newId, Name: pc.name, Unit: 'รายการ', Count_Commission: false };
      cats.push(match);
      noteExtra.push('หมวดใหม่จาก POS: ' + pc.name + ' (ตั้งไม่นับค่าคอมไว้ก่อน)');
    }
    categoryCounts[match.Category_ID] = pc.count;
  });

  var cups = calcCommissionCups(categoryCounts, cats);
  var transfer = parsed.thaiQR + parsed.creditCard;
  if (parsed.creditCard > 0) noteExtra.push('รวมบัตรเครดิต ' + fmtMoney(parsed.creditCard) + ' ในเงินโอน');
  noteExtra.push('ลูกค้า ' + parsed.guests + ' คน / ' + parsed.bills + ' บิล');
  // จำนวนครั้งต่อช่องทาง — หน้าแอปโหมดพนักงานอ่านจาก Note (ไม่เพิ่มคอลัมน์ กันชีตเก่าพัง)
  noteExtra.push('ช่องทาง: เงินสด ' + num(parsed.cashCount) + ' / โอน ' + (num(parsed.qrCount) + num(parsed.creditCount)) +
    ' / ไทยช่วยไทย ' + num(parsed.tctCount) + ' ครั้ง');
  if (num(parsed.memberFreeCups) > 0) {
    noteExtra.push('สมาชิกแลกฟรี ' + num(parsed.memberFreeCups) + ' แก้ว');
  }
  if (parsed.drawerDiff !== 0) {
    noteExtra.push('ลิ้นชัก: คาด ' + fmtMoney(parsed.drawerExpected) + ' จริง ' +
      fmtMoney(parsed.drawerActual) + ' (' + (parsed.drawerDiff > 0 ? '+' : '') + fmtMoney(parsed.drawerDiff) + ')');
  }

  var record = {
    Date: date,
    Total_Sales: parsed.totalSales,
    Cash: parsed.cash,
    Thai_Chuay_Thai: parsed.thaiChuayThai,
    Transfer: transfer,
    Cash_Over: 0,
    Channel_Diff: Math.round((parsed.cash + parsed.thaiChuayThai + transfer - parsed.totalSales) * 100) / 100,
    Discount_Count: parsed.discountCount,
    Discount_Total: parsed.discountTotal,
    Void_Count: parsed.voidCount,
    Void_Total: parsed.voidTotal,
    Category_Counts_JSON: JSON.stringify(categoryCounts),
    Premium_Counts_JSON: '{}',
    Commission_Cups: cups,
    Commission_Rate: rate,
    Commission_Total: Math.round(cups * rate * 100) / 100,
    Staff_On_Shift: '',
    Note: '📩 ดึงจากอีเมล POS | ' + noteExtra.join(' | '),
    Submitted_By: AUTO_SUBMITTER,
    Submitted_At: new Date(),
  };
  appendRowObj(SHEET_TABS.DAILY, record);

  cats.forEach(function (c) {
    appendRowObj(SHEET_TABS.SALES_ROWS, {
      Date: date, Type: 'category', Name: c.Name,
      Count: num(categoryCounts[c.Category_ID]), Unit: c.Unit,
    });
  });

  // ส่งการ์ด (จำนวนแก้ว/รายการ ไม่มีตัวเงิน) เข้ากลุ่มทันทีที่ยอดเข้า
  pushDailySummary(record, cats, [], config);
  // ตัวเงิน+ค่าคอมส่งเข้า DM ผู้บริหารแยกต่างหาก
  try { pushOwnerMoneySummary(record, config); } catch (e) { console.error('ownerSummary: ' + e); }

  // เตือนของใกล้หมด/เบิกซื้อค้าง เฉพาะเมื่อมีจริงเท่านั้น (ไม่มี = เงียบไว้ ไม่รกแชท)
  var ops = buildOpsAlertText();
  if (ops) notifyGroup(ops);

  return 'imported';
}

/**
 * ข้อความเตือนงานหน้าร้าน: วัตถุดิบใกล้หมด + เบิกซื้อที่ค้างอยู่
 * คืน '' ถ้าไม่มีอะไรต้องเตือน — คนเรียกต้องเช็คก่อนส่ง จะได้ไม่ spam กลุ่ม
 */
function buildOpsAlertText() {
  var lines = [];

  // ไม่ลิสต์ของใกล้หมดในกลุ่มแล้ว (ถ้าใกล้หมดพนักงานแจ้งกันเอง) — เตือนแค่ "วันนี้ยังไม่มีใครกดเช็คสต๊อก"
  if (!todayStockCheck()) {
    lines.push('อย่าลืมเช็คสต๊อกนะคะ 🙏');
    lines.push('(เปิดแอป → 📦 สต๊อก → ดูของแล้วกด ✅ เช็คสต๊อกแล้ว)');
  }

  var open = readRows(SHEET_TABS.PURCHASES).filter(function (p) {
    return p.Status === 'pending' || p.Status === 'approved';
  });
  if (open.length) {
    if (lines.length) lines.push('');
    lines.push('🛒 เบิกซื้อที่ค้างอยู่:');
    open.forEach(function (p) {
      lines.push('• ' + p.Items +
        (p.Status === 'pending'
          ? ' (รออนุมัติ · ขอโดย ' + nickOf(p.Requested_By) + ')'
          : ' (อนุมัติแล้ว รอซื้อ)'));
    });
  }

  if (!lines.length) return '';
  return '📦 เช็คของหน่อยนะคะ\n' + lines.join('\n');
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
//  📚 นำเข้ายอดย้อนหลัง 1–12 ส.ค. 2569 (ช่วงก่อนมีระบบ)
//  ที่มา: รูปสรุปยอดในไลน์ โฟลเดอร์ Drive "ยอดขายร้านกาแฟ" — คุณเลขาแกะตัวเลขให้แล้ว
//  วิธีใช้: รันมือครั้งเดียวใน editor (เลือกฟังก์ชัน seedHistoricalCloses → Run)
//  ปลอดภัย: วันที่มีข้อมูลอยู่แล้วจะข้ามเสมอ ไม่ทับ และไม่ส่งการ์ดเข้ากลุ่ม
// ═══════════════════════════════════════════════════════════════
function seedHistoricalCloses() {
  ensureSetup();
  var DATA = [
    { date: '2026-08-01', total: 2399, cash: 287, tct: 1327.65, transfer: 783, over: 0, dcN: 20, dcT: 546,
      cats: { coffee: 23, 'premium-coffee': 2, 'non-coffee': 12, matcha: 3, beer: 5, bakery: 1 },
      prem: { 'eth-natural': 1 }, note: 'ส่วนลดพนักงาน 18 + เฮียเมธี/เจ้แหม่ม 2' },
    { date: '2026-08-02', total: 2601.50, cash: 700, tct: 1368.75, transfer: 533.75, over: 1, dcN: 11, dcT: 206.50,
      cats: { coffee: 14, 'non-coffee': 15, matcha: 4, 'soft-cream': 1, soda: 3, bakery: 12 },
      note: 'ส่วนลดพนักงาน 6 + เฮียเมธี/เจ้แหม่ม 5' },
    { date: '2026-08-03', total: 1329.75, cash: 81, tct: 790.50, transfer: 401.25, over: 1, dcN: 16, dcT: 320.25,
      cats: { signature: 1, coffee: 8, 'premium-coffee': 6, 'non-coffee': 4, matcha: 2, soda: 2, bakery: 4 },
      prem: { 'eth-strawberry': 1, 'eth-natural': 1, 'gummy-berries': 4 },
      note: 'เงินสดหลังหัก Visa 60 (ต้นฉบับ 139.75-60=81) | ส่วนลดพนักงาน 12 + เฮียเมธี/เจ้แหม่ม 4' },
    { date: '2026-08-04', total: 2219.50, cash: 120, tct: 1880.75, transfer: 218.75, over: 0, dcN: 17, dcT: 430.50,
      cats: { coffee: 16, 'premium-coffee': 2, 'non-coffee': 10, matcha: 2, 'soft-cream': 3, soda: 7, bakery: 7 },
      note: 'Cake 7 ชิ้น นับรวมใน Bakery' },
    { date: '2026-08-05', total: 2920.55, cash: 120, tct: 2272, transfer: 527, over: 0, dcN: 16, dcT: 446.45,
      cats: { coffee: 21, 'premium-coffee': 7, 'non-coffee': 11, matcha: 5, soda: 2, bakery: 6 } },
    { date: '2026-08-06', total: 2209.25, cash: 310, tct: 1380.75, transfer: 519.25, over: 1.75, dcN: 9, dcT: 295.75,
      cats: { coffee: 10, 'premium-coffee': 4, 'non-coffee': 3, matcha: 2, 'soft-cream': 1, soda: 4, beer: 2, bakery: 1 },
      prem: { 'premium-beans': 2 } },
    { date: '2026-08-07', total: 2522.50, cash: 410, tct: 1617, transfer: 492.50, over: 0, dcN: 10, dcT: 192.50,
      cats: { signature: 1, coffee: 17, 'premium-coffee': 1, 'non-coffee': 11, matcha: 2, 'soft-cream': 7, soda: 1, bakery: 4 },
      note: 'หัวข้อความสรุปเขียน 6/8 แต่รายงานหมวดระบุ 7/8 — ยึด 7/8' },
    { date: '2026-08-08', total: 2076.75, cash: 568.50, tct: 1031.25, transfer: 477.50, over: 2.50, dcN: 7, dcT: 152.25,
      cats: { signature: 2, coffee: 10, 'premium-coffee': 2, 'non-coffee': 4, matcha: 6, 'soft-cream': 2, dirty: 1, soda: 2, bakery: 7 } },
    { date: '2026-08-09', total: 5193.25, cash: 419, tct: 3470, transfer: 1304.75, over: 1, dcN: 3, dcT: 113.75,
      cats: { coffee: 17, 'premium-coffee': 10, 'non-coffee': 16, matcha: 7, 'soft-cream': 7, soda: 2, beer: 1, bakery: 20 },
      note: 'มีย้ายยอดข้ามช่อง ±60 ตามที่ทีมจดไว้ (เงินสด 359+60 / ไทยช่วยไทย 3529.50-60)' },
    { date: '2026-08-10', total: 3101.75, cash: 240, tct: 2165, transfer: 699, over: 0, dcN: 4, dcT: 113.25,
      cats: { coffee: 17, 'premium-coffee': 2, 'non-coffee': 11, matcha: 10, 'soft-cream': 4, soda: 1, bakery: 8 },
      note: 'ทีมจดว่าไทยช่วยไทยเกินมา 2.25' },
    { date: '2026-08-11', total: 2876, cash: 209.75, tct: 1831, transfer: 835.25, over: 0.25, dcN: 17, dcT: 367,
      cats: { signature: 1, coffee: 21, 'non-coffee': 14, matcha: 5, 'soft-cream': 3, bakery: 10 } },
    { date: '2026-08-12', total: 5825.75, cash: 589.75, tct: 3202, transfer: 2035.50, over: 1.25, dcN: 7, dcT: 264.25,
      cats: { signature: 1, coffee: 15, 'premium-coffee': 8, 'non-coffee': 20, matcha: 8, 'soft-cream': 11, dirty: 1, soda: 8, beer: 1, bakery: 12 },
      prem: { 'premium-beans': 2 } },
    { date: '2026-08-14', total: 2494.50, cash: 527, tct: 718, transfer: 1249, over: 3, dcN: 7, dcT: 150.50,
      cats: { coffee: 14, 'non-coffee': 12, matcha: 6, 'soft-cream': 3, soda: 2, bakery: 5 },
      note: 'Plum wine 1 (ไม่มีหมวดในระบบ ไม่นับค่าคอม)' },
  ];

  var cats = readRows(SHEET_TABS.CATEGORIES).filter(function (c) { return isTrue(c.Active); });
  var rate = num(getConfig().COMMISSION_PER_CUP || 3);
  var have = {};
  readRows(SHEET_TABS.DAILY).forEach(function (r) { have[dateKey(r.Date)] = true; });

  var added = [], skipped = [];
  DATA.forEach(function (d) {
    if (have[d.date]) { skipped.push(d.date); return; }
    var cups = calcCommissionCups(d.cats, cats);
    appendRowObj(SHEET_TABS.DAILY, {
      Date: d.date, Total_Sales: d.total, Cash: d.cash, Thai_Chuay_Thai: d.tct, Transfer: d.transfer,
      Cash_Over: d.over,
      Channel_Diff: Math.round((d.cash + d.tct + d.transfer - d.total) * 100) / 100,
      Discount_Count: d.dcN, Discount_Total: d.dcT, Void_Count: 0, Void_Total: 0,
      Category_Counts_JSON: JSON.stringify(d.cats), Premium_Counts_JSON: JSON.stringify(d.prem || {}),
      Commission_Cups: cups, Commission_Rate: rate, Commission_Total: Math.round(cups * rate * 100) / 100,
      Staff_On_Shift: '',
      Note: '📚 นำเข้าย้อนหลังจากรูปสรุปในไลน์' + (d.note ? ' | ' + d.note : ''),
      Submitted_By: 'บันทึกย้อนหลัง', Submitted_At: new Date(),
    });
    cats.forEach(function (c) {
      appendRowObj(SHEET_TABS.SALES_ROWS, {
        Date: d.date, Type: 'category', Name: c.Name,
        Count: num(d.cats[c.Category_ID]), Unit: c.Unit,
      });
    });
    added.push(d.date.slice(8) + '/8=' + d.total);
  });
  var msg = '✅ เพิ่ม ' + added.length + ' วัน [' + added.join(', ') + ']'
          + (skipped.length ? ' | ข้าม (มีอยู่แล้ว): ' + skipped.join(', ') : '');
  Logger.log(msg);
  return msg;
}

// ═══════════════════════════════════════════════════════════════
//  🎫 ระบบสมาชิก Old Days (คู่กับโปรสมาชิกใน LMWN POS)
//
//  กติกา: ค่าสมาชิก 100 ฿ → รับเทียนหอม 1 ชิ้น (เลือกกลิ่น) · อายุ 6 เดือนนับจากวันสมัคร
//         ซื้อครบ 5 แก้ว ฟรี 1 แก้ว (เมนูไหนก็ได้) — แก้วฟรีไม่นับเป็นแต้ม
//  ปรับตัวเลขได้ในแท็บ Config: MEMBER_FEE / MEMBER_MONTHS / MEMBER_STAMPS
//
//  ข้อมูลแต้ม "คำนวณจากสมุดบันทึก" (MemberLog) ทุกครั้ง ไม่เก็บตัวเลขสำเร็จรูป
//  → ลบรายการที่กดผิด = แต้มถูกต้องเองทันที ไม่มีวันเพี้ยน
// ═══════════════════════════════════════════════════════════════

function memberRules() {
  var c = getConfig();
  return {
    fee: num(c.MEMBER_FEE || 100),
    months: num(c.MEMBER_MONTHS || 6),
    stamps: num(c.MEMBER_STAMPS || 5),
  };
}

/** บวกเดือนให้วันที่ 'yyyy-MM-dd' — ปลายเดือนตัดให้พอดี (31 ส.ค. + 6 = 28/29 ก.พ.) */
function addMonthsISO(iso, n) {
  var p = String(iso).slice(0, 10).split('-').map(Number);
  var y = p[0], m = p[1] - 1 + n, d = p[2];
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + Math.min(d, last)).slice(-2);
}

/** จำนวนวันจาก a ถึง b ('yyyy-MM-dd') — ติดลบถ้า b อยู่ก่อน a */
function daysBetweenISO(a, b) {
  var pa = String(a).split('-').map(Number), pb = String(b).split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

function todayKey() { return dateKey(new Date()); }
function isoTime(v) { var d = new Date(v); return isNaN(d.getTime()) ? '' : d.toISOString(); }
function normPhone(v) { return String(v || '').replace(/[^0-9]/g, ''); }

/**
 * สรุปสถานะสมาชิกหนึ่งคนจากสมุดบันทึก (pure — เทสได้)
 * buy = แก้วที่จ่ายเงิน (ได้แต้ม) · redeem = แลกแก้วฟรี · adjust = ปรับแต้มมือ/ยอดยกมา (+/-)
 */
function summarizeMember(m, logs, rules, today) {
  var paid = 0, redeemed = 0, visits = 0, fees = 0, last = '';
  (logs || []).forEach(function (l) {
    var t = String(l.Type);
    var ts = l.Timestamp ? dateKey(l.Timestamp) : '';
    if (t === 'buy') { paid += num(l.Cups); visits++; }
    else if (t === 'redeem') { redeemed += num(l.Cups) || 1; visits++; }
    else if (t === 'adjust') { paid += num(l.Cups); }
    else if (t === 'join' || t === 'renew') { fees += num(l.Amount); }
    if ((t === 'buy' || t === 'redeem') && ts > last) last = ts;
  });
  paid = Math.max(0, paid);
  var n = rules.stamps || 5;
  var earned = Math.floor(paid / n);
  var expires = dateKey(m.Expires_At);
  var daysLeft = expires ? daysBetweenISO(today, expires) : 0;
  var status = String(m.Status || 'active') === 'cancelled' ? 'cancelled'
    : (daysLeft < 0 ? 'expired' : (daysLeft <= 30 ? 'expiring' : 'active'));
  return {
    id: String(m.Member_ID), name: String(m.Name || ''), nickname: String(m.Nickname || ''),
    phone: String(m.Phone || ''), joinedAt: dateKey(m.Joined_At), expiresAt: expires,
    daysLeft: daysLeft, status: status, scent: String(m.Candle_Scent || ''),
    source: String(m.Source || 'shop'), lmwnRef: String(m.LMWN_Ref || ''), note: String(m.Note || ''),
    paidCups: paid, redeemed: redeemed, earned: earned,
    available: Math.max(0, earned - redeemed), progress: paid % n, stampsPer: n,
    visits: visits, lastVisit: last, fees: fees,
  };
}

function memberLogsById() {
  var by = {};
  readRows(SHEET_TABS.MEMBER_LOG).forEach(function (l) {
    var k = String(l.Member_ID);
    (by[k] = by[k] || []).push(l);
  });
  return by;
}

function findMemberRow(id) {
  var rows = readRows(SHEET_TABS.MEMBERS);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].Member_ID) === String(id)) return rows[i];
  return null;
}

function nextMemberId() {
  var max = 0;
  readRows(SHEET_TABS.MEMBERS).forEach(function (r) {
    var m = String(r.Member_ID).match(/^M(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'M' + ('000' + (max + 1)).slice(-4);
}

function logMember(memberId, type, cups, amount, scentId, note, by) {
  var id = 'L' + Date.now() + Math.floor(Math.random() * 1000);
  appendRowObj(SHEET_TABS.MEMBER_LOG, {
    Log_ID: id, Timestamp: new Date(), Member_ID: memberId, Type: type,
    Cups: num(cups), Amount: num(amount), Scent_ID: scentId || '', Note: note || '', By: by || '',
  });
  return id;
}

/** แจกเทียน 1 ชิ้น: ตัดสต๊อก + จดสมุดเทียน — กลิ่นหมดสต๊อก = error ให้เลือกกลิ่นอื่น */
function giveCandle(scentId, memberId, by, note) {
  if (!scentId || scentId === 'none') return null;
  var rows = readRows(SHEET_TABS.CANDLES);
  var c = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].Scent_ID) === String(scentId)) { c = rows[i]; break; }
  if (!c || !isTrue(c.Active)) throw new Error('ไม่พบกลิ่นเทียนนี้');
  var bal = num(c.Stock);
  if (bal < 1) throw new Error('เทียน' + c.Name + ' หมดสต๊อกแล้ว — เลือกกลิ่นอื่นนะ');
  var idx = c._rowIndex; delete c._rowIndex;
  c.Stock = bal - 1;
  updateRowObj(SHEET_TABS.CANDLES, idx, c);
  appendRowObj(SHEET_TABS.CANDLE_LOG, {
    Timestamp: new Date(), Scent_ID: scentId, Scent_Name: c.Name, Type: 'give', Qty: 1,
    Balance_After: c.Stock, Member_ID: memberId || '', Note: note || '', By: by || '',
  });
  return c;
}

function candleList() {
  return readRows(SHEET_TABS.CANDLES)
    .filter(function (c) { return isTrue(c.Active); })
    .sort(function (a, b) { return num(a.Sort_Order) - num(b.Sort_Order); })
    .map(function (c) {
      return { id: String(c.Scent_ID), name: String(c.Name), emoji: String(c.Emoji || '🕯️'),
        stock: num(c.Stock), min: num(c.Min_Stock) };
    });
}

// ── อ่าน ──────────────────────────────────────────────────────

function actionGetMembers(req) {
  var staff = requireStaff(req);
  var canMoney = (ROLE_LEVEL[staff.Role] || 0) >= ROLE_LEVEL.manager;
  var rules = memberRules();
  var today = todayKey();
  var month = today.slice(0, 7);
  var logsBy = memberLogsById();

  var members = readRows(SHEET_TABS.MEMBERS).map(function (m) {
    var s = summarizeMember(m, logsBy[String(m.Member_ID)], rules, today);
    if (!canMoney) delete s.fees;
    return s;
  });

  var stats = { active: 0, expiring: 0, expired: 0, newThisMonth: 0, rewardsWaiting: 0,
    redeemedThisMonth: 0, cupsThisMonth: 0 };
  if (canMoney) stats.feesThisMonth = 0;
  members.forEach(function (m) {
    if (m.status === 'active' || m.status === 'expiring') { stats.active++; stats.rewardsWaiting += m.available; }
    if (m.status === 'expiring') stats.expiring++;
    if (m.status === 'expired') stats.expired++;
    if (m.joinedAt.slice(0, 7) === month) stats.newThisMonth++;
  });
  Object.keys(logsBy).forEach(function (k) {
    logsBy[k].forEach(function (l) {
      if (dateKey(l.Timestamp).slice(0, 7) !== month) return;
      if (l.Type === 'redeem') stats.redeemedThisMonth += num(l.Cups) || 1;
      if (l.Type === 'buy') stats.cupsThisMonth += num(l.Cups);
      if (canMoney && (l.Type === 'join' || l.Type === 'renew')) stats.feesThisMonth += num(l.Amount);
    });
  });

  return { members: members, candles: candleList(), stats: stats, rules: rules, today: today };
}

function actionGetMember(req) {
  var staff = requireStaff(req);
  var isMgr = (ROLE_LEVEL[staff.Role] || 0) >= ROLE_LEVEL.manager;
  var m = findMemberRow(req.memberId);
  if (!m) throw new Error('ไม่พบสมาชิก');
  var logs = memberLogsById()[String(m.Member_ID)] || [];
  var today = todayKey();
  var s = summarizeMember(m, logs, memberRules(), today);
  if (!isMgr) delete s.fees;
  s.payMethod = String(m.Pay_Method || '');
  s.createdBy = String(m.Created_By || '');
  var history = logs.slice().sort(function (a, b) {
    return new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime();
  }).map(function (l) {
    var t = String(l.Type);
    var mine = String(l.By) === String(staff.Name) && dateKey(l.Timestamp) === today;
    return {
      id: String(l.Log_ID), at: isoTime(l.Timestamp),
      type: t, cups: num(l.Cups), amount: isMgr ? num(l.Amount) : undefined,
      scent: String(l.Scent_ID || ''), note: String(l.Note || ''), by: String(l.By || ''),
      canUndo: (t === 'buy' || t === 'redeem' || t === 'adjust') && (isMgr || mine),
    };
  });
  return { member: s, history: history, candles: candleList(), rules: memberRules() };
}

// ── เขียน ─────────────────────────────────────────────────────

function actionCreateMember(req) {
  var staff = requireStaff(req);
  var rules = memberRules();
  var name = String(req.name || '').trim();
  if (!name) throw new Error('กรอกชื่อสมาชิกก่อน');
  var phone = normPhone(req.phone);
  if (phone) {
    var dup = readRows(SHEET_TABS.MEMBERS).filter(function (r) {
      return normPhone(r.Phone) === phone && String(r.Status) !== 'cancelled';
    })[0];
    if (dup) throw new Error('เบอร์นี้เป็นสมาชิกอยู่แล้ว: ' + dup.Name + ' (' + dup.Member_ID + ') — ถ้าหมดอายุให้กด "ต่ออายุ" แทน');
  }
  var joined = /^\d{4}-\d{2}-\d{2}$/.test(String(req.joinedAt || '')) ? String(req.joinedAt) : todayKey();
  if (joined > todayKey()) throw new Error('วันที่สมัครต้องไม่เป็นวันในอนาคต');
  var expires = addMonthsISO(joined, rules.months);
  var source = req.source === 'lmwn' ? 'lmwn' : 'shop';
  var payMethod = String(req.payMethod || 'cash');
  var feePaid = payMethod === 'none' ? 0 : rules.fee;
  var id = nextMemberId();

  // แจกเทียนก่อน — ถ้าหมดสต๊อกจะ error ออกไปก่อนสร้างสมาชิก (ไม่มีข้อมูลครึ่งๆ กลางๆ)
  var scent = String(req.scentId || 'none');
  giveCandle(scent, id, staff.Name, 'แถมสมัครสมาชิก');

  appendRowObj(SHEET_TABS.MEMBERS, {
    Member_ID: id, Name: name, Nickname: String(req.nickname || '').trim(), Phone: phone,
    Joined_At: joined, Expires_At: expires, Candle_Scent: scent === 'none' ? '' : scent,
    Fee: feePaid, Pay_Method: payMethod, Source: source, LMWN_Ref: String(req.lmwnRef || '').trim(),
    Status: 'active', Note: String(req.note || '').trim(), Created_By: staff.Name, Created_At: new Date(),
  });
  logMember(id, 'join', 0, feePaid, scent === 'none' ? '' : scent,
    (source === 'lmwn' ? 'ย้ายจาก LMWN' : 'สมัครที่ร้าน') + (payMethod === 'none' ? ' · ไม่เก็บค่าสมาชิก' : ''), staff.Name);

  var carry = Math.max(0, Math.floor(num(req.initialCups)));
  if (carry) logMember(id, 'adjust', carry, 0, '', 'แก้วสะสมยกมา' + (source === 'lmwn' ? 'จาก LMWN' : ''), staff.Name);

  var s = summarizeMember(findMemberRow(id), memberLogsById()[id], rules, todayKey());
  return { member: s };
}

function requireLiveMember(id) {
  var m = findMemberRow(id);
  if (!m) throw new Error('ไม่พบสมาชิก');
  var s = summarizeMember(m, memberLogsById()[String(id)], memberRules(), todayKey());
  if (s.status === 'cancelled') throw new Error('สมาชิกนี้ถูกยกเลิกแล้ว');
  if (s.status === 'expired') throw new Error('สมาชิกหมดอายุแล้ว (' + s.expiresAt + ') — ต่ออายุก่อนถึงจะสะสม/แลกได้');
  return { row: m, sum: s };
}

function actionAddMemberCups(req) {
  var staff = requireStaff(req);
  var cups = Math.floor(num(req.cups));
  if (cups < 1 || cups > 30) throw new Error('จำนวนแก้วต้องอยู่ระหว่าง 1–30');
  var before = requireLiveMember(req.memberId).sum;
  logMember(before.id, 'buy', cups, 0, '', String(req.note || ''), staff.Name);
  var after = summarizeMember(findMemberRow(before.id), memberLogsById()[before.id], memberRules(), todayKey());
  return { member: after, newRewards: after.earned - before.earned };
}

function actionRedeemMember(req) {
  var staff = requireStaff(req);
  var s = requireLiveMember(req.memberId).sum;
  if (s.available < 1) throw new Error('ยังไม่มีแก้วฟรีให้แลก (สะสม ' + s.progress + '/' + s.stampsPer + ')');
  logMember(s.id, 'redeem', 1, 0, '', String(req.note || ''), staff.Name);
  return { member: summarizeMember(findMemberRow(s.id), memberLogsById()[s.id], memberRules(), todayKey()) };
}

function actionRenewMember(req) {
  var staff = requireStaff(req);
  var rules = memberRules();
  var m = findMemberRow(req.memberId);
  if (!m) throw new Error('ไม่พบสมาชิก');
  var today = todayKey();
  var cur = dateKey(m.Expires_At);
  // ต่อก่อนหมด = ต่อจากวันหมดอายุเดิม (ไม่เสียวันที่เหลือ) · หมดแล้ว = นับใหม่จากวันนี้
  var base = cur && cur >= today ? cur : today;
  var newExp = addMonthsISO(base, rules.months);
  var payMethod = String(req.payMethod || 'cash');
  var fee = payMethod === 'none' ? 0 : rules.fee;
  var scent = String(req.scentId || 'none');
  giveCandle(scent, m.Member_ID, staff.Name, 'แถมต่ออายุสมาชิก');

  var idx = m._rowIndex; delete m._rowIndex;
  m.Expires_At = newExp;
  m.Status = 'active';
  if (scent !== 'none') m.Candle_Scent = scent;
  updateRowObj(SHEET_TABS.MEMBERS, idx, m);
  logMember(m.Member_ID, 'renew', 0, fee, scent === 'none' ? '' : scent,
    'ต่ออายุถึง ' + newExp + (payMethod === 'none' ? ' · ไม่เก็บค่าสมาชิก' : ''), staff.Name);
  return { member: summarizeMember(findMemberRow(m.Member_ID), memberLogsById()[String(m.Member_ID)], rules, today) };
}

/** แก้ข้อมูลสมาชิก / ยกเลิก / เปิดใหม่ / ปรับแต้ม (ผู้บริหารขึ้นไป) */
function actionUpdateMember(req) {
  var staff = requireRole(req, 'manager');
  var m = findMemberRow(req.memberId);
  if (!m) throw new Error('ไม่พบสมาชิก');
  var idx = m._rowIndex; delete m._rowIndex;
  if (req.name !== undefined) {
    if (!String(req.name).trim()) throw new Error('ชื่อต้องไม่ว่าง');
    m.Name = String(req.name).trim();
  }
  if (req.nickname !== undefined) m.Nickname = String(req.nickname).trim();
  if (req.phone !== undefined) m.Phone = normPhone(req.phone);
  if (req.note !== undefined) m.Note = String(req.note).trim();
  if (req.expiresAt !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.expiresAt))) throw new Error('วันหมดอายุไม่ถูกต้อง');
    m.Expires_At = String(req.expiresAt);
  }
  if (req.status === 'cancelled' || req.status === 'active') m.Status = req.status;
  updateRowObj(SHEET_TABS.MEMBERS, idx, m);
  var adj = Math.round(num(req.adjustCups));
  if (adj) logMember(m.Member_ID, 'adjust', adj, 0, '', String(req.adjustNote || 'ปรับแต้มโดยผู้บริหาร'), staff.Name);
  return { member: summarizeMember(findMemberRow(m.Member_ID), memberLogsById()[String(m.Member_ID)], memberRules(), todayKey()) };
}

/** ยกเลิกรายการที่กดผิด — พนักงานยกเลิกของตัวเองวันนี้ได้ · ผู้บริหารยกเลิกได้ทุกรายการ */
function actionUndoMemberLog(req) {
  var staff = requireStaff(req);
  var isMgr = (ROLE_LEVEL[staff.Role] || 0) >= ROLE_LEVEL.manager;
  var rows = readRows(SHEET_TABS.MEMBER_LOG);
  var l = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].Log_ID) === String(req.logId)) { l = rows[i]; break; }
  if (!l) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)');
  var t = String(l.Type);
  if (['buy', 'redeem', 'adjust'].indexOf(t) === -1) {
    throw new Error('รายการสมัคร/ต่ออายุ ยกเลิกตรงนี้ไม่ได้ — ให้ผู้บริหารแก้วันหมดอายุหรือยกเลิกสมาชิกแทน');
  }
  var mine = String(l.By) === String(staff.Name) && dateKey(l.Timestamp) === todayKey();
  if (!isMgr && !mine) throw new Error('ยกเลิกได้เฉพาะรายการที่คุณบันทึกเองวันนี้ — รายการอื่นให้ผู้บริหารจัดการ');
  getSheet(SHEET_TABS.MEMBER_LOG).deleteRow(l._rowIndex);
  var id = String(l.Member_ID);
  return { member: summarizeMember(findMemberRow(id), memberLogsById()[id], memberRules(), todayKey()) };
}

/** รับเทียนเข้า / ตัดออก (เสีย/แจกอื่น) / นับสต๊อก — พนักงานทำได้ (เหมือนสต๊อกวัตถุดิบ) */
function actionAdjustCandle(req) {
  var staff = requireStaff(req);
  var type = String(req.type);
  if (['in', 'out', 'count'].indexOf(type) === -1) throw new Error('ประเภทรายการไม่ถูกต้อง');
  var qty = Math.floor(num(req.qty));
  if (qty < 0 || (type !== 'count' && qty < 1)) throw new Error('กรอกจำนวนให้ถูกต้อง');
  var rows = readRows(SHEET_TABS.CANDLES);
  var c = null;
  for (var i = 0; i < rows.length; i++) if (String(rows[i].Scent_ID) === String(req.scentId)) { c = rows[i]; break; }
  if (!c) throw new Error('ไม่พบกลิ่นเทียนนี้');
  var bal = num(c.Stock);
  var next = type === 'in' ? bal + qty : (type === 'out' ? bal - qty : qty);
  if (next < 0) throw new Error('ตัดออกเกินสต๊อก (เหลือ ' + bal + ')');
  var idx = c._rowIndex; delete c._rowIndex;
  c.Stock = next;
  updateRowObj(SHEET_TABS.CANDLES, idx, c);
  appendRowObj(SHEET_TABS.CANDLE_LOG, {
    Timestamp: new Date(), Scent_ID: c.Scent_ID, Scent_Name: c.Name, Type: type, Qty: qty,
    Balance_After: next, Member_ID: '', Note: String(req.note || ''), By: staff.Name,
  });
  return { candles: candleList() };
}

/**
 * นำเข้ารายชื่อสมาชิกจาก LMWN (ผู้บริหารขึ้นไป) — หน้าแอปแกะข้อความที่วางมาเป็นแถวให้แล้ว
 * rows: [{ name, phone, joinedAt, cups }] · เบอร์ซ้ำกับสมาชิกที่มีอยู่ = ข้าม · ไม่แจกเทียน ไม่เก็บค่าสมาชิกซ้ำ
 */
function actionImportMembers(req) {
  var staff = requireRole(req, 'manager');
  var rows = Array.isArray(req.rows) ? req.rows : [];
  if (!rows.length) throw new Error('ไม่มีรายชื่อให้นำเข้า');
  if (rows.length > 300) throw new Error('นำเข้าได้ครั้งละไม่เกิน 300 คน');
  var rules = memberRules();
  var today = todayKey();
  var have = {};
  readRows(SHEET_TABS.MEMBERS).forEach(function (r) { if (normPhone(r.Phone)) have[normPhone(r.Phone)] = true; });
  var added = 0, skipped = [];
  var seq = Number(nextMemberId().slice(1)); // อ่านชีตครั้งเดียว แล้วนับต่อเอง (300 แถว = ไม่ต้องอ่าน 300 รอบ)
  rows.forEach(function (r) {
    var name = String(r.name || '').trim();
    var phone = normPhone(r.phone);
    if (!name) { skipped.push('(ไม่มีชื่อ)'); return; }
    if (phone && have[phone]) { skipped.push(name + ' (เบอร์ซ้ำ)'); return; }
    var joined = /^\d{4}-\d{2}-\d{2}$/.test(String(r.joinedAt || '')) && String(r.joinedAt) <= today ? String(r.joinedAt) : today;
    var id = 'M' + ('000' + (seq++)).slice(-4);
    appendRowObj(SHEET_TABS.MEMBERS, {
      Member_ID: id, Name: name, Nickname: '', Phone: phone, Joined_At: joined,
      Expires_At: addMonthsISO(joined, rules.months), Candle_Scent: '', Fee: 0, Pay_Method: 'none',
      Source: 'lmwn', LMWN_Ref: String(r.ref || ''), Status: 'active', Note: 'นำเข้าจาก LMWN',
      Created_By: staff.Name, Created_At: new Date(),
    });
    logMember(id, 'join', 0, 0, '', 'นำเข้าจาก LMWN', staff.Name);
    var cups = Math.max(0, Math.floor(num(r.cups)));
    if (cups) logMember(id, 'adjust', cups, 0, '', 'แก้วสะสมยกมาจาก LMWN', staff.Name);
    if (phone) have[phone] = true;
    added++;
  });
  return { added: added, skipped: skipped };
}
