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
};

// ชื่อผู้ส่งของ record ที่ดึงจากอีเมล POS อัตโนมัติ — แอปใช้แยกว่ายังรอคนยืนยัน
var AUTO_SUBMITTER = 'FoodStory (อัตโนมัติ)';

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
  importFromGmail: 1,
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
    deleteRowsByDate(SHEET_TABS.COMMISSION, date);
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

  // ค่าคอมแบ่งเท่ากันตามคนเข้ากะ
  if (staffOnShift.length && commissionTotal > 0) {
    var perHead = Math.round((commissionTotal / staffOnShift.length) * 100) / 100;
    staffOnShift.forEach(function (name) {
      appendRowObj(SHEET_TABS.COMMISSION, {
        Date: date, Staff_Name: name,
        Cups_Share: Math.round((cups / staffOnShift.length) * 100) / 100,
        Amount: perHead,
        Note: cups + ' แก้ว × ' + rate + ' บาท ÷ ' + staffOnShift.length + ' คน',
      });
    });
  }

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
  requireStaff(req);
  var rows = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date) === String(req.date);
  });
  return { record: rows.length ? rows[rows.length - 1] : null };
}

function actionGetReport(req) {
  var staff = requireStaff(req);
  var month = String(req.month || ''); // 'yyyy-MM'
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('รูปแบบเดือนไม่ถูกต้อง');

  var days = readRows(SHEET_TABS.DAILY).filter(function (r) {
    return dateKey(r.Date).indexOf(month) === 0;
  }).map(function (r) {
    delete r._rowIndex;
    return r;
  });

  var totals = { sales: 0, cash: 0, tct: 0, transfer: 0, discount: 0, commission: 0, days: days.length };
  days.forEach(function (d) {
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

  var newStatus = req.status; // approved | rejected | purchased
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
  } else if (newStatus === 'purchased') {
    staff = requireStaff(req);
    if (po.Status !== 'approved') throw new Error('ต้องอนุมัติก่อนถึงบันทึกซื้อได้');
    po.Status = 'purchased';
    po.Actual_Cost = num(req.actualCost);
    po.Purchased_At = new Date();
    if (req.note) po.Note = (po.Note ? po.Note + ' | ' : '') + req.note;
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
  var groupId = getConfig().LINE_GROUP_ID;
  return { token: token, groupId: groupId };
}

function notifyGroup(text) {
  var cred = getLineCredentials();
  if (!cred.token || !cred.groupId) return { pushed: false, error: 'ยังไม่ได้ตั้งค่า LINE bot' };
  return linePush(cred, [{ type: 'text', text: text }]);
}

function pushDailySummary(record, categories, premiumItems, config) {
  var cred = getLineCredentials();
  if (!cred.token || !cred.groupId) {
    return { pushed: false, error: 'ยังไม่ได้ตั้งค่า LINE bot (token/groupId)' };
  }
  var flex = buildDailyFlex(record, categories, premiumItems, config);
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

  var staffCount = String(record.Staff_On_Shift || '').split(',').filter(function (s) { return s.trim(); }).length;
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

  body = body.concat([
    { type: 'separator', margin: 'lg', color: '#4A3826' },
  ], extraRows, [
    // ค่าคอม
    {
      type: 'box', layout: 'vertical', margin: 'lg', paddingAll: '12px',
      backgroundColor: C.card, cornerRadius: 'lg',
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: '🥤 ค่าคอมเครื่องดื่ม', size: 'sm', color: C.cream, flex: 6 },
            { type: 'text', text: fmtMoney(record.Commission_Total) + ' ฿', size: 'sm', weight: 'bold', color: C.gold, align: 'end', flex: 4 },
          ],
        },
        {
          type: 'text', size: 'xxs', color: C.dim, margin: 'sm', wrap: true,
          text: num(record.Commission_Cups) + ' แก้ว × ' + num(record.Commission_Rate) + ' บาท' +
            (staffCount > 1 ? ' (แบ่ง ' + staffCount + ' คน)' : ''),
        },
      ],
    },
  ]);

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
          text: 'ปิดยอดโดย ' + record.Submitted_By + ' · เข้ากะ: ' + (record.Staff_On_Shift || '-'),
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
//  ดึงรายงานปิดรอบ FoodStory จาก Gmail อัตโนมัติ
//  เงื่อนไข: Apps Script ต้องรันด้วยบัญชี Google เดียวกับที่รับอีเมล
//  เปิดใช้: รัน setupImportTrigger ครั้งเดียวใน editor (จะขอสิทธิ์ Gmail)
// ═══════════════════════════════════════════════════════════════

var IMPORT_QUERY = 'from:noreply@foodstory.co subject:"Close Drawer Report" newer_than:3d';

/** ตั้ง trigger ดึงอีเมลทุกชั่วโมง — รันครั้งเดียวพอ */
function setupImportTrigger() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'importDrawerReports';
  });
  if (!exists) {
    ScriptApp.newTrigger('importDrawerReports').timeBased().everyHours(1).create();
  }
  // รันทันทีหนึ่งรอบให้เห็นผลเลย
  return importDrawerReports();
}

/** ปุ่มในแอป: ดึงตอนนี้เลย */
function actionImportFromGmail(req) {
  requireStaff(req);
  return importDrawerReports();
}

function importDrawerReports() {
  ensureSetup();
  var doneIds = {};
  readRows(SHEET_TABS.IMPORT_LOG).forEach(function (r) { doneIds[r.Message_ID] = true; });

  var results = [];
  var threads = GmailApp.search(IMPORT_QUERY);
  threads.forEach(function (th) {
    th.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (doneIds[id]) return;
      var status;
      var parsed = null;
      try {
        parsed = parseDrawerReport(msg.getPlainBody());
        status = parsed && parsed.date ? saveImportedClose(parsed) : 'parse-failed';
      } catch (e) {
        status = 'error: ' + e.message;
      }
      appendRowObj(SHEET_TABS.IMPORT_LOG, {
        Message_ID: id,
        Date: parsed && parsed.date ? parsed.date : '',
        Imported_At: new Date(),
        Status: status,
      });
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

  var dm = joined.match(/ประจำวันที่\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dm) return null;
  var date = dm[3] + '-' + dm[2] + '-' + dm[1];

  function findLine(needle, exclude) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(needle) !== -1 && (!exclude || lines[i].indexOf(exclude) === -1)) return lines[i];
    }
    return '';
  }

  // ── หมวดขาย: ระหว่าง "Sales by Category" ถึง "Sub Total" ──
  var categories = [];
  var inCat = false;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('Sales by Category') !== -1) { inCat = true; continue; }
    if (!inCat) continue;
    if (lines[i].indexOf('Sub Total') !== -1) break;
    var parts = lines[i].split('|').map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length >= 3) {
      categories.push({ name: parts[0], count: num(parts[1].replace(/,/g, '')), amount: num(parts[2].replace(/,/g, '')) });
    }
  }

  var discount = lastTwoNums(findLine('Sub.TTL DC'));
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

  // แจ้งกลุ่มสั้น ๆ ให้เข้าไปยืนยัน (การ์ดเต็มส่งตอนพนักงานกดยืนยัน+เลือกคนเข้ากะ)
  notifyGroup('📩 ยอดปิดรอบวันที่ ' + thaiDate(date) + ' เข้าระบบแล้ว — ยอดขาย ' +
    fmtMoney(parsed.totalSales) + ' บาท\nเปิดแอป → ปิดยอด → เลือกคนเข้ากะ แล้วกดยืนยัน เพื่อคิดค่าคอมและส่งสรุปเต็ม');

  return 'imported';
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
