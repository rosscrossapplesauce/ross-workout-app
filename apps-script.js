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
  "planSource",
  "exercise",
  "originalExercise",
  "itemType",
  "suggestedWeight",
  "unit",
  "completedWeight",
  "setWeights",
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
  e = e || {parameter: {}};
  e.parameter = e.parameter || {};
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
  } else if (action === "alternatives") {
    try {
      payload = getExerciseAlternatives(spreadsheet, e.parameter);
    } catch (error) {
      payload = {ok: false, error: error.message || "Could not generate alternatives."};
    }
  } else if (action === "generatePlan") {
    try {
      payload = generateTrainingPlan(spreadsheet, e.parameter, false);
    } catch (error) {
      payload = {ok: false, error: error.message || "Could not generate a training plan."};
    }
  } else if (action === "latestPlan") {
    payload = getLatestTrainingPlan(spreadsheet, e.parameter);
  } else if (action === "extendPlan") {
    try {
      payload = generateTrainingPlan(spreadsheet, e.parameter, true);
    } catch (error) {
      payload = {ok: false, error: error.message || "Could not extend the training plan."};
    }
  } else {
    payload = {ok: true, message: "Workout sheets are ready."};
  }

  return respond(payload, e.parameter.callback);
}

function doPost(e) {
  e = e || {};
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(spreadsheet);

  const payload = parsePayload(e);
  const records = payload.action === "logBatch"
    ? payload.records || []
    : [payload.record || payload];

  const saved = appendWorkoutRecords(spreadsheet, records);

  return respond({ok: true, saved});
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
  } else {
    ensureHeaders(sheet, headers);
  }
  return sheet;
}

function ensureHeaders(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const missing = headers.filter(header => !current.includes(header));
  if (!missing.length) return;
  sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  sheet.autoResizeColumns(1, current.length + missing.length);
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
  const sheet = ensureSheet(spreadsheet, SHEETS.workoutLog, WORKOUT_HEADERS);
  const headers = getHeaders(sheet);
  const cleaned = records
    .filter(record => record && record.timestamp && record.exercise)
    .map(record => headers.map(header => normalizeValue(record[header])));

  if (!cleaned.length) return 0;

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    sheet.getRange(sheet.getLastRow() + 1, 1, cleaned.length, headers.length).setValues(cleaned);
  } finally {
    lock.releaseLock();
  }
  return cleaned.length;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
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

function getExerciseAlternatives(spreadsheet, params) {
  const exercise = String(params.exercise || "").trim();
  if (!exercise) return {ok: false, error: "Missing exercise name."};

  const cacheKey = [
    "alternativesV2",
    exercise,
    params.sets || "",
    params.reps || "",
    params.dayTitle || ""
  ].join("|").toLowerCase();

  const cached = getSetting(spreadsheet, cacheKey);
  if (cached) {
    try {
      return {ok: true, alternatives: JSON.parse(cached), cached: true};
    } catch (error) {
      // Ignore stale cache and regenerate.
    }
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    return {ok: false, error: "OpenAI key is not set in Apps Script properties."};
  }

  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-5.4-mini";
  const alternatives = callOpenAIForAlternatives(apiKey, model, params);
  setSetting(spreadsheet, cacheKey, JSON.stringify(alternatives));
  return {ok: true, alternatives, cached: false};
}

function generateTrainingPlan(spreadsheet, params, extendExisting) {
  const payload = parseJson(params.payload || "{}");
  const settings = payload.settings || {};
  if ((!settings.goals || !settings.goals.length) && !settings.mainGoal) {
    return {ok: false, error: "Save a main goal before generating a plan."};
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    return {ok: false, error: "OpenAI key is not set in Apps Script properties."};
  }

  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-5.4-mini";
  const plan = callOpenAIForPlan(apiKey, model, payload, extendExisting);
  plan.generatedAt = new Date().toISOString();
  setSetting(spreadsheet, extendExisting ? "latestPlanExtension" : "latestGeneratedPlan", JSON.stringify(plan));
  setSetting(spreadsheet, extendExisting ? "latestPlanExtensionMeta" : "latestGeneratedPlanMeta", JSON.stringify({
    requestId: payload.requestId || "",
    generatedAt: plan.generatedAt
  }));
  return {ok: true, plan};
}

function getLatestTrainingPlan(spreadsheet, params) {
  const planText = getSetting(spreadsheet, "latestGeneratedPlan");
  const meta = parseJson(getSetting(spreadsheet, "latestGeneratedPlanMeta") || "{}");
  if (!planText) return {ok: true, ready: false};
  if (params.requestId && meta.requestId && params.requestId !== meta.requestId) {
    return {ok: true, ready: false};
  }
  const plan = parseJson(planText);
  if (!plan || !plan.weeks) return {ok: true, ready: false};
  return {ok: true, ready: true, plan, generatedAt: meta.generatedAt || plan.generatedAt || ""};
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    return {};
  }
}

function callOpenAIForPlan(apiKey, model, payload, extendExisting) {
  const settings = payload.settings || {};
  const prompt = [
    extendExisting ? "Create the next 4 weeks of this gym-friendly training plan as JSON." : "Create a conservative, gym-friendly training plan as JSON.",
    "The user is active but returning to lifting after time away. Favor safe starting weights, gradual progression, and simple execution.",
    "Do not provide medical advice. Avoid injury diagnosis. Encourage easing up if pain appears.",
    "Keep workouts efficient and minimal. One day should fit the requested workout length.",
    "Use rowing, running, strength, and rest according to the user's goals and notes.",
    "If weight-loss timing is mentioned, keep it realistic and training-focused rather than promising fat loss.",
    "Return 4 weeks. Use the requested days per week when provided, otherwise 5 days per week.",
    "For strength exercises, suggest conservative numeric starting weights in pounds. Use 0 only for bodyweight movements.",
    "Each training day may include row, run, exercises, recovery, or a combination.",
    "",
    "User setup:",
    JSON.stringify(settings),
    "",
    "Current body and performance stats:",
    JSON.stringify(payload.stats || {}),
    "",
    "Preferred exercise substitutions:",
    JSON.stringify(payload.preferences || {}),
    "",
    "Recent workout history:",
    JSON.stringify(payload.history || []),
    "",
    extendExisting ? "Current plan to continue:" : "Current plan to continue: none",
    JSON.stringify(payload.currentPlan || null),
    "",
    "JSON shape: {\"plan\":{\"name\":\"...\",\"summary\":\"...\",\"notes\":\"...\",\"units\":\"lb unless noted\",\"weeks\":[...]}}"
  ].join("\n");

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "generated_workout_plan",
          strict: true,
          schema: workoutPlanSchema()
        }
      }
    })
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`OpenAI request failed: ${status} ${body}`);
  }

  const parsed = JSON.parse(body);
  const text = parsed.output_text || extractResponseText(parsed);
  const output = JSON.parse(text);
  return output.plan || output;
}

function workoutPlanSchema() {
  const cardioSchema = {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["type", "duration", "intensity", "pace"],
        properties: {
          type: {type: "string"},
          duration: {type: "string"},
          intensity: {type: "string"},
          pace: {type: "string"}
        }
      },
      {type: "null"}
    ]
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["plan"],
    properties: {
      plan: {
        type: "object",
        additionalProperties: false,
        required: ["name", "summary", "notes", "units", "weeks"],
        properties: {
          name: {type: "string"},
          summary: {type: "string"},
          notes: {type: "string"},
          units: {type: "string"},
          weeks: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["week", "days"],
              properties: {
                week: {type: "number"},
                days: {
                  type: "array",
                  minItems: 3,
                  maxItems: 7,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["day", "title", "row", "run", "recovery", "exercises"],
                    properties: {
                      day: {type: "string"},
                      title: {type: "string"},
                      row: cardioSchema,
                      run: cardioSchema,
                      recovery: {type: "string"},
                      exercises: {
                        type: "array",
                        minItems: 0,
                        maxItems: 8,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["name", "sets", "reps", "suggestedWeight", "unit", "notes"],
                          properties: {
                            name: {type: "string"},
                            sets: {type: "number"},
                            reps: {type: "string"},
                            suggestedWeight: {type: "number"},
                            unit: {type: "string"},
                            notes: {type: "string"}
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function callOpenAIForAlternatives(apiKey, model, params) {
  const prompt = [
    "Return exactly three safe gym exercise alternatives as JSON.",
    "Each alternative should target the same primary muscles and movement pattern.",
    "Prefer common commercial gym machines, cables, dumbbells, or bodyweight options.",
    "For each alternative, choose the best sets and reps for that exercise while keeping the same training intent.",
    "Choose a conservative starting weight in pounds. Use 0 for bodyweight movements.",
    "Avoid medical claims. Keep instructions short.",
    "",
    `Exercise: ${params.exercise || ""}`,
    `Workout day: ${params.dayTitle || ""}`,
    `Prescription: ${params.sets || ""} sets x ${params.reps || ""} reps`,
    `Suggested weight: ${params.suggestedWeight || ""} ${params.unit || ""}`,
    "",
    "JSON shape: {\"alternatives\":[{\"name\":\"...\",\"sets\":3,\"reps\":\"8-10\",\"suggestedWeight\":50,\"unit\":\"lb\",\"how\":\"...\",\"why\":\"...\"}]}"
  ].join("\n");

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "exercise_alternatives",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["alternatives"],
            properties: {
              alternatives: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "sets", "reps", "suggestedWeight", "unit", "how", "why"],
                  properties: {
                    name: {type: "string"},
                    sets: {type: "number"},
                    reps: {type: "string"},
                    suggestedWeight: {type: "number"},
                    unit: {type: "string"},
                    how: {type: "string"},
                    why: {type: "string"}
                  }
                }
              }
            }
          }
        }
      }
    })
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`OpenAI request failed: ${status} ${body}`);
  }

  const parsed = JSON.parse(body);
  const text = parsed.output_text || extractResponseText(parsed);
  const output = JSON.parse(text);
  return output.alternatives || [];
}

function extractResponseText(response) {
  const output = response.output || [];
  for (let i = 0; i < output.length; i++) {
    const content = output[i].content || [];
    for (let j = 0; j < content.length; j++) {
      if (content[j].text) return content[j].text;
    }
  }
  return "{}";
}

function getSetting(spreadsheet, key) {
  const sheet = ensureSheet(spreadsheet, SHEETS.settings, SETTINGS_HEADERS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) return values[i][1];
  }
  return "";
}

function setSetting(spreadsheet, key, value) {
  const sheet = ensureSheet(spreadsheet, SHEETS.settings, SETTINGS_HEADERS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function authorizeOpenAIAccess() {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY in Script properties before running this.");
  }

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/models", {
    method: "get",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    muteHttpExceptions: true
  });

  SpreadsheetApp.getActiveSpreadsheet().toast("OpenAI access authorized.");
  return response.getResponseCode();
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
