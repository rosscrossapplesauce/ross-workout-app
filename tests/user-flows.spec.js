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

async function openTodayOverview(page) {
  await page.evaluate(() => openTodayWorkoutOverview());
}

async function openFirstExercise(page) {
  await openTodayOverview(page);
  await page.locator(".orbitItem.recommended").click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("app loads to the current plan without requiring sync or AI", async ({ page }) => {
  await expect(page.locator(".weekRoute")).toBeVisible();
  await expect(page.locator("#dayTitle")).toHaveText("Workout");
  await expect(page.locator("#weekLabel")).toHaveText("");
  await expect(page.locator(".weekRoute")).toContainText("This week");
  await expect(page.locator(".weekRoute")).toContainText("training days complete");
  await expect(page.locator(".weekRoute")).not.toContainText("Week 1");
  await expect(page.locator(".weekRoute")).not.toContainText("Your route");
  await expect(page.locator(".weekDay")).toHaveCount(7);
  await expect(page.locator(".todaySnapshot")).toHaveCount(0);
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

test("home week overview can swap day focuses without changing the plan file", async ({ page }) => {
  const firstDay = page.locator(".weekDay").first();
  const fifthDay = page.locator(".weekDay").nth(4);
  const firstFocus = await firstDay.locator("strong").innerText();
  const fifthFocus = await fifthDay.locator("strong").innerText();

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.locator(".weekDay").first().dispatchEvent("dragstart", { dataTransfer });
  await page.locator(".weekDay").nth(4).dispatchEvent("dragover", { dataTransfer });
  await page.locator(".weekDay").nth(4).dispatchEvent("drop", { dataTransfer });

  await expect(page.locator(".weekDay").first().locator("strong")).toHaveText(fifthFocus);
  await expect(page.locator(".weekDay").nth(4).locator("strong")).toHaveText(firstFocus);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.dayOrder")));
  expect(stored["original.w0"][0]).toBe(4);
  expect(stored["original.w0"][4]).toBe(0);
});

test("home week overview can swap focuses by holding and dragging", async ({ page }) => {
  const thirdDay = page.locator(".weekDay").nth(2);
  const seventhDay = page.locator(".weekDay").nth(6);
  const thirdFocus = await thirdDay.locator("strong").innerText();
  const seventhFocus = await seventhDay.locator("strong").innerText();

  const fromBox = await thirdDay.boundingBox();
  const toBox = await seventhDay.boundingBox();
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(240);
  await expect(page.locator(".dragGhost")).toBeVisible();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 8 });
  const ghostMoved = await page.locator(".dragGhost").evaluate(node => getComputedStyle(node).transform !== "none");
  expect(ghostMoved).toBe(true);
  await page.mouse.up();
  await expect(page.locator(".dragGhost")).toHaveCount(0);

  await expect(page.locator(".weekDay").nth(2).locator("strong")).toHaveText(seventhFocus);
  await expect(page.locator(".weekDay").nth(6).locator("strong")).toHaveText(thirdFocus);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.dayOrder")));
  expect(stored["original.w0"][2]).toBe(6);
  expect(stored["original.w0"][6]).toBe(2);
});

test("home week overview can swap focuses with long press then tap", async ({ page }) => {
  const secondDay = page.locator(".weekDay").nth(1);
  const sixthDay = page.locator(".weekDay").nth(5);
  const secondFocus = await secondDay.locator("strong").innerText();
  const sixthFocus = await sixthDay.locator("strong").innerText();

  const box = await secondDay.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(520);
  await page.mouse.up();

  await expect(secondDay).toHaveClass(/selectedForSwap/);
  await sixthDay.click();

  await expect(page.locator(".weekDay").nth(1).locator("strong")).toHaveText(sixthFocus);
  await expect(page.locator(".weekDay").nth(5).locator("strong")).toHaveText(secondFocus);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("rossWorkout.v1.dayOrder")));
  expect(stored["original.w0"][1]).toBe(5);
  expect(stored["original.w0"][5]).toBe(1);
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
              exercises: [],
              recovery: "Keep the rest of the day easy."
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
  await expect(page.locator("#screen")).not.toContainText("Rest Day");
});

test("returning user lands in today's visual workout overview", async ({ page }) => {
  await openTodayOverview(page);

  await expect(page.getByRole("button", { name: "Workout", exact: true })).toBeVisible();
  await expect(page.locator(".compassOrbit")).toBeVisible();
  await expect(page.locator(".orbitItem.recommended")).toHaveCount(1);
  await expect(page.locator(".selector")).toBeHidden();

  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date());
  await expect(page.locator("#dayTitle")).toContainText(today);
});

test("user can complete an item and advance through the workout", async ({ page }) => {
  await openFirstExercise(page);

  const firstProgress = await page.locator("#progressText").innerText();
  await page.getByRole("button", { name: "Done ✓" }).click();

  await expect(page.locator("#progressText")).not.toHaveText(firstProgress);
  await expect(page.locator("footer button:visible")).toHaveCount(2);
});

test("workout menu reaches list, calendar, settings, and home", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await openFirstExercise(page);
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
  await page.locator("#overviewBtn").click();
  await page.getByRole("button", { name: "Color settings" }).click();
  await expect(page.locator(".themeOption")).toHaveCount(4);
  await expect(page.getByText("Sea glass")).toBeVisible();
  await expect(page.getByText("Soft slate")).toBeVisible();
  await expect(page.getByText("Midnight teal")).toBeVisible();
  await expect(page.getByText("Black cherry")).toBeVisible();

  const contrast = await page.evaluate(() => {
    const parseRgb = value => {
      const clean = String(value || "").trim();
      if(clean.startsWith("#")){
        const hex = clean.slice(1);
        const full = hex.length === 3 ? hex.split("").map(char => char + char).join("") : hex;
        return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
      }
      return clean.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    };
    const luminance = ([r, g, b]) => {
      const convert = channel => {
        const next = channel / 255;
        return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
    };
    const ratio = (a, b) => {
      const l1 = luminance(parseRgb(a));
      const l2 = luminance(parseRgb(b));
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    return ["teal", "graphite", "dark", "ember"].map(theme => {
      document.body.dataset.theme = theme;
      const styles = getComputedStyle(document.body);
      return {
        theme,
        panel: ratio(styles.getPropertyValue("--theme-ink"), styles.getPropertyValue("--theme-panel")),
        action: ratio("#ffffff", styles.getPropertyValue("--theme-action"))
      };
    });
  });
  expect(contrast.every(item => item.panel >= 4.5 && item.action >= 3)).toBe(true);

  await page.getByText("Midnight teal").click();

  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  const theme = await page.evaluate(() => localStorage.getItem("rossWorkout.v1.theme"));
  expect(theme).toBe("dark");

  await page.getByRole("button", { name: "Back to settings" }).click();
  await expect(page.getByText("Midnight teal")).toBeVisible();
});

test("today's list highlights the currently selected exercise", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await openFirstExercise(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Choose exercise" }).click();

  await expect(page.locator(".orbitItem.current")).toHaveCount(1);
  await expect(page.locator(".orbitItem.current")).toHaveAttribute("aria-label", /Chest Press Machine/);

  const secondNode = await page.locator(".compassOrbit").evaluate(orbit => {
    const item = orbit.querySelectorAll(".orbitItem")[1];
    const orbitRect = orbit.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      x: itemRect.left - orbitRect.left + itemRect.width / 2,
      y: itemRect.top - orbitRect.top + Math.min(itemRect.width, itemRect.height) / 2
    };
  });
  await page.locator(".compassOrbit").click({ position: secondNode });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Choose exercise" }).click();

  await expect(page.locator(".orbitItem.current")).toHaveCount(1);
  await expect(page.locator(".orbitItem.current")).toHaveAttribute("aria-label", /Seated Row Machine/);
});

test("calendar highlights today and offers a path back to workout", async ({ page }) => {
  await openFirstExercise(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Change day" }).click();

  await expect(page.locator(".calendarToday")).toHaveCount(1);
  await expect(page.locator(".calendarToday")).toContainText("Today");
  await expect(page.locator(".overviewActions button")).toContainText("workout");
  await expect(page.getByText("Pending Sync")).toHaveCount(0);
});

test("exercise alternatives are reachable from workout mode", async ({ page }) => {
  await makeFirstPlanDayToday(page);
  await openFirstExercise(page);

  await expect(page.locator(".card").getByRole("button", { name: "Alternatives" })).toHaveCount(0);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  const alternatives = page.getByRole("button", { name: "Swap / alternatives" });
  await expect(alternatives).toBeVisible();
  await alternatives.click();

  await expect(page.locator("#alternativesPanel")).toBeVisible();
  await expect(page.locator("#alternativesPanel")).not.toContainText(/Apps Script|backend/i);
});
