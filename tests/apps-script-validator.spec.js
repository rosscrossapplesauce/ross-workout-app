const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { test, expect } = require("@playwright/test");

function loadAppsScriptValidator() {
  const script = fs.readFileSync(path.join(__dirname, "..", "apps-script.js"), "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${script}\nthis.__validator = { validateGeneratedPlan, PLAN_GENERATION_RULESET_VERSION, PLAN_GENERATION_RULES };`, sandbox);
  return sandbox.__validator;
}

function validPlan(overrides = {}) {
  return {
    name: "Validated plan",
    summary: "A conservative plan.",
    notes: "",
    units: "lb unless noted",
    weeks: Array.from({ length: 4 }, (_, weekIndex) => ({
      week: weekIndex + 1,
      days: [
        {
          day: "Day 1",
          title: "Strength",
          row: null,
          run: null,
          recovery: "",
          exercises: [
            { name: "Chest Press Machine", sets: 3, reps: "8", suggestedWeight: 80, unit: "lb", notes: "" }
          ]
        },
        {
          day: "Day 2",
          title: "Recovery",
          row: null,
          run: null,
          recovery: "Easy walk and mobility.",
          exercises: []
        }
      ]
    })),
    ...overrides
  };
}

test("generated plan validator accepts a conservative plan", async () => {
  const { validateGeneratedPlan } = loadAppsScriptValidator();

  const result = validateGeneratedPlan(validPlan(), {
    daysPerWeek: "3",
    workoutLength: "45",
    limitationsEnabled: false
  });

  expect(result.ok).toBe(true);
  expect(result.issues).toEqual([]);
});

test("generated plan validator rejects missing recovery", async () => {
  const { validateGeneratedPlan } = loadAppsScriptValidator();
  const plan = validPlan({
    weeks: Array.from({ length: 4 }, (_, weekIndex) => ({
      week: weekIndex + 1,
      days: [
        {
          day: "Day 1",
          title: "Strength",
          row: null,
          run: null,
          recovery: "",
          exercises: [
            { name: "Chest Press Machine", sets: 3, reps: "8", suggestedWeight: 80, unit: "lb", notes: "" }
          ]
        }
      ]
    }))
  });

  const result = validateGeneratedPlan(plan, {
    daysPerWeek: "3",
    workoutLength: "45",
    limitationsEnabled: false
  });

  expect(result.ok).toBe(false);
  expect(result.issues.join(" ")).toContain("no recovery opportunity");
});

test("generated plan validator rejects explicit limitation contradictions", async () => {
  const { validateGeneratedPlan } = loadAppsScriptValidator();
  const plan = validPlan({
    weeks: Array.from({ length: 4 }, (_, weekIndex) => ({
      week: weekIndex + 1,
      days: [
        {
          day: "Day 1",
          title: "Run",
          row: null,
          run: { type: "Run", duration: "30 minutes", intensity: "Easy", pace: "Conversational" },
          recovery: "",
          exercises: []
        },
        {
          day: "Day 2",
          title: "Recovery",
          row: null,
          run: null,
          recovery: "Rest.",
          exercises: []
        }
      ]
    }))
  });

  const result = validateGeneratedPlan(plan, {
    daysPerWeek: "3",
    workoutLength: "45",
    limitationsEnabled: true,
    limitationTags: ["Avoid running"],
    avoidMovements: ""
  });

  expect(result.ok).toBe(false);
  expect(result.issues.join(" ")).toContain("running");
});

test("plan generation rules include exercise selection constraints", async () => {
  const { PLAN_GENERATION_RULESET_VERSION, PLAN_GENERATION_RULES } = loadAppsScriptValidator();

  expect(PLAN_GENERATION_RULESET_VERSION).toBe("plan-principles-v0.2");
  expect(PLAN_GENERATION_RULES).toContain("Select exercises by evidence-backed constraints");
  expect(PLAN_GENERATION_RULES).toContain("Do not claim an exercise is universally best");
  expect(PLAN_GENERATION_RULES).toContain("alternatives must preserve the original training intent");
});
