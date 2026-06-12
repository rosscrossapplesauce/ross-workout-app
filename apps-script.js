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

const PLAN_GENERATION_RULESET_VERSION = "plan-principles-v0.3";

const PLAN_DAY_TYPES = [
  "Upper Strength",
  "Lower Strength",
  "Full Body Strength",
  "Upper Hypertrophy",
  "Lower Hypertrophy",
  "Zone 2 Cardio",
  "Intervals",
  "Easy Cardio",
  "Recovery / Mobility",
  "Sport Support",
  "Rest"
];

const PRIMARY_GOAL_ARCHETYPES = {
  "General Fitness": {
    strengthDays: [2, 3],
    cardioDays: [2, 3],
    intervalDays: [0, 1],
    hardDayCap: 2,
    notes: "balanced full-body or upper/lower split depending on available days"
  },
  "Build Muscle": {
    strengthDays: [3, 5],
    cardioDays: [1, 3],
    intervalDays: [0, 1],
    hardDayCap: 2,
    notes: "prioritize hypertrophy volume, muscle frequency, and cardio that does not compromise lifting recovery"
  },
  "Build Strength": {
    strengthDays: [3, 4],
    cardioDays: [1, 2],
    intervalDays: [0, 1],
    hardDayCap: 2,
    notes: "prioritize heavier compound movement patterns, longer rests, and controlled accessory volume"
  },
  "Improve Endurance": {
    strengthDays: [2, 3],
    cardioDays: [3, 5],
    intervalDays: [0, 1],
    hardDayCap: 2,
    notes: "mostly Zone 2 and easy aerobic work; strength supports durability"
  },
  "Lose Fat / Improve Body Composition": {
    strengthDays: [3, 4],
    cardioDays: [3, 5],
    intervalDays: [1, 1],
    hardDayCap: 2,
    notes: "prioritize muscle retention, high weekly activity, and recovery without implying workouts guarantee fat loss"
  },
  "Hybrid Strength + Endurance": {
    strengthDays: [3, 4],
    cardioDays: [3, 5],
    intervalDays: [1, 2],
    hardDayCap: 3,
    notes: "manage interference by separating hard lower-body strength and hard endurance stress when possible"
  },
  "Support a Sport": {
    strengthDays: [2, 4],
    cardioDays: [2, 5],
    intervalDays: [0, 1],
    hardDayCap: 2,
    notes: "support the sport without adding soreness or fatigue that impairs it"
  }
};

const READINESS_MODIFIERS = {
  "New to structured training": {
    volumeMultiplier: 0.65,
    hardDayCap: 1,
    progression: "slow",
    rpe: "6-7",
    exerciseBias: "simple machines, dumbbells, bodyweight, and stable movements"
  },
  "Returning after time off": {
    volumeMultiplier: 0.8,
    hardDayCap: 2,
    progression: "moderate after week 1",
    rpe: "6-8",
    exerciseBias: "familiar stable movements with no week-1 workload spike"
  },
  "Currently active": {
    volumeMultiplier: 1,
    hardDayCap: 2,
    progression: "normal",
    rpe: "7-8",
    exerciseBias: "standard exercise complexity"
  },
  "Training hard already": {
    volumeMultiplier: 1.1,
    hardDayCap: 3,
    progression: "normal only if history supports it",
    rpe: "7-9",
    exerciseBias: "higher work tolerance but preserve recovery"
  },
  "Working around pain or injury": {
    volumeMultiplier: 0.7,
    hardDayCap: 1,
    progression: "conservative",
    rpe: "6-7",
    exerciseBias: "stable movements, controlled ranges, and limitation-compatible selections"
  }
};

const PLAN_GENERATION_RULES = [
  `Ruleset: ${PLAN_GENERATION_RULESET_VERSION}`,
  "Generate within these rules. Do not invent a different training philosophy.",
  "Use both aerobic and muscle-strengthening work unless the user clearly requests a short-term narrow goal.",
  "For general fitness, trend toward 150-300 minutes per week of moderate aerobic work or equivalent plus strength work on at least 2 days per week, but beginners and returning users may start below that and progress gradually.",
  "Use conservative starting loads from user samples, prior history, or clearly marked suggestions. Do not require 1RM testing.",
  "Prefer repeatable sets with good form. Do not train every set to failure by default. Failure or near-failure work only fits experienced users with controlled volume and recovery.",
  "For hybrid strength/cardio plans, manage interference risk through volume, intensity, modality, order, and recovery. When strength or hypertrophy is important, place hard strength before hard endurance in the same session when practical or separate hard sessions across days.",
  "Progress running more cautiously than low-impact cardio when lower-body strength, soreness, or limitations are relevant.",
  "Include recovery opportunities every week. Do not remove rest days or double the next workout to make up for missed work.",
  "Apply enabled limitations as constraints. Temporary limitations should affect near-term work; indefinite limitations should persist until the user turns them off.",
  "Exercise substitutions must preserve movement pattern, primary muscle group, equipment context, set/rep intent, and fatigue cost.",
  "Select exercises by evidence-backed constraints: intended movement pattern, target muscle or capacity, user skill, equipment access, loadability, range of motion, fatigue cost, and consistency. Do not claim an exercise is universally best.",
  "For beginners and returning users, prefer simple, common, loggable movements unless experience, sport context, limitations, or preferences justify something more specific.",
  "When equipment is crowded or unavailable, alternatives must preserve the original training intent and update sets, reps, suggested weight, and logging expectations for the chosen substitute.",
  "Do not provide medical advice, diagnosis, injury treatment, or certainty where evidence is mixed.",
  "Generated plans must respect requested days per week and realistic workout length, include recovery structure, apply sport context, and stay usable as an optional local plan preview."
].join("\n");

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
  const scaffold = buildPlanScaffold(settings, payload, extendExisting);
  let plan = callOpenAIForPlan(apiKey, model, payload, extendExisting, scaffold);
  let validation = validateGeneratedPlan(plan, settings, scaffold);
  if (!validation.ok) {
    plan = callOpenAIForPlan(apiKey, model, Object.assign({}, payload, {invalidPlan: plan}), extendExisting, scaffold, validation.issues);
    validation = validateGeneratedPlan(plan, settings, scaffold);
  }
  if (!validation.ok) {
    return {ok: false, error: `Generated plan did not pass planning checks: ${validation.issues.join("; ")}. Try creating the preview again.`};
  }
  plan.generatedAt = new Date().toISOString();
  plan.scaffold = {
    ruleset: PLAN_GENERATION_RULESET_VERSION,
    primaryGoal: scaffold.primaryGoal,
    readiness: scaffold.readiness,
    trainingDaysPerWeek: scaffold.trainingDaysPerWeek,
    dayTypes: scaffold.weeks[0].days.map(day => day.type)
  };
  plan.validation = {
    ruleset: PLAN_GENERATION_RULESET_VERSION,
    checkedAt: plan.generatedAt,
    issues: []
  };
  setSetting(spreadsheet, extendExisting ? "latestPlanExtension" : "latestGeneratedPlan", JSON.stringify(plan));
  setSetting(spreadsheet, extendExisting ? "latestPlanExtensionMeta" : "latestGeneratedPlanMeta", JSON.stringify({
    requestId: payload.requestId || "",
    generatedAt: plan.generatedAt
  }));
  return {ok: true, plan};
}

function buildPlanScaffold(settings, payload, extendExisting) {
  settings = settings || {};
  const primaryGoal = determinePrimaryGoal(settings);
  const readiness = determineReadiness(settings);
  const archetype = PRIMARY_GOAL_ARCHETYPES[primaryGoal] || PRIMARY_GOAL_ARCHETYPES["General Fitness"];
  const readinessRules = READINESS_MODIFIERS[readiness] || READINESS_MODIFIERS["Currently active"];
  const requestedDays = requestedTrainingDays(settings) || defaultTrainingDays(primaryGoal);
  const trainingDays = Math.max(2, Math.min(6, requestedDays));
  const workoutMinutes = requestedWorkoutMinutes(settings) || 45;
  const intervalCap = Math.min(archetype.intervalDays[1], readiness === "New to structured training" || readiness === "Working around pain or injury" ? 0 : archetype.intervalDays[1]);
  const hardDayCap = Math.min(archetype.hardDayCap, readinessRules.hardDayCap);
  const dayTypes = selectWeeklyDayTypes(primaryGoal, trainingDays, intervalCap, settings);
  const weeks = [1, 2, 3, 4].map(week => ({
    week,
    days: dayTypes.map((type, index) => ({
      day: dayName(index),
      type: week === 1 && (readiness === "New to structured training" || readiness === "Returning after time off") && type === "Intervals" ? "Easy Cardio" : type
    }))
  }));

  return {
    ruleset: PLAN_GENERATION_RULESET_VERSION,
    primaryGoal,
    readiness,
    trainingDaysPerWeek: trainingDays,
    workoutMinutes,
    hardDayCap,
    allowedDayTypes: PLAN_DAY_TYPES,
    archetype,
    readinessRules,
    constraints: {
      equipment: settings.gymAccess || "standard gym equipment",
      limitationsEnabled: !!settings.limitationsEnabled,
      limitationDuration: settings.limitationDuration || "",
      limitationTags: settings.limitationTags || [],
      avoidMovements: settings.avoidMovements || "",
      sport: settings.crossTrainingSport || "",
      preferences: payload.preferences || {}
    },
    constructionRules: {
      weeklyStructure: "Use exactly the listed day sequence for each week. Training days are non-Rest and non-Recovery days.",
      dayTitles: "Set each day.title to the scaffold day type exactly, or use it as the first words of the title.",
      exerciseCounts: exerciseCountGuidance(workoutMinutes),
      progression: progressionGuidance(readiness),
      strengthOrder: strengthConstructionRules(),
      cardio: "Cardio must include duration, intensity, and a simple pace/instruction field. Zone 2 should be sustainable. Intervals are hard days.",
      interference: "For hybrid plans, avoid hard intervals immediately before or after heavy lower-body work when possible."
    },
    weeks
  };
}

function determinePrimaryGoal(settings) {
  const text = [
    settings.mainGoal || "",
    Array.isArray(settings.goals) ? settings.goals.join(" ") : "",
    settings.planAdjustment || "",
    settings.crossTrainingSport || ""
  ].join(" ").toLowerCase();

  if (/\bsport|tennis|soccer|basketball|hockey|golf|pickleball|cycling|rowing|running|marathon|triathlon\b/.test(text) && /\bsupport|sport|cross[-\s]?train|performance\b/.test(text)) return "Support a Sport";
  if (/hybrid|strength.*endurance|endurance.*strength|row.*lift|lift.*row/.test(text)) return "Hybrid Strength + Endurance";
  if (/body comp|body composition|fat loss|lose fat|weight loss|lean/.test(text)) return "Lose Fat / Improve Body Composition";
  if (/endurance|cardio|aerobic|run|row|conditioning/.test(text)) return "Improve Endurance";
  if (/strength|strong|power|main lift/.test(text)) return "Build Strength";
  if (/muscle|hypertrophy|size|mass|gain/.test(text)) return "Build Muscle";
  return "General Fitness";
}

function determineReadiness(settings) {
  const text = [
    settings.trainingExperience || "",
    settings.trainingPace || "",
    settings.mainGoal || "",
    settings.avoidMovements || "",
    Array.isArray(settings.limitationTags) ? settings.limitationTags.join(" ") : ""
  ].join(" ").toLowerCase();

  if (settings.limitationsEnabled && /pain|injur|sore|avoid|back|knee|shoulder|hip/.test(text)) return "Working around pain or injury";
  if (/new|beginner|first time|no experience/.test(text)) return "New to structured training";
  if (/return|time away|back after|restart|detrained/.test(text)) return "Returning after time off";
  if (/hard|advanced|high volume|athlete|already training/.test(text)) return "Training hard already";
  return "Currently active";
}

function defaultTrainingDays(primaryGoal) {
  if (primaryGoal === "Improve Endurance" || primaryGoal === "Hybrid Strength + Endurance") return 5;
  if (primaryGoal === "Build Muscle" || primaryGoal === "Lose Fat / Improve Body Composition") return 5;
  return 4;
}

function selectWeeklyDayTypes(primaryGoal, trainingDays, intervalCap, settings) {
  const sportDay = settings && settings.crossTrainingSport ? "Sport Support" : "Zone 2 Cardio";
  const templates = {
    "General Fitness": {
      2: ["Full Body Strength", "Rest", "Zone 2 Cardio", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      3: ["Full Body Strength", "Rest", "Zone 2 Cardio", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      4: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      5: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Easy Cardio", "Full Body Strength", "Recovery / Mobility", "Rest"],
      6: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Easy Cardio", "Full Body Strength", "Recovery / Mobility", "Easy Cardio"]
    },
    "Build Muscle": {
      2: ["Full Body Strength", "Rest", "Upper Hypertrophy", "Rest", "Recovery / Mobility", "Rest", "Rest"],
      3: ["Upper Hypertrophy", "Rest", "Lower Hypertrophy", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      4: ["Upper Hypertrophy", "Rest", "Lower Hypertrophy", "Zone 2 Cardio", "Upper Hypertrophy", "Recovery / Mobility", "Rest"],
      5: ["Upper Hypertrophy", "Zone 2 Cardio", "Lower Hypertrophy", "Rest", "Upper Hypertrophy", "Lower Hypertrophy", "Recovery / Mobility"],
      6: ["Upper Hypertrophy", "Zone 2 Cardio", "Lower Hypertrophy", "Upper Hypertrophy", "Easy Cardio", "Lower Hypertrophy", "Recovery / Mobility"]
    },
    "Build Strength": {
      2: ["Full Body Strength", "Rest", "Easy Cardio", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      3: ["Full Body Strength", "Rest", "Upper Strength", "Easy Cardio", "Lower Strength", "Recovery / Mobility", "Rest"],
      4: ["Upper Strength", "Easy Cardio", "Lower Strength", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      5: ["Upper Strength", "Easy Cardio", "Lower Strength", "Rest", "Full Body Strength", "Zone 2 Cardio", "Rest"],
      6: ["Upper Strength", "Easy Cardio", "Lower Strength", "Zone 2 Cardio", "Full Body Strength", "Recovery / Mobility", "Easy Cardio"]
    },
    "Improve Endurance": {
      2: ["Full Body Strength", "Rest", "Zone 2 Cardio", "Rest", "Recovery / Mobility", "Rest", "Rest"],
      3: ["Full Body Strength", "Zone 2 Cardio", "Rest", "Easy Cardio", "Full Body Strength", "Recovery / Mobility", "Rest"],
      4: ["Full Body Strength", "Zone 2 Cardio", "Rest", intervalCap ? "Intervals" : "Easy Cardio", "Full Body Strength", "Recovery / Mobility", "Rest"],
      5: ["Full Body Strength", "Zone 2 Cardio", "Easy Cardio", "Rest", intervalCap ? "Intervals" : "Easy Cardio", "Full Body Strength", "Recovery / Mobility"],
      6: ["Full Body Strength", "Zone 2 Cardio", "Easy Cardio", "Lower Strength", intervalCap ? "Intervals" : "Easy Cardio", "Zone 2 Cardio", "Recovery / Mobility"]
    },
    "Lose Fat / Improve Body Composition": {
      2: ["Full Body Strength", "Rest", "Zone 2 Cardio", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      3: ["Full Body Strength", "Zone 2 Cardio", "Rest", "Lower Strength", "Easy Cardio", "Recovery / Mobility", "Rest"],
      4: ["Upper Strength", intervalCap ? "Intervals" : "Zone 2 Cardio", "Lower Strength", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      5: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Rest", "Full Body Strength", intervalCap ? "Intervals" : "Easy Cardio", "Rest"],
      6: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Easy Cardio", "Full Body Strength", intervalCap ? "Intervals" : "Recovery / Mobility", "Rest"]
    },
    "Hybrid Strength + Endurance": {
      2: ["Full Body Strength", "Rest", "Zone 2 Cardio", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      3: ["Upper Strength", "Zone 2 Cardio", "Rest", "Lower Strength", "Easy Cardio", "Recovery / Mobility", "Rest"],
      4: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      5: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Rest", "Full Body Strength", intervalCap ? "Intervals" : "Easy Cardio", "Rest"],
      6: ["Upper Strength", "Zone 2 Cardio", "Lower Strength", "Easy Cardio", "Full Body Strength", intervalCap ? "Intervals" : sportDay, "Recovery / Mobility"]
    },
    "Support a Sport": {
      2: ["Full Body Strength", "Rest", sportDay, "Rest", "Full Body Strength", "Recovery / Mobility", "Rest"],
      3: ["Full Body Strength", sportDay, "Rest", "Lower Strength", "Easy Cardio", "Recovery / Mobility", "Rest"],
      4: ["Upper Strength", sportDay, "Lower Strength", "Rest", "Zone 2 Cardio", "Recovery / Mobility", "Rest"],
      5: ["Upper Strength", sportDay, "Lower Strength", "Easy Cardio", "Full Body Strength", "Recovery / Mobility", "Rest"],
      6: ["Upper Strength", sportDay, "Lower Strength", "Zone 2 Cardio", "Full Body Strength", "Easy Cardio", "Recovery / Mobility"]
    }
  };
  const byGoal = templates[primaryGoal] || templates["General Fitness"];
  return byGoal[trainingDays] || byGoal[4];
}

function dayName(index) {
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index] || `Day ${index + 1}`;
}

function exerciseCountGuidance(minutes) {
  if (minutes <= 30) return "2-4 exercises on strength days; keep cardio simple.";
  if (minutes <= 45) return "3-5 exercises on strength days; 4-6 only when simple.";
  if (minutes <= 60) return "4-6 exercises on strength days.";
  return "4-7 exercises on strength days; avoid bloated lists.";
}

function progressionGuidance(readiness) {
  if (readiness === "New to structured training") return "Use 2-3 sets, RPE 6-7, and slower double progression.";
  if (readiness === "Returning after time off") return "Reduce week-1 volume 15-30%, then progress gradually with double progression.";
  if (readiness === "Working around pain or injury") return "Use conservative loading, stable exercises, and no medical rehab claims.";
  if (readiness === "Training hard already") return "Allow more work only when recent history supports it; preserve recovery.";
  return "Use normal double progression at mostly RPE 7-8.";
}

function strengthConstructionRules() {
  return {
    "Upper Strength": ["Primary push or pull", "Opposing major movement", "Secondary push/pull", "Shoulder or upper-back stabilizer", "Arm accessory", "Optional core/mobility"],
    "Lower Strength": ["Primary squat or leg press pattern", "Hinge pattern", "Single-leg or unilateral pattern unless excluded", "Hamstring or glute accessory", "Calf or trunk accessory", "Optional mobility"],
    "Full Body Strength": ["Lower compound", "Upper push", "Upper pull", "Hinge or posterior chain", "Core", "Optional conditioning finisher"],
    "Upper Hypertrophy": ["Major push", "Major pull", "Secondary push/pull", "Lateral/rear delt or upper back", "Arm accessory"],
    "Lower Hypertrophy": ["Squat or leg press pattern", "Hinge or glute pattern", "Unilateral or machine accessory", "Hamstring or quad accessory", "Calf or trunk accessory"]
  };
}

function validateGeneratedPlan(plan, settings, scaffold) {
  const issues = [];
  const weeks = plan && Array.isArray(plan.weeks) ? plan.weeks : [];
  if (weeks.length !== 4) {
    issues.push("plan must contain exactly 4 weeks");
  }

  const requestedDays = requestedTrainingDays(settings);
  const requestedMinutes = requestedWorkoutMinutes(settings);
  const avoidTerms = explicitAvoidTerms(settings);
  const scaffoldWeeks = scaffold && Array.isArray(scaffold.weeks) ? scaffold.weeks : [];
  const hardDayCap = scaffold && scaffold.hardDayCap ? scaffold.hardDayCap : 3;
  const minStrengthDays = scaffold ? minimumStrengthDays(scaffold) : 0;

  weeks.forEach((week, weekIndex) => {
    const days = Array.isArray(week.days) ? week.days : [];
    if (!days.length) {
      issues.push(`week ${weekIndex + 1} has no training days`);
      return;
    }
    const expectedDays = scaffoldWeeks[weekIndex] && scaffoldWeeks[weekIndex].days || [];
    if (expectedDays.length && days.length !== expectedDays.length) {
      issues.push(`week ${weekIndex + 1} must follow the scaffold with ${expectedDays.length} days`);
    }

    const trainingDays = days.filter(hasTrainingWork).length;
    const hasRecovery = days.some(day => String(day.recovery || "").trim() || !hasTrainingWork(day));
    const strengthDays = days.filter(hasStrengthWork).length;
    const hardDays = days.filter(isHardTrainingDay).length;
    if (!hasRecovery) {
      issues.push(`week ${weekIndex + 1} has no recovery opportunity`);
    }
    if (scaffold && trainingDays !== scaffold.trainingDaysPerWeek) {
      issues.push(`week ${weekIndex + 1} has ${trainingDays} training days but scaffold requires ${scaffold.trainingDaysPerWeek}`);
    } else if (requestedDays && trainingDays > requestedDays) {
      issues.push(`week ${weekIndex + 1} has ${trainingDays} training days but user requested ${requestedDays}`);
    }
    if (hardDays > hardDayCap) {
      issues.push(`week ${weekIndex + 1} has ${hardDays} hard days but cap is ${hardDayCap}`);
    }
    if (minStrengthDays && requestedDays >= 2 && strengthDays < minStrengthDays) {
      issues.push(`week ${weekIndex + 1} has ${strengthDays} strength days but goal needs at least ${minStrengthDays}`);
    }

    days.forEach((day, dayIndex) => {
      const expectedType = expectedDays[dayIndex] && expectedDays[dayIndex].type;
      if (scaffold && expectedType && !dayMatchesScaffoldType(day, expectedType)) {
        issues.push(`week ${weekIndex + 1} day ${dayIndex + 1} should be ${expectedType}`);
      }
      const dayType = dayTypeFor(day);
      if (!dayType) {
        issues.push(`week ${weekIndex + 1} day ${dayIndex + 1} has no clear day type`);
      }

      const estimatedMinutes = estimateWorkoutMinutes(day);
      if (requestedMinutes && estimatedMinutes > requestedMinutes + 25) {
        issues.push(`week ${weekIndex + 1} day ${dayIndex + 1} is too long for requested workout length`);
      }
      if (Array.isArray(day.exercises) && day.exercises.length > maxExercisesForMinutes(requestedMinutes || scaffold && scaffold.workoutMinutes || 45)) {
        issues.push(`week ${weekIndex + 1} day ${dayIndex + 1} has too many exercises for session length`);
      }
      duplicateExercises(day).forEach(name => {
        issues.push(`week ${weekIndex + 1} day ${dayIndex + 1} repeats ${name}`);
      });
      validateExerciseFields(day, weekIndex, dayIndex, issues);
      validateCardioFields(day.row, "row", weekIndex, dayIndex, issues);
      validateCardioFields(day.run, "run", weekIndex, dayIndex, issues);

      avoidTerms.forEach(term => {
        if (dayContradictsAvoidTerm(day, term)) {
          issues.push(`week ${weekIndex + 1} day ${dayIndex + 1} includes ${term.label}`);
        }
      });
    });
  });
  gradualProgressionIssues(weeks).forEach(issue => issues.push(issue));

  return {ok: issues.length === 0, issues: issues.slice(0, 8)};
}

function dayTypeFor(day) {
  const title = String(day && day.title || "").toLowerCase();
  if (!day || !title) return "";
  for (let i = 0; i < PLAN_DAY_TYPES.length; i++) {
    const type = PLAN_DAY_TYPES[i];
    const normalized = type.toLowerCase().replace(/\s*\/\s*/g, " ");
    if (title.indexOf(normalized) !== -1 || normalized.indexOf(title) !== -1) return type;
  }
  if (!hasTrainingWork(day) && String(day.recovery || "").trim()) return "Recovery / Mobility";
  if (!hasTrainingWork(day)) return "Rest";
  return "";
}

function dayMatchesScaffoldType(day, expectedType) {
  if (!expectedType) return true;
  if (expectedType === "Rest") return !hasTrainingWork(day);
  if (expectedType === "Recovery / Mobility") return !hasTrainingWork(day) || /recovery|mobility/i.test(String(day.title || day.recovery || ""));
  const actual = dayTypeFor(day);
  return actual === expectedType || String(day.title || "").toLowerCase().indexOf(expectedType.toLowerCase()) === 0;
}

function minimumStrengthDays(scaffold) {
  const target = scaffold && scaffold.archetype && scaffold.archetype.strengthDays;
  if (!target) return 0;
  return Math.min(target[0], scaffold.trainingDaysPerWeek || target[0]);
}

function hasStrengthWork(day) {
  if (!day || !Array.isArray(day.exercises) || !day.exercises.length) return false;
  const type = dayTypeFor(day);
  return /strength|hypertrophy|full body/i.test(type || day.title || "");
}

function isHardTrainingDay(day) {
  if (!day || !hasTrainingWork(day)) return false;
  const text = [
    day.title || "",
    day.row && [day.row.type, day.row.intensity, day.row.pace].join(" "),
    day.run && [day.run.type, day.run.intensity, day.run.pace].join(" ")
  ].filter(Boolean).join(" ").toLowerCase();
  return /interval|tempo|threshold|sprint|race|hard|heavy|max effort|vo2|max\b/.test(text);
}

function maxExercisesForMinutes(minutes) {
  if (!minutes) return 7;
  if (minutes <= 30) return 4;
  if (minutes <= 45) return 5;
  if (minutes <= 60) return 6;
  return 7;
}

function duplicateExercises(day) {
  const seen = {};
  const duplicates = [];
  (day.exercises || []).forEach(exercise => {
    const name = String(exercise.name || "").trim().toLowerCase();
    if (!name) return;
    if (seen[name] && duplicates.indexOf(exercise.name) === -1) duplicates.push(exercise.name);
    seen[name] = true;
  });
  return duplicates;
}

function validateExerciseFields(day, weekIndex, dayIndex, issues) {
  (day.exercises || []).forEach((exercise, exerciseIndex) => {
    const label = `week ${weekIndex + 1} day ${dayIndex + 1} exercise ${exerciseIndex + 1}`;
    if (!String(exercise.name || "").trim()) issues.push(`${label} is missing name`);
    if (String(exercise.name || "").length > 48) issues.push(`${label} name is too long for workout cards`);
    if (!Number.isFinite(Number(exercise.sets)) || Number(exercise.sets) < 1) issues.push(`${label} is missing sets`);
    if (!String(exercise.reps || "").trim()) issues.push(`${label} is missing reps`);
    if (!Number.isFinite(Number(exercise.suggestedWeight))) issues.push(`${label} is missing suggested weight`);
    if (!String(exercise.unit || "").trim()) issues.push(`${label} is missing unit`);
    if (exercise.notes === undefined || exercise.notes === null) issues.push(`${label} is missing notes`);
  });
}

function validateCardioFields(cardio, kind, weekIndex, dayIndex, issues) {
  if (!cardio) return;
  const label = `week ${weekIndex + 1} day ${dayIndex + 1} ${kind}`;
  if (!String(cardio.duration || "").trim()) issues.push(`${label} is missing duration`);
  if (!String(cardio.intensity || "").trim()) issues.push(`${label} is missing intensity`);
  if (!String(cardio.pace || "").trim()) issues.push(`${label} is missing simple instructions`);
}

function gradualProgressionIssues(weeks) {
  const issues = [];
  const previousByExercise = {};
  weeks.forEach((week, weekIndex) => {
    (week.days || []).forEach(day => {
      (day.exercises || []).forEach(exercise => {
        const name = String(exercise.name || "").toLowerCase();
        const weight = Number(exercise.suggestedWeight);
        if (!name || !Number.isFinite(weight) || weight <= 0) return;
        const previous = previousByExercise[name];
        if (previous && weekIndex > previous.weekIndex && weight > previous.weight * 1.35 + 5) {
          issues.push(`${exercise.name} jumps too quickly from week ${previous.weekIndex + 1} to week ${weekIndex + 1}`);
        }
        previousByExercise[name] = {weight, weekIndex};
      });
    });
  });
  return issues.slice(0, 4);
}

function requestedTrainingDays(settings) {
  const value = Number(settings && settings.daysPerWeek);
  return Number.isFinite(value) && value >= 1 && value <= 7 ? value : 0;
}

function requestedWorkoutMinutes(settings) {
  const match = String(settings && settings.workoutLength || "").match(/\d+/);
  if (!match) return 0;
  const value = Number(match[0]);
  return Number.isFinite(value) && value >= 15 ? value : 0;
}

function hasTrainingWork(day) {
  return !!(day && (day.row || day.run || (Array.isArray(day.exercises) && day.exercises.length)));
}

function estimateWorkoutMinutes(day) {
  if (!day) return 0;
  const exerciseMinutes = Array.isArray(day.exercises)
    ? day.exercises.reduce((total, exercise) => total + Math.max(4, Number(exercise.sets) || 1) * 3, 0)
    : 0;
  return exerciseMinutes + cardioMinutes(day.row) + cardioMinutes(day.run);
}

function cardioMinutes(cardio) {
  if (!cardio) return 0;
  const text = [cardio.duration, cardio.pace, cardio.intensity].filter(Boolean).join(" ");
  const minuteMatch = text.match(/(\d+)\s*(?:min|minute)/i);
  if (minuteMatch) return Number(minuteMatch[1]) || 0;
  const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) return Number(rangeMatch[2]) || 0;
  return 0;
}

function explicitAvoidTerms(settings) {
  const terms = [];
  const tags = Array.isArray(settings && settings.limitationTags) ? settings.limitationTags : [];
  const text = String(settings && settings.avoidMovements || "").toLowerCase();
  const active = !!(settings && settings.limitationsEnabled);
  if (!active) return terms;

  if (tags.includes("Avoid running") || /\b(?:avoid|no)\s+running\b/.test(text)) {
    terms.push({label: "running", patterns: [/\brun(?:ning)?\b/i]});
  }
  if (tags.includes("Avoid overhead pressing") || /\b(?:avoid|no)\s+(?:overhead|shoulder|military)\s+press/i.test(text)) {
    terms.push({label: "overhead pressing", patterns: [/\boverhead press\b/i, /\bshoulder press\b/i, /\bmilitary press\b/i]});
  }
  if (tags.includes("Avoid heavy lower body") || /\b(?:avoid|no)\s+(?:heavy\s+)?(?:squat|deadlift|leg press)/i.test(text)) {
    terms.push({label: "heavy lower body work", patterns: [/\bback squat\b/i, /\bbarbell squat\b/i, /\bdeadlift\b/i, /\bleg press\b/i]});
  }
  if (/\b(?:avoid|no)\s+(?:barbell\s+)?squats?\b/i.test(text)) {
    terms.push({label: "squats", patterns: [/\bsquat\b/i]});
  }

  return terms;
}

function dayContradictsAvoidTerm(day, term) {
  const pieces = [];
  if (day.run && term.label === "running") return true;
  if (day.title) pieces.push(day.title);
  if (day.recovery) pieces.push(day.recovery);
  (day.exercises || []).forEach(exercise => {
    pieces.push(exercise.name || "");
    pieces.push(exercise.notes || "");
  });
  const text = pieces.join(" ");
  return term.patterns.some(pattern => pattern.test(text));
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

function callOpenAIForPlan(apiKey, model, payload, extendExisting, scaffold, repairIssues) {
  const settings = payload.settings || {};
  const isPlanAdjustment = !!settings.planAdjustment && !!payload.currentPlan;
  const prompt = [
    extendExisting ? "Create the next 4 weeks of this gym-friendly training plan as JSON." : "Create a conservative, gym-friendly training plan as JSON.",
    "Do not invent the weekly structure from scratch. The app owns the coaching scaffold; fill only the details inside the scaffold.",
    `Readiness modifier: ${scaffold && scaffold.readiness || "Currently active"}. Apply its volume, intensity, complexity, and progression effects.`,
    "Keep workouts efficient and minimal. One day should fit the requested workout length.",
    "Use rowing, running, strength, and rest according to the user's goals and notes.",
    "If weight-loss timing is mentioned, keep it realistic and training-focused rather than promising fat loss.",
    "Return 4 weeks. Each week must contain the exact seven day entries from the scaffold. Rest/recovery days count as day entries but not training days.",
    "Set each day.title to the scaffold day type exactly, or begin the title with that day type.",
    "For Rest days, use no row, no run, no exercises, and a short recovery note.",
    "For Recovery / Mobility days, use no hard training and keep the recovery note simple.",
    "For strength exercises, suggest conservative numeric starting weights in pounds. Use 0 only for bodyweight movements.",
    "Every exercise must include name, sets, reps, suggestedWeight, unit, and notes. Keep exercise names short enough for workout cards.",
    "Each cardio entry must include type, duration, intensity, and pace; pace should be simple user-facing instructions.",
    isPlanAdjustment ? `This is a plan edit request: ${settings.planAdjustment}. The changes field must explain what is different from the current plan, not just summarize the new plan.` : "For a brand-new plan, the changes field may briefly say this is the initial generated plan.",
    repairIssues && repairIssues.length ? "Repair mode: the previous candidate failed validation. Fix every listed issue while preserving the scaffold." : "",
    repairIssues && repairIssues.length ? `Validation issues to repair: ${JSON.stringify(repairIssues)}` : "",
    repairIssues && repairIssues.length ? `Invalid candidate to repair: ${JSON.stringify(payload.invalidPlan || {})}` : "",
    "",
    "Plan generation rules:",
    PLAN_GENERATION_RULES,
    "",
    "App-owned scaffold to fill:",
    JSON.stringify(scaffold || {}),
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
    extendExisting || payload.currentPlan ? "Current plan to compare or continue:" : "Current plan to compare or continue: none",
    JSON.stringify(payload.currentPlan || null),
    "",
    "JSON shape: {\"plan\":{\"name\":\"...\",\"summary\":\"...\",\"changes\":\"...\",\"notes\":\"...\",\"units\":\"lb unless noted\",\"weeks\":[...]}}"
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
        required: ["name", "summary", "changes", "notes", "units", "weeks"],
        properties: {
          name: {type: "string"},
          summary: {type: "string"},
          changes: {type: "string"},
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
