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
  expect(visibleFooterButtons.map(text => text.trim())).toEqual(["Done ✓", "Home"]);
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

test("long workout cards scroll to reveal notes and actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.evaluate(() => {
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    localStorage.setItem("rossWorkout.v1.planSource", "generated");
    localStorage.setItem("rossWorkout.v1.planSettings", JSON.stringify({ startDate: local }));
    localStorage.setItem("rossWorkout.v1.generatedPlan", JSON.stringify({
      name: "Long Card QA Plan",
      weeks: [{
        week: 1,
        days: [{
          day: "Monday",
          title: "Long exercise card",
          row: null,
          run: null,
          exercises: [{
            name: "Single-Arm Cable Romanian Deadlift To Row Complex",
            sets: 6,
            reps: "8 each side with 3 second eccentric",
            suggestedWeight: 45,
            unit: "lb"
          }]
        }]
      }]
    }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Continue today" }).click();

  const scrollState = await page.locator("main").evaluate(main => ({
    scrollable: main.scrollHeight > main.clientHeight + 2,
    cardOverflow: getComputedStyle(document.querySelector(".workoutCard")).overflowY
  }));
  expect(scrollState).toEqual({ scrollable: true, cardOverflow: "visible" });
  const touchMoveAllowed = await page.locator(".workoutCard").evaluate(card => {
    const event = new Event("touchmove", { bubbles: true, cancelable: true });
    card.dispatchEvent(event);
    return !event.defaultPrevented;
  });
  expect(touchMoveAllowed).toBe(true);

  await page.locator("main").evaluate(main => {
    main.scrollTop = main.scrollHeight;
  });

  await expect(page.locator(".notesBtn")).toBeVisible();
  await expect(page.locator(".suggestedBtn")).toBeVisible();
  const actionsClearFooter = await page.evaluate(() => {
    const footer = document.querySelector("footer").getBoundingClientRect();
    return Array.from(document.querySelectorAll(".notesBtn, .suggestedBtn")).every(node => {
      const rect = node.getBoundingClientRect();
      return rect.bottom <= footer.top - 2 && rect.top >= 0;
    });
  });
  expect(actionsClearFooter).toBe(true);
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
  await expect(page.locator(".exerciseMapGrid")).toHaveCSS("display", "flex");
  await expect(page.locator(".exerciseMapGrid")).toHaveCSS("flex-direction", "row");
});

test("core workout use does not require sync setup", async ({ page }) => {
  await page.getByRole("button", { name: "Continue today" }).click();
  await page.getByRole("button", { name: "Done ✓" }).click();

  await expect(page.getByText("Add sync settings")).toHaveCount(0);
  await expect(page.locator("footer button:visible")).toHaveCount(2);
});

test("hard rowing starts before lifting when technique quality matters", async ({ page }) => {
  await page.evaluate(() => {
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    localStorage.setItem("rossWorkout.v1.planSource", "generated");
    localStorage.setItem("rossWorkout.v1.planSettings", JSON.stringify({ startDate: local }));
    localStorage.setItem("rossWorkout.v1.generatedPlan", JSON.stringify({
      name: "Technique Priority Plan",
      weeks: [{
        week: 1,
        days: [{
          day: "Monday",
          title: "6 x 500 meters row + strength",
          row: { type: "6 x 500 meters row", duration: "20 minutes", intensity: "Hard intervals", pace: "Hard" },
          run: null,
          exercises: [
            { name: "Leg Press", sets: 3, reps: "8", suggestedWeight: 180, unit: "lb" },
            { name: "Romanian Deadlift", sets: 3, reps: "8", suggestedWeight: 95, unit: "lb" }
          ]
        }]
      }]
    }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Continue today" }).click();

  await expect(page.locator("#screen")).toContainText("6 x 500 meters row");
  await expect(page.locator(".compassSummary")).toContainText("Technique first");
  await page.locator(".trailDot").nth(1).click();
  await expect(page.locator("#screen")).toContainText("Leg Press");
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
  await expect(page.locator("footer button:visible")).toHaveCount(2);

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

test("planned exercises use the last completed workout as the next suggestion", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await page.evaluate(() => {
    localStorage.setItem("rossWorkout.v1.history", JSON.stringify([
      {
        exercise: "Chest Press Machine",
        context: "original.w0.d2.exercise-0",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        completed: true,
        completedWeight: "70 / 75 / 80",
        setWeights: "70 / 75 / 80",
        unit: "lb"
      }
    ]));
  });
  await page.getByRole("button", { name: "Continue today" }).click();

  await expect(page.locator(".suggestedLine")).toContainText("From last time");
  await expect(page.locator(".suggestedLine")).toContainText("80 lb");
  await expect(page.locator(".lastWeek")).toContainText("Suggested from last completed");
  await expect(page.locator(".setWeightInput").first()).toHaveAttribute("placeholder", "80");

  await page.getByRole("button", { name: "Use suggested for all sets" }).click();
  const values = await page.locator(".setWeightInput").evaluateAll(inputs => inputs.map(input => input.value));
  expect(values).toEqual(["80", "80", "80"]);
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
  await expect(page.locator("footer button:visible")).toHaveCount(2);

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
