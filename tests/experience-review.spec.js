const { test, expect } = require("@playwright/test");

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
  await page.getByRole("button", { name: "Continue current plan" }).click();
  await page.locator("main").click({ button: "right" });

  await expect(page.getByRole("button", { name: "Calendar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
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
