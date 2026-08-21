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
};

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
  unpayCommission: 1, disableIngredient: 1,
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
    case 'disableIngredient':  return actionDisableIngredient(req);

    // ── สต๊อก ──
    case 'getStock':         return actionGetStock(req);
    case 'addIngredient':    return actionAddIngredient(req);
    case 'stockMove':        return actionStockMove(req);
    case 'deleteStockMove':  return actionDeleteStockMove(req);

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
function stripCommission(rec, staff) {
  if (ROLE_LEVEL[staff.Role] >= ROLE_LEVEL.manager) return rec;
  delete rec.Commission_Total;
  delete rec.Commission_Rate;
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
  var totals = { sales: 0, cash: 0, tct: 0, transfer: 0, discount: 0, days: days.length };
  if (canSeeMoney) totals.commission = 0;
  days.forEach(function (d) {
    totals.sales += num(d.Total_Sales);
    totals.cash += num(d.Cash);
    totals.tct += num(d.Thai_Chuay_Thai);
    totals.transfer += num(d.Transfer);
    totals.discount += num(d.Discount_Total);
    if (canSeeMoney) totals.commission += num(d.Commission_Total);
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
  };
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

function linePush(cred, messages) {
  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + cred.token },
      payload: JSON.stringify({ to: cred.groupId, messages: messages }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) return { pushed: true };
    return { pushed: false, error: 'LINE API: ' + res.getContentText() };
  } catch (err) {
    return { pushed: false, error: String(err) };
  }
}

/**
 * Flex Message สรุปยอดรายวัน — จัดเป็น infographic:
 * ยอดรวมตัวใหญ่ + แถบสัดส่วนช่องทางเงิน + ตารางแก้วต่อหมวด + ค่าคอม
 */
function buildDailyFlex(record, categories, premiumItems, config) {
  var C = {
    bg: '#241A14', card: '#33261C', cream: '#F5EBDD', gold: '#D9A05B',
    dim: '#B9A58E', green: '#7FB77E', blue: '#7EA8C9', pink: '#D98BA0',
  };
  var date = thaiDate(dateKey(record.Date));
  var total = num(record.Total_Sales);
  var channels = [
    { label: '💵 เงินสด', amount: num(record.Cash), color: C.green },
    { label: '🇹🇭 ไทยช่วยไทย', amount: num(record.Thai_Chuay_Thai), color: C.blue },
    { label: '📲 เงินโอน', amount: num(record.Transfer), color: C.pink },
  ];
  var channelSum = channels.reduce(function (s, c) { return s + c.amount; }, 0) || 1;

  var channelRows = [];
  channels.forEach(function (ch) {
    var pct = Math.max(4, Math.round((ch.amount / channelSum) * 100));
    channelRows.push({
      type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: ch.label, size: 'sm', color: C.cream, flex: 5 },
            { type: 'text', text: fmtMoney(ch.amount) + ' ฿', size: 'sm', color: C.cream, align: 'end', flex: 4, weight: 'bold' },
          ],
        },
        {
          type: 'box', layout: 'vertical', backgroundColor: '#1A120D', cornerRadius: 'md', height: '6px',
          contents: [{
            type: 'box', layout: 'vertical', backgroundColor: ch.color, cornerRadius: 'md',
            height: '6px', width: pct + '%', contents: [],
          }],
        },
      ],
    });
  });

  var catCounts = safeParse(record.Category_Counts_JSON);
  var catRows = [];
  categories.forEach(function (c) {
    var count = num(catCounts[c.Category_ID]);
    catRows.push({
      type: 'box', layout: 'horizontal', margin: 'xs',
      contents: [
        { type: 'text', text: (c.Emoji ? c.Emoji + ' ' : '') + c.Name, size: 'xs', color: count ? C.cream : C.dim, flex: 6 },
        { type: 'text', text: count + ' ' + c.Unit, size: 'xs', color: count ? C.gold : C.dim, align: 'end', flex: 3 },
      ],
    });
  });

  var premCounts = safeParse(record.Premium_Counts_JSON);
  var premRows = [];
  premiumItems.forEach(function (p) {
    var count = num(premCounts[p.Item_ID]);
    if (!count) return; // แสดงเฉพาะที่ขายได้ ไม่ให้การ์ดยาวเกิน
    premRows.push({
      type: 'box', layout: 'horizontal', margin: 'xs',
      contents: [
        { type: 'text', text: (p.Emoji ? p.Emoji + ' ' : '') + p.Name, size: 'xs', color: C.cream, flex: 7, wrap: true },
        { type: 'text', text: count + ' ' + p.Unit, size: 'xs', color: C.gold, align: 'end', flex: 2 },
      ],
    });
  });

  var extraRows = [
    kvRow('ส่วนลด', num(record.Discount_Count) + ' รายการ / ' + fmtMoney(record.Discount_Total) + ' ฿', C),
    kvRow('บิล Void', num(record.Void_Count) + ' บิล', C),
  ];
  if (num(record.Cash_Over) !== 0) {
    extraRows.push(kvRow('เงินสดเกิน/ขาด', (num(record.Cash_Over) > 0 ? '+' : '') + fmtMoney(record.Cash_Over) + ' ฿', C));
  }
  if (num(record.Channel_Diff) !== 0) {
    extraRows.push(kvRow('ผลต่างช่องทางเงิน', (num(record.Channel_Diff) > 0 ? '+' : '') + fmtMoney(record.Channel_Diff) + ' ฿', C));
  }

  var body = [
    // ยอดรวม
    {
      type: 'box', layout: 'vertical', alignItems: 'center', spacing: 'none',
      contents: [
        { type: 'text', text: 'ยอดขายวันนี้', size: 'sm', color: C.dim },
        { type: 'text', text: fmtMoney(total), size: '3xl', weight: 'bold', color: C.gold },
        { type: 'text', text: 'บาท', size: 'sm', color: C.dim },
      ],
    },
    { type: 'separator', margin: 'lg', color: '#4A3826' },
    { type: 'text', text: 'ช่องทางรับเงิน', size: 'sm', weight: 'bold', color: C.gold, margin: 'lg' },
  ].concat(channelRows, [
    { type: 'separator', margin: 'lg', color: '#4A3826' },
    { type: 'text', text: 'ยอดขายตามหมวด', size: 'sm', weight: 'bold', color: C.gold, margin: 'lg' },
  ], catRows);

  if (premRows.length) {
    body = body.concat([
      { type: 'separator', margin: 'lg', color: '#4A3826' },
      { type: 'text', text: 'เมนูพรีเมียม / อื่น ๆ', size: 'sm', weight: 'bold', color: C.gold, margin: 'lg' },
    ], premRows);
  }

  // (ค่าคอมเป็นเรื่องหลังบ้าน — ไม่แสดงบนการ์ดในกลุ่ม)
  body = body.concat([
    { type: 'separator', margin: 'lg', color: '#4A3826' },
  ], extraRows);

  if (record.Note) {
    body.push({ type: 'text', text: '📝 ' + record.Note, size: 'xs', color: C.dim, margin: 'md', wrap: true });
  }

  return {
    type: 'flex',
    altText: '☕ สรุปยอด ' + date + ' — ' + fmtMoney(total) + ' บาท',
    contents: {
      type: 'bubble', size: 'mega',
      styles: { header: { backgroundColor: C.bg }, body: { backgroundColor: C.bg } },
      header: {
        type: 'box', layout: 'vertical', paddingAll: '16px', paddingBottom: '0px',
        contents: [
          { type: 'text', text: '☕ ' + (config.SHOP_NAME || 'Old Days'), weight: 'bold', size: 'lg', color: C.cream },
          { type: 'text', text: 'สรุปยอดประจำวัน ' + date, size: 'sm', color: C.dim, margin: 'xs' },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: C.bg,
        contents: [{
          type: 'text', size: 'xxs', color: C.dim, align: 'center',
          text: 'ปิดยอดโดย ' + record.Submitted_By +
            (record.Staff_On_Shift ? ' · 👥 ' + record.Staff_On_Shift : ''),
          wrap: true,
        }],
      },
    },
  };
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

  // ส่วนลดมีได้หลายบรรทัด: Sub.TTL DC.(%) และ Sub.TTL DC.(Amt) — ต้องรวมทุกบรรทัด
  // (บั๊กเดิมอ่านแค่บรรทัดแรก เช่น 17/8 ได้ 271.25 ทั้งที่จริง 921.25)
  var discount = [0, 0];
  lines.forEach(function (l) {
    if (l.indexOf('Sub.TTL DC') === -1) return;
    var d = lastTwoNums(l);
    discount[0] += Math.abs(d[0]);
    discount[1] += Math.abs(d[1]);
  });
  var tctLine = findLine('ไทยช่วยไทย') || findLine('By Custom Payment');
  var voidAll = lastTwoNums(findLine('Void All'));

  return {
    date: date,
    totalSales: lastNum(findLine('Total Sales')),
    cash: lastNum(findLine('By Cash')),
    creditCard: lastNum(findLine('By Credit Card')),
    thaiQR: lastNum(findLine('By Thai QR')),
    thaiChuayThai: lastNum(tctLine),
    discountCount: Math.abs(discount[0]),
    discountTotal: Math.abs(discount[1]),
    voidCount: voidAll[0],
    voidTotal: voidAll[1],
    guests: lastNum(findLine('Number of Guests')),
    bills: lastNum(findLine('Total Bills')),
    drawerExpected: lastNum(findLine('Expected in Drawer')),
    drawerActual: lastNum(findLine('Actual in Drawer')),
    drawerDiff: lastNum(findLine('Difference')),
    categories: categories,
  };
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

  // ส่งการ์ดสรุปเต็มเข้ากลุ่มทันทีที่ยอดเข้า — ไม่ต้องรอคนกดยืนยัน
  pushDailySummary(record, cats, [], config);

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

  var low = readRows(SHEET_TABS.INGREDIENTS).filter(function (i) {
    return isTrue(i.Active) && num(i.Current_Stock) <= num(i.Min_Stock);
  });
  if (low.length) {
    lines.push('⚠️ วัตถุดิบใกล้หมด:');
    low.forEach(function (i) {
      lines.push('• ' + i.Name + ' — เหลือ ' + num(i.Current_Stock) + ' ' + i.Unit);
    });
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
