const SHEETS = {
  workoutLog: "Workout Log",
  prs: "PRs",
  settings: "Settings"
};

const WORKOUT_HEADERS = [
  "id",
  "timestamp",
  "week",
  "day",
  "dayTitle",
  "exercise",
  "itemType",
  "suggestedWeight",
  "unit",
  "completedWeight",
  "notes",
  "completed",
  "context"
];

const PR_HEADERS = [
  "timestamp",
  "number",
  "title",
  "url",
  "state",
  "notes"
];

const SETTINGS_HEADERS = ["key", "value"];

function doGet(e) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(spreadsheet);

  const action = String(e.parameter.action || "setup");
  let payload;
  if (action === "history") {
    payload = {ok: true, records: readWorkoutHistory(spreadsheet)};
  } else if (action === "log") {
    const record = parseRecordParameter(e.parameter.record);
    const saved = appendWorkoutRecords(spreadsheet, [record]);
    payload = {ok: true, saved};
  } else {
    payload = {ok: true, message: "Workout sheets are ready."};
  }

  return respond(payload, e.parameter.callback);
}

function doPost(e) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(spreadsheet);

  const payload = parsePayload(e);
  const records = payload.action === "logBatch"
    ? payload.records || []
    : [payload.record || payload];

  appendWorkoutRecords(spreadsheet, records);

  return respond({ok: true, saved: records.length});
}

function ensureSheets(spreadsheet) {
  ensureSheet(spreadsheet, SHEETS.workoutLog, WORKOUT_HEADERS);
  ensureSheet(spreadsheet, SHEETS.prs, PR_HEADERS);
  ensureSheet(spreadsheet, SHEETS.settings, SETTINGS_HEADERS);
}

function ensureSheet(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    return {};
  }
}

function parseRecordParameter(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function appendWorkoutRecords(spreadsheet, records) {
  const cleaned = records
    .filter(record => record && record.timestamp && record.exercise)
    .map(record => WORKOUT_HEADERS.map(header => normalizeValue(record[header])));

  if (!cleaned.length) return 0;

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureSheet(spreadsheet, SHEETS.workoutLog, WORKOUT_HEADERS);
    sheet.getRange(sheet.getLastRow() + 1, 1, cleaned.length, WORKOUT_HEADERS.length).setValues(cleaned);
  } finally {
    lock.releaseLock();
  }
  return cleaned.length;
}

function readWorkoutHistory(spreadsheet) {
  const sheet = ensureSheet(spreadsheet, SHEETS.workoutLog, WORKOUT_HEADERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  return values.slice(1).map(row => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] instanceof Date ? row[index].toISOString() : row[index];
    });
    return record;
  }).filter(record => record.timestamp && record.exercise);
}

function normalizeValue(value) {
  if (value === undefined || value === null) return "";
  return value;
}

function respond(payload, callback) {
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
