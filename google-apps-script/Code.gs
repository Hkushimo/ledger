const SHEET_NAME = "Ledger";
const HEADERS = ["id", "date", "person", "type", "amount", "memo", "createdAt", "updatedAt"];
const VALID_TYPES = ["deposit", "withdrawal", "fee"];
const UNASSIGNED = "Unassigned";
const DATE_FORMAT = "m/d/yyyy";
const DATE_TIME_FORMAT = "m/d/yyyy h:mm AM/PM";
const MONEY_FORMAT = "$#,##0.00";
const BUILD_VERSION = "2026-08-06-dark-green-fixed-widths";

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Ledger")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getEntries() {
  const sheet = getLedgerSheet_();
  const rows = sheet.getDataRange().getValues();

  return rows
    .slice(1)
    .filter((row) => row[0])
    .map((row) => ({
      id: String(row[0]),
      date: formatDate_(row[1]),
      person: String(row[2] || UNASSIGNED),
      type: String(row[3]),
      amount: Number(row[4]),
      memo: String(row[5] || ""),
      createdAt: formatDateTime_(row[6]),
      updatedAt: formatDateTime_(row[7]),
    }))
    .filter(isEntry_)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function addEntry(entry) {
  const clean = normalizeEntry_(entry);
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);

  try {
    const sheet = getLedgerSheet_();
    const now = new Date();
    writeRows_(sheet, [[
      clean.id,
      parseEntryDate_(clean.date),
      clean.person,
      clean.type,
      clean.amount,
      clean.memo,
      now,
      now,
    ]]);
  } finally {
    lock.releaseLock();
  }

  return getEntries();
}

function importEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Expected an array of entries.");
  }

  const cleanEntries = entries.map(normalizeEntry_);
  if (!cleanEntries.length) return getEntries();

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);

  try {
    const sheet = getLedgerSheet_();
    const now = new Date();
    const rows = cleanEntries.map((entry) => [
      entry.id,
      parseEntryDate_(entry.date),
      entry.person,
      entry.type,
      entry.amount,
      entry.memo,
      now,
      now,
    ]);
    writeRows_(sheet, rows);
  } finally {
    lock.releaseLock();
  }

  return getEntries();
}

function deleteEntry(id) {
  if (!id) throw new Error("Missing entry id.");

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);

  try {
    const sheet = getLedgerSheet_();
    const values = sheet.getDataRange().getValues();
    for (let index = values.length - 1; index >= 1; index -= 1) {
      if (String(values[index][0]) === String(id)) {
        sheet.deleteRow(index + 1);
        break;
      }
    }
  } finally {
    lock.releaseLock();
  }

  return getEntries();
}

function clearEntries() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);

  try {
    const sheet = getLedgerSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
  } finally {
    lock.releaseLock();
  }

  return [];
}

function getLedgerSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  const headersAreMissing = HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (headersAreMissing) {
    headerRange.setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }

  formatLedgerSheet_(sheet);
  migrateTimestampColumns_(sheet);

  return sheet;
}

function writeRows_(sheet, rows) {
  if (!rows.length) return;

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
  sheet.getRange(startRow, 2, rows.length, 1).setNumberFormat(DATE_FORMAT);
  sheet.getRange(startRow, 5, rows.length, 1).setNumberFormat(MONEY_FORMAT);
  sheet.getRange(startRow, 7, rows.length, 2).setNumberFormat(DATE_TIME_FORMAT);
}

function normalizeEntry_(entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Invalid entry.");
  }

  const date = String(entry.date || "").trim();
  const type = String(entry.type || "").trim();
  const amount = Math.round(Number(entry.amount) * 100) / 100;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }

  if (!VALID_TYPES.includes(type)) {
    throw new Error("Type must be deposit, withdrawal, or fee.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  return {
    id: String(entry.id || Utilities.getUuid()),
    date,
    person: String(entry.person || "").trim() || UNASSIGNED,
    type,
    amount,
    memo: String(entry.memo || "").trim(),
  };
}

function isEntry_(entry) {
  return (
    entry &&
    entry.id &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    entry.person &&
    VALID_TYPES.includes(entry.type) &&
    Number.isFinite(entry.amount)
  );
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  return String(value || "");
}

function formatDateTime_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "M/d/yyyy h:mm a");
  }

  return String(value || "");
}

function parseEntryDate_(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatLedgerSheet_(sheet) {
  sheet.getRange("B:B").setNumberFormat(DATE_FORMAT);
  sheet.getRange("E:E").setNumberFormat(MONEY_FORMAT);
  sheet.getRange("G:H").setNumberFormat(DATE_TIME_FORMAT);
}

function migrateTimestampColumns_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 7, lastRow - 1, 2);
  const values = range.getValues();
  let changed = false;

  const nextValues = values.map((row) =>
    row.map((value) => {
      if (Object.prototype.toString.call(value) === "[object Date]" || !value) {
        return value;
      }

      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }

      changed = true;
      return parsed;
    }),
  );

  if (changed) {
    range.setValues(nextValues);
  }
}
