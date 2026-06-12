const { test, expect } = require("@playwright/test");

async function openNewPlan(page) {
  await page.getByRole("button", { name: "Create a new plan" }).click();
}

async function mockGenerator(page, response = {}) {
  await page.route("https://generator.test/**", route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    route.fulfill({
      contentType: "application/javascript",
      body: `${callback}(${JSON.stringify({
        ok: true,
        plan: {
          name: "Mock Generated Plan",
          summary: "A test generated plan.",
          changes: "Initial generated plan.",
          notes: "Review before switching.",
          units: "lb unless noted",
          weeks: Array.from({ length: 4 }, (_, weekIndex) => ({
            week: weekIndex + 1,
            days: [
              {
                day: "Monday",
                title: "Upper Strength",
                row: null,
                run: null,
                recovery: "",
                exercises: [
                  { name: "Chest Press Machine", sets: 3, reps: "8", suggestedWeight: 80, unit: "lb", notes: "" }
                ]
              },
              {
                day: "Tuesday",
                title: "Recovery",
                row: null,
                run: null,
                recovery: "Easy walk and mobility.",
                exercises: []
              },
              {
                day: "Wednesday",
                title: "Row Base",
                row: { type: "Row", duration: "20 minutes", intensity: "Easy", pace: "Conversational" },
                run: null,
                recovery: "",
                exercises: []
              }
            ]
          }))
        },
        ...response
      })});`
    });
  });
  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.syncUrl", "https://generator.test/exec");
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("new plan onboarding presents clear paths", async ({ page }) => {
  await openNewPlan(page);

  await expect(page.locator("#dayTitle")).toContainText("Start");
  await expect(page.locator("#dayTitle")).toContainText("Training");
  await expect(page.locator("#progressText")).toContainText("Pick the path that fits");
  await expect(page.getByRole("button", { name: /Build a new plan/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Modify current plan/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /I know what I want/i })).toHaveCount(0);
  await expect(page.locator("footer button:visible")).toHaveCount(0);
});

test("new plan setup uses scaffold lists and no starting weight inputs", async ({ page }) => {
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build a new plan/i }).click();

  await expect(page.locator("#progressText")).toContainText("Scaffold choices");
  await expect(page.locator(".setupPanel > .setupHint")).toContainText("No starting weights here");
  await expect(page.getByRole("button", { name: "Create preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.locator("details.advancedSetup")).toHaveCount(0);
  await expect(page.locator(".strengthRow")).toHaveCount(0);
  await expect(page.getByLabel("Workout length")).toHaveValue("45");
  await expect(page.getByLabel("Workout length").locator("option")).toContainText(["30-45 min", "45-60 min", "60-75 min", "75-90 min"]);
  await expect(page.getByLabel("Main goal").locator("option")).toContainText([
    "General Fitness",
    "Build Muscle",
    "Build Strength",
    "Improve Endurance",
    "Lose Fat / Improve Body Composition",
    "Hybrid Strength + Endurance",
    "Support a Sport"
  ]);
});

test("new plan setup saves scaffold choices without starting weights", async ({ page }) => {
  await mockGenerator(page);
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build a new plan/i }).click();

  await page.getByLabel("Main goal").selectOption("Support a Sport");
  await page.getByLabel("Experience").selectOption("Returning after time off");
  await page.getByLabel("Emphasis").selectOption("Sport performance support");
  await page.getByLabel("Days/week").selectOption("4");
  await page.getByLabel("Workout length").selectOption("60");
  await page.getByLabel("Gym access").selectOption("Limited gym");
  await page.getByLabel("Rest days").selectOption("Wednesday, Sunday");
  await page.getByLabel("Cross-training sport").selectOption("Tennis");
  await page.getByRole("button", { name: "Create preview" }).click();

  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.planSettings")));
  expect(settings.mainGoal).toBe("Support a Sport");
  expect(settings.goals).toEqual(["Support a Sport", "Cross training"]);
  expect(settings.trainingExperience).toBe("Returning after time off");
  expect(settings.trainingPace).toBe("Sport performance support");
  expect(settings.daysPerWeek).toBe("4");
  expect(settings.workoutLength).toBe("60");
  expect(settings.gymAccess).toBe("Limited gym");
  expect(settings.restDays).toBe("Wednesday, Sunday");
  expect(settings.crossTrainingSport).toBe("Tennis");
  expect(settings.strengthSamples).toEqual([]);
  expect(settings.planBias.sport).toBe("Tennis");
  expect(settings.planBias.startingWeights).toEqual([]);
});

test("unfinished plan generation can be checked after reopening", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.planRequest", JSON.stringify({
      id: "qa-plan-request",
      type: "new",
      label: "Your plan preview may still be finishing.",
      createdAt: new Date().toISOString()
    }));
  });
  await page.reload();

  await expect(page.getByRole("button", { name: "Check for preview" })).toBeVisible();
  await expect(page.getByText("Your plan preview may still be finishing.")).toBeVisible();
});

test("plan preview uses the configured backend without user sync setup", async ({ page }) => {
  await mockGenerator(page);
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build a new plan/i }).click();

  await expect(page.getByText(/sync settings|Apps Script/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Create preview" }).click();

  await expect(page.getByText("Plan preview ready")).toBeVisible();
  await expect(page.getByText("Mock Generated Plan")).toBeVisible();
  await expect(page.getByText(/Connect generation|sync settings|Apps Script/i)).toHaveCount(0);
});

test("validation rejection is explained in user language", async ({ page }) => {
  await page.route("https://generator.test/**", route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    route.fulfill({
      contentType: "application/javascript",
      body: `${callback}(${JSON.stringify({
        ok: false,
        error: "Generated plan did not pass planning checks: week 1 has no recovery opportunity."
      })});`
    });
  });

  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.syncUrl", "https://generator.test/exec");
  });
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build a new plan/i }).click();
  await page.getByRole("button", { name: "Create preview" }).click();

  await expect(page.getByText("That preview did not meet your plan rules")).toBeVisible();
  await expect(page.getByText("planning checks")).toHaveCount(0);
});

test("plan service errors stay out of setup language", async ({ page }) => {
  await page.route("https://generator.test/**", route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    route.fulfill({
      contentType: "application/javascript",
      body: `${callback}(${JSON.stringify({
        ok: false,
        error: "OpenAI key is not set in Apps Script properties."
      })});`
    });
  });

  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.syncUrl", "https://generator.test/exec");
  });
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build a new plan/i }).click();
  await page.getByRole("button", { name: "Create preview" }).click();

  await expect(page.getByText("Plan preview could not be created right now")).toBeVisible();
  await expect(page.getByText(/generation settings|backend|Apps Script|OpenAI/i)).toHaveCount(0);
});

test("slow plan generation leaves 94 percent and still accepts a late preview", async ({ page }) => {
  await page.route("https://generator.test/**", async route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    await new Promise(resolve => setTimeout(resolve, 250));
    route.fulfill({
      contentType: "application/javascript",
      body: `${callback}(${JSON.stringify({
        ok: true,
        plan: {
          name: "Late Preview Plan",
          summary: "A delayed but valid generated plan.",
          changes: "Initial generated plan.",
          notes: "Review before switching.",
          units: "lb unless noted",
          weeks: Array.from({ length: 4 }, (_, weekIndex) => ({
            week: weekIndex + 1,
            days: [
              {
                day: "Monday",
                title: "Upper Strength",
                row: null,
                run: null,
                recovery: "",
                exercises: [
                  { name: "Chest Press Machine", sets: 3, reps: "8", suggestedWeight: 80, unit: "lb", notes: "" }
                ]
              },
              {
                day: "Tuesday",
                title: "Recovery",
                row: null,
                run: null,
                recovery: "Easy walk and mobility.",
                exercises: []
              },
              {
                day: "Wednesday",
                title: "Row Base",
                row: { type: "Row", duration: "20 minutes", intensity: "Easy", pace: "Conversational" },
                run: null,
                recovery: "",
                exercises: []
              }
            ]
          }))
        }
      })});`
    });
  });

  await page.evaluate(() => {
    window.__ROSS_PLAN_SOFT_TIMEOUT_MS = 50;
    window.__ROSS_PLAN_HARD_TIMEOUT_MS = 2000;
    localStorage.setItem("rossWorkout.v1.syncUrl", "https://generator.test/exec");
  });
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build a new plan/i }).click();
  await page.getByRole("button", { name: "Create preview" }).click();

  await expect(page.getByText("The generator is still working")).toBeVisible();
  await expect(page.locator("#planProgressCard")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check for preview" })).toBeVisible();
  await expect(page.getByText("Plan preview ready")).toBeVisible();
  await expect(page.getByText("Late Preview Plan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use this plan" })).toBeVisible();
});

test("maximum gains plan edit preview explains what changed", async ({ page }) => {
  await page.route("https://generator.test/**", async route => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get("callback");
    const payload = JSON.parse(url.searchParams.get("payload"));
    expect(payload.settings.planAdjustment).toBe("Maximum gains");
    expect(payload.currentPlan.weeks.length).toBeGreaterThan(0);
    route.fulfill({
      contentType: "application/javascript",
      body: `${callback}(${JSON.stringify({
        ok: true,
        plan: {
          name: "Maximum Gains Preview",
          summary: "A higher-output plan with recoverable strength and conditioning progress.",
          changes: "Adds one upper-body volume block, keeps rowing aerobic, and protects recovery instead of simply adding more work.",
          notes: "Review before switching.",
          units: "lb unless noted",
          weeks: Array.from({ length: 4 }, (_, weekIndex) => ({
            week: weekIndex + 1,
            days: [
              {
                day: "Monday",
                title: "Upper Strength",
                row: null,
                run: null,
                recovery: "",
                exercises: [
                  { name: "Chest Press Machine", sets: 3, reps: "8", suggestedWeight: 80, unit: "lb", notes: "" }
                ]
              },
              {
                day: "Tuesday",
                title: "Recovery",
                row: null,
                run: null,
                recovery: "Easy walk and mobility.",
                exercises: []
              },
              {
                day: "Wednesday",
                title: "Row Base",
                row: { type: "Row", duration: "20 minutes", intensity: "Easy", pace: "Conversational" },
                run: null,
                recovery: "",
                exercises: []
              }
            ]
          }))
        }
      })});`
    });
  });

  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.syncUrl", "https://generator.test/exec");
  });
  await openNewPlan(page);
  await page.getByRole("button", { name: /Modify current plan/i }).click();
  await page.getByRole("button", { name: /Maximum gains/i }).click();

  await expect(page.getByText("What changed:")).toBeVisible();
  await expect(page.getByText("Adds one upper-body volume block")).toBeVisible();
  await expect(page.getByText("A higher-output plan with recoverable strength")).toBeVisible();
});
