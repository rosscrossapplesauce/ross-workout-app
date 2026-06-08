const { test, expect } = require("@playwright/test");

async function openNewPlan(page) {
  await page.getByRole("button", { name: "Create a new plan" }).click();
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
  await expect(page.getByRole("button", { name: /Build me a plan/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /I know what I want/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Modify current plan/i })).toBeVisible();
  await expect(page.locator("footer button:visible")).toHaveCount(0);
});

test("guided onboarding keeps advanced choices collapsed", async ({ page }) => {
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build me a plan/i }).click();

  await expect(page.locator("#progressText")).toContainText("Only answer what matters");
  await expect(page.locator(".setupPanel > .setupHint")).toContainText("The app will fill in the rest");
  await expect(page.getByRole("button", { name: "Create preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.locator("details.advancedSetup")).toHaveCount(2);
  await expect(page.locator("details.advancedSetup[open]")).toHaveCount(0);
});

test("advanced onboarding opens extra controls only after explicit choice", async ({ page }) => {
  await openNewPlan(page);
  await page.getByRole("button", { name: /I know what I want/i }).click();

  await expect(page.locator("#progressText")).toContainText("Add detail where it helps");
  await expect(page.locator(".setupPanel > .setupHint")).toContainText("Use this only where you have a real preference");
  await expect(page.locator("details.advancedSetup[open]")).toHaveCount(2);
  await expect(page.getByText("Experience")).toBeVisible();
  await expect(page.getByLabel("Cross-training sport")).toBeVisible();
  await expect(page.getByText("Optional. Skip these if you do not know them yet.")).toBeVisible();
});

test("advanced onboarding makes cross-training sport selectable", async ({ page }) => {
  await openNewPlan(page);
  await page.getByRole("button", { name: /I know what I want/i }).click();

  await page.getByLabel("Cross-training sport").selectOption("Tennis");
  await page.locator("#crossTrainingSportDetail").fill("Weekend doubles");
  await page.getByRole("button", { name: "Create preview" }).click();

  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.planSettings")));
  expect(settings.crossTrainingSport).toBe("Tennis: Weekend doubles");
  expect(settings.planBias.sport).toBe("Tennis: Weekend doubles");
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

test("guided preview does not surprise user with backend dependency", async ({ page }) => {
  await openNewPlan(page);
  await page.getByRole("button", { name: /Build me a plan/i }).click();

  await expect(page.getByText(/sync settings|Apps Script/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Create preview" }).click();

  await expect(page.locator("#dayTitle")).not.toContainText("App");
  await expect(page.locator("#dayTitle")).not.toContainText("Settings");
  await expect(page.locator("#progressText")).toContainText("Only answer what matters");
  await expect(page.getByText("Setup saved. Connect generation in Settings")).toBeVisible();
  await expect(page.getByText("Add sync settings")).toHaveCount(0);
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
  await page.getByRole("button", { name: /Build me a plan/i }).click();
  await page.getByRole("button", { name: "Create preview" }).click();

  await expect(page.getByText("That preview did not meet your plan rules")).toBeVisible();
  await expect(page.getByText("planning checks")).toHaveCount(0);
});
