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

test("mobile workout screen keeps the primary action visible and uncluttered", async ({ page }) => {
  await page.getByRole("button", { name: "Continue current plan" }).click();

  const visibleHeaderButtons = await page.locator("header button:visible").allTextContents();
  const visibleFooterButtons = await page.locator("footer button:visible").allTextContents();

  expect(visibleHeaderButtons.map(text => text.trim())).toEqual(["Menu"]);
  expect(visibleFooterButtons.map(text => text.trim())).toEqual(["Done ✓"]);
});

test("core workout use does not require sync setup", async ({ page }) => {
  await page.getByRole("button", { name: "Continue current plan" }).click();
  await page.getByRole("button", { name: "Done ✓" }).click();

  await expect(page.getByText("Add sync settings")).toHaveCount(0);
  await expect(page.locator("footer button:visible")).toHaveCount(1);
});

test("quick action menu exposes recovery paths without cluttering the page", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue current plan" }).click();
  await page.locator("main").click({ button: "right" });

  await expect(page.getByRole("button", { name: "Change day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip exercise (DNC)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("user can temporarily shorten today's lifting work", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue current plan" }).click();

  await expect(page.locator(".prescription")).not.toContainText("2 ×");
  await page.locator("main").click({ button: "right" });
  await page.getByRole("button", { name: "Adjust today" }).click();
  await page.getByRole("button", { name: "Short on time" }).click();

  await expect(page.locator(".prescription")).toContainText("2 ×");
  await expect(page.getByText("Today adjusted: Short on time")).toBeVisible();
  await expect(page.getByText("Add sync settings")).toHaveCount(0);
  await expect(page.locator("footer button:visible")).toHaveCount(1);

  const adjustment = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rossWorkout.v1.w0.d0"));
    return state.workoutAdjustment;
  });
  expect(adjustment.type).toBe("short_time");
});

test("user can skip an exercise from the quick menu and keep moving", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue current plan" }).click();

  const firstProgress = await page.locator("#progressText").innerText();
  await page.locator("main").click({ button: "right" });
  await page.getByRole("button", { name: "Skip exercise (DNC)" }).click();

  await expect(page.locator("#progressText")).not.toHaveText(firstProgress);
  await expect(page.locator("#progressText")).toContainText("1 done");
  await expect(page.getByText("Add sync settings")).toHaveCount(0);
  await expect(page.locator("footer button:visible")).toHaveCount(1);

  const skipped = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rossWorkout.v1.w0.d0"));
    return {
      setWeights: state.setWeights["exercise-0"],
      note: state.notes["exercise-0"],
      completed: state.completed["exercise-0"]
    };
  });
  expect(skipped.completed).toBe(true);
  expect(skipped.note).toBe("Skipped exercise.");
  expect(skipped.setWeights.every(value => value === "DNC")).toBe(true);
});

test("empty workout data should recover without a confusing dead end", async ({ page }) => {
  await page.route("**/workouts.json", route => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ weeks: [] })
    });
  });

  await page.goto("/");

  await expect(page.locator("main")).toContainText(/plan|workout|recover|settings|home/i);
  await expect(page.locator("body")).not.toHaveText(/^$/);
});
