# UX Rules

These rules are product guardrails. Future edits should be checked against them before code changes begin.

## Core Rules

- Every screen should have one obvious primary action.
- Every screen should answer where the user is and what they can do next.
- No dead ends. If something cannot happen, offer the next-best action.
- Core workout flow must work locally with `workouts.json` and `localStorage`.
- AI and sync can enhance the app, but they must not be required for starting, continuing, completing, skipping, or adjusting today's workout.
- Do not add complexity to solve a narrow issue. Check all affected flows before changing one screen.
- Do not make the app feel like a spreadsheet, admin panel, or medical dashboard.

## Workout Flow Rules

- Workout mode should stay minimal while the user is exercising.
- Visible controls should be limited to actions the user is likely to need immediately.
- Less common actions can live behind a menu or long-press, but they must still be discoverable enough to recover.
- The user should be able to skip, swap, or adjust where appropriate.
- Exercise swaps should preserve workout intent: target muscle, movement pattern, rough volume, and safety.
- If remote alternatives are unavailable, the app should still offer a local fallback or a clear next-best action.
- Reset/destructive actions should not be visually dominant.

## State And Data Rules

- Missing, empty, or corrupted data should fail softly with a useful path forward.
- Saved progress should never make the app impossible to use.
- Date navigation should match the user's actual day when continuing a plan.
- Generated plans must remain optional; the original plan should remain a fallback.
- Sync failures should queue or explain, not block the workout.

## Change Rules

- Restate the user request before implementing.
- Identify the product goal behind the request.
- Check whether the request supports `PRODUCT_GOAL.md` and these rules.
- If the request conflicts, explain why and propose a better option before coding.
- Identify all affected screens and flows.
- Implement the smallest consistent change.
- Run `npm run qa`.
- Report what passed, what failed, and what risks remain.
