const { test, expect } = require("@playwright/test");

async function openSettings(page) {
  await page.getByRole("button", { name: "Continue current plan" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("limitations live in settings and stay quiet by default", async ({ page }) => {
  await openSettings(page);

  await expect(page.getByRole("button", { name: "Limitations" })).toBeVisible();
  await expect(page.getByText("None active")).toBeVisible();

  await page.getByRole("button", { name: "Limitations" }).click();

  await expect(page.locator("#progressText")).toContainText("Off");
  await expect(page.locator("#limitationsEnabled")).not.toBeChecked();
  await expect(page.getByText("Leave this off unless")).toBeVisible();
  await expect(page.getByText("How long?")).toBeHidden();
  await expect(page.getByText("What should plans account for?")).toBeHidden();
});

test("enabled limitations save temporary context for future plan previews", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Limitations" }).click();

  await page.locator("#limitationsEnabled").check();
  await expect(page.locator("#progressText")).toContainText("Active for plan previews");
  await expect(page.getByText("How long?")).toBeVisible();
  await page.getByLabel("Limited equipment").check();
  await page.locator("#avoidMovements").fill("No barbell squats this month.");
  await page.getByRole("button", { name: "Save limitations" }).click();

  await expect(page.getByText("Limitations saved for future plan previews.")).toBeVisible();
  await expect(page.getByText("Temporary: Limited equipment; No barbell squats this month.")).toBeVisible();

  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.planSettings")));
  expect(settings.limitationsEnabled).toBe(true);
  expect(settings.planBias.avoidMovements).toContain("Limited equipment");
  expect(settings.planBias.avoidMovements).toContain("No barbell squats this month.");
});
