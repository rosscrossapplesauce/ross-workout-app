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

async function expectWorkoutVisualFit(page) {
  const fit = await page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.closest("details:not([open])") && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const heightOverflowSelectors = [
      ".workoutCard",
      ".compassDock",
      ".setGrid",
      ".setWeightRow",
      ".suggestedBtn",
      ".notesBtn"
    ];
    const widthOverflowSelectors = [
      ".exerciseName",
      ".prescription",
      ".bigWeight",
      ".lastWeek",
      ".setWeightRow",
      ".suggestedBtn",
      ".notesBtn",
      ".compassSummary",
      ".trailDot",
      ".orderCue"
    ];
    const heightOverflows = Array.from(document.querySelectorAll(heightOverflowSelectors.join(",")))
      .filter(visible)
      .filter(node => node.scrollHeight > node.clientHeight + 2)
      .map(node => ({
        selector: node.className || node.tagName,
        text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight
      }));
    const widthOverflows = Array.from(document.querySelectorAll(widthOverflowSelectors.join(",")))
      .filter(visible)
      .filter(node => node.scrollWidth > node.clientWidth + 2)
      .map(node => ({
        selector: node.className || node.tagName,
        text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth
      }));
    const card = document.querySelector(".card");
    const footer = document.querySelector("footer");
    const cardRect = card && card.getBoundingClientRect();
    const footerRect = footer && footer.getBoundingClientRect();
    const cardHiddenBehindFooter = !!(cardRect && footerRect && cardRect.bottom > footerRect.top + 1);
    const clippedChildren = card ? Array.from(card.querySelectorAll("*"))
      .filter(visible)
      .filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > cardRect.bottom + 2 || rect.right > cardRect.right + 2 || rect.left < cardRect.left - 2;
      })
      .map(node => ({
        selector: node.className || node.tagName,
        text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 80)
      })) : [];
    return { heightOverflows, widthOverflows, clippedChildren, cardHiddenBehindFooter };
  });
  expect(fit).toEqual({ heightOverflows: [], widthOverflows: [], clippedChildren: [], cardHiddenBehindFooter: false });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("mobile workout screen keeps the primary action visible and uncluttered", async ({ page }) => {
  await page.getByRole("button", { name: "Continue today" }).click();

  const visibleHeaderButtons = await page.locator("header button:visible").allTextContents();
  const visibleFooterButtons = await page.locator("footer button:visible").allTextContents();

  expect(visibleHeaderButtons.map(text => text.trim())).toEqual(["Menu"]);
  expect(visibleFooterButtons.map(text => text.trim())).toEqual(["Done ✓"]);
});

test("workout cards visually fit across the default training day", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();

  const itemCount = await page.evaluate(() => getItems(getDay()).length);
  for(let index = 0; index < itemCount; index += 1) {
    await page.evaluate(nextIndex => {
      itemIndex = nextIndex;
      render();
    }, index);
    await expectWorkoutVisualFit(page);
  }
});

test("workout compass shows the day map and completed color state", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();

  await expect(page.locator(".compassDock")).toBeVisible();
  const itemCount = await page.evaluate(() => getItems(getDay()).length);
  await expect(page.locator(".trailDot")).toHaveCount(itemCount);
  await expect(page.locator(".trailDot").nth(1)).toHaveAttribute("aria-label", /Seated Row Machine/);
  await page.locator(".trailDot").nth(1).click();
  await expect(page.locator(".card")).toContainText("Seated Row Machine");

  await page.getByRole("button", { name: "Done ✓" }).click();
  await expect(page.locator(".trailDot").nth(1)).toHaveClass(/done/);

  await page.locator(".trailDot").nth(1).click();
  await expect(page.locator("#screen")).toContainText("Seated Row Machine");
  await expect(page.locator(".card")).toHaveClass(/completed/);

  await page.locator(".compassSummary").click();
  await expect(page.locator(".compassMap")).toBeVisible();
  await expect(page.locator(".mapItem")).toHaveCount(itemCount);
  await expect(page.locator(".overviewCurrent")).toContainText("Seated Row Machine");
});

test("core workout use does not require sync setup", async ({ page }) => {
  await page.getByRole("button", { name: "Continue today" }).click();
  await page.getByRole("button", { name: "Done ✓" }).click();

  await expect(page.getByText("Add sync settings")).toHaveCount(0);
  await expect(page.locator("footer button:visible")).toHaveCount(1);
});

test("quick action menu exposes recovery paths without cluttering the page", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();
  await page.locator("main").click({ button: "right" });

  await expect(page.getByRole("button", { name: "Choose exercise" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More actions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("button", { name: "Skip exercise (DNC)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset day" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
});

test("user can temporarily shorten today's lifting work", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();

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

test("user can mark an exercise done without entering every set weight", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();

  await expect(page.locator(".setWeightInput")).toHaveCount(3);
  await page.getByRole("button", { name: "Done ✓" }).click();

  await expect(page.getByText("Chest Press Machine completed")).toBeVisible();
  await expect(page.locator(".trailDot.done")).toHaveCount(1);
  await expect(page.locator("#progressText")).toContainText("1 done");
  await expect(page.locator("#screen")).toContainText("Seated Row Machine");

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.w0.d0")));
  expect(state.completed["exercise-0"]).toBe(true);
  expect(state.setWeights["exercise-0"].every(value => value === "")).toBe(true);
});

test("equipment crowded opens alternatives and selected alternative resets set inputs", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.alternatives", JSON.stringify({
      "v2|Chest Press Machine|3|8": [
        {
          name: "Cable Chest Press",
          sets: 2,
          reps: "10",
          suggestedWeight: 45,
          unit: "lb",
          how: "Set handles around chest height and press forward.",
          why: "Same press intent when the machine is busy."
        }
      ]
    }));
  });
  await page.getByRole("button", { name: "Continue today" }).click();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Adjust today" }).click();
  await page.getByRole("button", { name: "Equipment crowded" }).click();

  await expect(page.locator("#alternativesPanel")).toBeVisible();
  await page.getByRole("button", { name: "Just this time" }).click();

  await expect(page.locator("#screen")).toContainText("Cable Chest Press");
  await expect(page.locator(".prescription")).toContainText("2 × 10");
  await expect(page.locator(".setWeightInput")).toHaveCount(2);
  await expect(page.locator(".setWeightInput").first()).toHaveAttribute("placeholder", "45");
});

test("user can add an unplanned exercise using last logged weight", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.history", JSON.stringify([
      {
        exercise: "Face Pull",
        context: "generated.w0.d0.extra-old",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        completed: true,
        completedWeight: "30 / 35",
        setWeights: "30 / 35",
        unit: "lb"
      }
    ]));
  });
  const answers = ["Face Pull", "2", "12"];
  page.on("dialog", dialog => dialog.accept(answers.shift() || ""));

  await page.getByRole("button", { name: "Continue today" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();

  await expect(page.locator("#screen")).toContainText("Face Pull");
  await expect(page.locator("#screen")).toContainText("Last logged");
  await expect(page.locator(".suggestedLine")).toContainText("35 lb");
  await expect(page.locator(".setWeightInput")).toHaveCount(2);

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.w0.d0")));
  expect(state.extraExercises[0].name).toBe("Face Pull");
  expect(state.extraExercises[0].suggestedWeight).toBe(35);
});

test("user can skip an exercise from the quick menu and keep moving", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.getByRole("button", { name: "Continue today" }).click();

  const firstProgress = await page.locator("#progressText").innerText();
  await page.locator("main").click({ button: "right" });
  await page.getByRole("button", { name: "More actions" }).click();
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
