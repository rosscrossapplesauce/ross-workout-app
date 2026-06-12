const { test, expect } = require("@playwright/test");

async function makeFirstPlanDayToday(page) {
  await page.evaluate(() => {
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    localStorage.setItem("rossWorkout.v1.planSettings", JSON.stringify({
      startDate: local,
      mainGoal: "QA workout flow",
      goals: ["Hybrid"],
      workoutLength: "45",
      daysPerWeek: "5"
    }));
  });
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("app loads to the current plan without requiring sync or AI", async ({ page }) => {
  await expect(page.locator(".weekRoute")).toBeVisible();
  await expect(page.locator(".weekRoute")).toContainText("Your route");
  await expect(page.locator(".weekDay")).toHaveCount(7);
  await expect(page.locator(".todaySnapshot")).toContainText("Today");
  await expect(page.getByRole("button", { name: "Continue today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a new plan" })).toBeVisible();
  await expect(page.getByText("Add sync settings")).toHaveCount(0);
});

test("home week overview text fits without horizontal clipping", async ({ page }) => {
  await expect(page.locator(".weekDay strong").first()).toBeVisible();

  const clipped = await page.locator(".weekDay strong, .weekDayLabel, .weekDayCount").evaluateAll(nodes =>
    nodes.some(node => node.scrollWidth > node.clientWidth + 1)
  );
  expect(clipped).toBe(false);
});

test("clicking a week overview day opens a clean selected workout", async ({ page }) => {
  await page.evaluate(() => {
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    localStorage.setItem("rossWorkout.v1.planSource", "generated");
    localStorage.setItem("rossWorkout.v1.planSettings", JSON.stringify({ startDate: local }));
    localStorage.setItem("rossWorkout.v1.generatedPlan", JSON.stringify({
      name: "QA Generated Plan",
      weeks: [
        {
          week: 1,
          days: [
            {
              day: "Monday",
              title: "Strength",
              row: null,
              run: null,
              exercises: [
                { name: "Chest Press", sets: 3, reps: "8", suggestedWeight: 80, unit: "lb" }
              ]
            },
            {
              day: "Tuesday",
              row: { type: "Easy Row", duration: "20 minutes", intensity: "Zone 2" },
              run: null,
              exercises: []
            },
            { day: "Wednesday", title: "Rest Day", row: null, run: null, exercises: [], recovery: "Rest." },
            { day: "Thursday", title: "Strength", row: null, run: null, exercises: [{ name: "Row", sets: 3, reps: "10", suggestedWeight: 75, unit: "lb" }] },
            { day: "Friday", title: "Run", row: null, run: { distance: "2 miles", intensity: "Easy" }, exercises: [] },
            { day: "Saturday", title: "Recovery", row: null, run: null, exercises: [], recovery: "Mobility." },
            { day: "Sunday", title: "Rest Day", row: null, run: null, exercises: [], recovery: "Rest." }
          ]
        }
      ]
    }));
  });
  await page.reload();

  await page.locator(".weekDay").nth(1).click();

  await expect(page.locator("#screen")).not.toContainText("undefined");
  await expect(page.locator("#dayTitle")).not.toContainText("undefined");
  await expect(page.locator("#dayTitle")).toContainText("20 minutes row");
  await expect(page.locator("#screen")).toContainText("Easy Row");
});

test("returning user can continue directly into today's workout", async ({ page }) => {
  await page.getByRole("button", { name: "Continue today" }).click();

  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible();
  await expect(page.locator(".selector")).toBeHidden();
  await expect(page.locator(".compassDock")).toBeVisible();
  await expect(page.locator(".trailDot").first()).toBeVisible();

  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date());
  await expect(page.locator("#dayTitle")).toContainText(today);
});

test("user can complete an item and advance through the workout", async ({ page }) => {
  await page.getByRole("button", { name: "Continue today" }).click();

  const firstProgress = await page.locator("#progressText").innerText();
  await page.getByRole("button", { name: "Done ✓" }).click();

  await expect(page.locator("#progressText")).not.toHaveText(firstProgress);
  await expect(page.locator("footer button:visible")).toHaveCount(2);
});

test("workout menu reaches list, calendar, settings, and home", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();
  await page.getByRole("button", { name: "Menu" }).click();

  await expect(page.getByRole("button", { name: "Choose exercise" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More actions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.locator(".sheetPanel").getByRole("button", { name: "Home" })).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("button", { name: "Add exercise" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Swap / alternatives" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip exercise (DNC)" })).toBeVisible();
  await expect(page.locator(".sheetPanel").getByRole("button", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset day" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Sync settings")).toHaveCount(0);
  await expect(page.getByText("Apps Script")).toHaveCount(0);
});

test("color settings can be changed from settings", async ({ page }) => {
  await page.getByRole("button", { name: "⚙" }).click();
  await page.getByRole("button", { name: "Color settings" }).click();
  await page.getByText("Dark").click();

  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  const theme = await page.evaluate(() => localStorage.getItem("rossWorkout.v1.theme"));
  expect(theme).toBe("dark");

  await page.getByRole("button", { name: "Back to settings" }).click();
  await expect(page.getByText("Dark")).toBeVisible();
});

test("today's list highlights the currently selected exercise", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Choose exercise" }).click();

  await expect(page.locator(".overviewCurrent")).toHaveCount(1);
  await expect(page.locator(".overviewCurrent")).toContainText("Chest Press Machine");

  await page.getByRole("button", { name: /2 Seated Row Machine/ }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Choose exercise" }).click();

  await expect(page.locator(".overviewCurrent")).toHaveCount(1);
  await expect(page.locator(".overviewCurrent")).toContainText("Seated Row Machine");
});

test("calendar highlights today and offers a path back to workout", async ({ page }) => {
  await page.getByRole("button", { name: "Continue today" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Change day" }).click();

  await expect(page.locator(".calendarToday")).toHaveCount(1);
  await expect(page.locator(".calendarToday")).toContainText("Today");
  await expect(page.locator(".overviewActions button")).toContainText("workout");
  await expect(page.getByText("Pending Sync")).toHaveCount(0);
});

test("exercise alternatives are reachable from workout mode", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();

  await expect(page.locator(".card").getByRole("button", { name: "Alternatives" })).toHaveCount(0);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  const alternatives = page.getByRole("button", { name: "Swap / alternatives" });
  await expect(alternatives).toBeVisible();
  await alternatives.click();

  await expect(page.locator("#alternativesPanel")).toBeVisible();
  await expect(page.locator("#alternativesPanel")).not.toContainText(/Apps Script|backend/i);
});
