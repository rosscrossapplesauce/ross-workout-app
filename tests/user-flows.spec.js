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
  await expect(page.getByText("Current Plan", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue current plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a new plan" })).toBeVisible();
  await expect(page.getByText("Add sync settings")).toHaveCount(0);
});

test("returning user can continue directly into today's workout", async ({ page }) => {
  await page.getByRole("button", { name: "Continue current plan" }).click();

  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible();
  await expect(page.locator(".selector")).toBeHidden();

  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date());
  await expect(page.locator("#dayTitle")).toContainText(today);
});

test("user can complete an item and advance through the workout", async ({ page }) => {
  await page.getByRole("button", { name: "Continue current plan" }).click();

  const firstProgress = await page.locator("#progressText").innerText();
  await page.getByRole("button", { name: "Done ✓" }).click();

  await expect(page.locator("#progressText")).not.toHaveText(firstProgress);
  await expect(page.locator("footer button:visible")).toHaveCount(1);
});

test("workout menu reaches list, calendar, settings, and home", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue current plan" }).click();
  await page.getByRole("button", { name: "Menu" }).click();

  await expect(page.getByRole("button", { name: "Today's list" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alternatives" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip exercise (DNC)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Sync settings")).toBeVisible();
});

test("today's list highlights the currently selected exercise", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue current plan" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Today's list" }).click();

  await expect(page.locator(".overviewCurrent")).toHaveCount(1);
  await expect(page.locator(".overviewCurrent")).toContainText("Chest Press Machine");

  await page.getByRole("button", { name: /2 Seated Row Machine/ }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Today's list" }).click();

  await expect(page.locator(".overviewCurrent")).toHaveCount(1);
  await expect(page.locator(".overviewCurrent")).toContainText("Seated Row Machine");
});

test("calendar highlights today and offers a path back to workout", async ({ page }) => {
  await page.getByRole("button", { name: "Continue current plan" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Change day" }).click();

  await expect(page.locator(".calendarToday")).toHaveCount(1);
  await expect(page.locator(".calendarToday")).toContainText("Today");
  await expect(page.locator(".overviewActions button")).toContainText("workout");
  await expect(page.getByText("Pending Sync")).toHaveCount(0);
});

test("exercise alternatives are reachable from workout mode", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue current plan" }).click();

  await expect(page.locator(".card").getByRole("button", { name: "Alternatives" })).toHaveCount(0);
  await page.getByRole("button", { name: "Menu" }).click();
  const alternatives = page.getByRole("button", { name: "Alternatives" });
  await expect(alternatives).toBeVisible();
  await alternatives.click();

  await expect(page.locator("#alternativesPanel")).toBeVisible();
  await expect(page.locator("#alternativesPanel")).not.toContainText("Apps Script");
});
