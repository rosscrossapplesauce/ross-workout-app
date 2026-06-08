# App Quality System

Use this as the app-development quality bar before a feature is considered ready. The goal is not to add process for its own sake. The goal is to catch user confusion, hidden dependencies, and fragile flows before they become expensive.

## Quality Definition

A high-quality version of this app should feel:

- Fast to understand on first open.
- Calm in the gym.
- Forgiving when something goes wrong.
- Clear about what is local, what is synced, and what needs generation.
- Safe to change without breaking the core workout loop.

## Required Review Lenses

Every meaningful app change should be reviewed through these lenses.

### Product Fit

- Does the change support `product/PRODUCT_GOAL.md`?
- Does it make the core workout experience easier, clearer, or more reliable?
- Does it avoid turning the app into a settings-heavy admin tool?
- Does it protect local workout use when sync, AI, or generation is unavailable?

### User Journey

Run the change through real user stories, not just screens:

- New user deciding whether to use the starter plan or create a plan.
- Returning user walking into the gym and tapping Continue current plan.
- User mid-workout with limited attention.
- User who cannot do an exercise because of equipment, time, or soreness.
- User without sync/generation connected.
- User whose generation, sync, or data load fails.

### UX Friction

Look for avoidable work:

- More than one primary action on a screen.
- Buttons that are visible only because the app can do something, not because the user likely needs it now.
- Settings or sync language appearing before the user asked for it.
- Date/week controls showing during exercise mode.
- Plan-edit controls competing with workout completion.
- Warnings that explain a problem but do not offer a next-best action.

### Visual Hierarchy

Look for visual clutter before judging whether the flow works:

- The first screen should answer what matters now, not describe the whole app.
- One visual idea should dominate each screen; supporting details should be quieter.
- Repeated items should have enough room for real workout names without clipping.
- Progress markers should help orientation without becoming decoration.
- Text density should stay lower on workout and home screens than on settings or review screens.
- Color should support meaning, but labels, position, or shape should also communicate state.
- Avoid adding more boxes inside boxes when spacing, grouping, or typography can solve the problem.

### Error And Recovery

Every non-happy path should answer:

- What happened?
- Does the user still have a usable workout path?
- What is the smallest next action?
- Did the app preserve progress and saved setup?
- Is the failure phrased in user language instead of technical language?

### Accessibility And Mobile Use

Check phone-sized use because the app is mainly used in the gym:

- Text fits without overlap.
- Text fits without horizontal clipping in repeated cards, buttons, and week/day summaries.
- Tap targets are comfortable.
- Primary action is visible without hunting.
- Important actions have clear button names.
- Color and contrast do not carry meaning alone.
- The page works with one hand and partial attention.

### State And Data Safety

For any change that touches stored data:

- Core workouts still work from `workouts.json`.
- `localStorage` state does not trap the user.
- Generated plans stay optional.
- Sync failure does not block starting, continuing, completing, skipping, or adjusting today's workout.
- The old plan remains recoverable when a generated plan preview fails.

## QA Levels

Use the smallest level that matches the risk.

### Level 1: Small Copy Or Layout Change

Use when the change does not alter navigation, stored data, sync, generation, or workout completion.

Required:

- Check affected screen manually or with a targeted browser test.
- Run syntax checks if JavaScript changed.
- Run `npm run qa` before merge.

### Level 2: Flow Or State Change

Use when the change affects onboarding, workout navigation, calendar, settings, plan setup, limitations, or recovery paths.

Required:

- Identify affected scenarios from `product/QA_SCENARIOS.md`.
- Add or update Playwright coverage for the highest-risk flow.
- Run `npm run qa`.
- Confirm no unnecessary visible controls were added.

### Level 3: Backend, Sync, Generation, Or Plan Data Change

Use when the change touches Apps Script, generated plans, sync payloads, plan activation, or `workouts.json`.

Required:

- Confirm whether `apps-script.js` changed and whether deployment is needed.
- Confirm whether `workouts.json` changed and why.
- Test no-sync, timeout/failure, and success paths where practical.
- Keep a local fallback or clear next-best action.
- Run `npm run qa`.
- Do a short manual scenario review before merge.

## Merge Readiness

A PR is ready only when:

- The user request and product goal are clear.
- The change follows `product/UX_RULES.md`.
- Affected scenarios are named.
- `npm run qa` has passed, or any failure is explicitly intentional and the PR is marked not merge-ready.
- `workouts.json` is unchanged unless plan data was intentionally changed.
- `apps-script.js` deployment need is explicitly stated.
- Remaining risks and next step are reported.

## Standing Product Risks

Keep these in mind during future decisions:

- The app should not rely on AI for basic usefulness.
- Plan generation should be checked against a future science-backed planning guide.
- User accounts/private storage may eventually replace Google Sheets for broader use.
- Limitations should probably live in Settings with an easy temporary/permanent distinction.
- Workout mode should stay bare minimum, with recovery actions behind a menu or long-press.
