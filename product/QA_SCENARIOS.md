# QA Scenarios

These scenarios are editable product tests. Browser tests should cover the highest-risk paths, but this file is the human-readable source of truth.

## First App Open / New User

User goal: Understand what the app is and how to begin.

Expected smooth path: The app opens to Current Plan with a clear Continue current plan button and a secondary way to create a new plan.

Failure: Blank screen, data error, setup demand, sync demand, or unclear first action.

Unnecessary friction: Too many equal-weight buttons, technical setup language, or AI/sync prompts before workout use.

## Returning User

User goal: Resume training quickly.

Expected smooth path: Continue current plan takes the user to today's workout date with one obvious next action.

Failure: Opens the wrong day, stale day, or a confusing selector-heavy screen.

Unnecessary friction: Requiring calendar navigation every time.

## Continue Current Plan

User goal: Start the correct workout for today.

Expected smooth path: Tap Continue current plan, land on today's dated workout, see the first item and Done.

Failure: Wrong weekday/date, no workout item, hidden primary action, or broken progress state.

Unnecessary friction: Week/day selectors on the exercise page.

## Start Today's Workout

User goal: Know what to do next in the gym.

Expected smooth path: The first exercise/cardio item is readable, with suggested weight or prescription prominent.

Failure: User must interpret multiple controls before starting.

Unnecessary friction: Visible reset, plan-edit, or sync controls competing with Done.

## Complete / Advance Through Workout

User goal: Mark work complete and move forward.

Expected smooth path: Done saves progress and advances to the next item without losing context.

Failure: Done does nothing, loses weights/notes, or jumps to a different day.

Unnecessary friction: Confirmation dialogs for ordinary completion.

## Skip Something

User goal: Keep moving when an item is not doable.

Expected smooth path: A simple skip or DNC path is available and does not break the day.

Failure: User must fake completion or abandon the workout.

Unnecessary friction: Skip hidden behind unrelated settings.

## Swap Unavailable Equipment

User goal: Replace an unavailable exercise with an equivalent.

Expected smooth path: Tap Alternatives/Swap, see a few reasonable equivalents, choose one, continue.

Failure: Swap requires backend setup with no local fallback, offers random movements, or loses workout progress.

Unnecessary friction: Leaving workout mode to edit the whole plan.

## Adjust A Workout

User goal: Make today's workout fit time, soreness, or equipment.

Expected smooth path: Adjust from the workout/menu area and apply a temporary change.

Failure: Only permanent plan editing is available.

Unnecessary friction: Asking advanced setup questions during a workout.

## Adjust The Current Plan

User goal: Change future training direction without starting from scratch.

Expected smooth path: Settings/Menu/Home make plan adjustment discoverable and previewable.

Failure: User cannot tell whether the change is temporary or permanent.

Unnecessary friction: Too many plan-generation controls during a workout.

## View Progress

User goal: See whether training is moving forward.

Expected smooth path: Progress is reachable from Settings and summarized clearly.

Failure: Progress requires sync or shows raw spreadsheet-like data.

Unnecessary friction: Medical-dashboard tone or too many metrics.

## Missing Or Empty Workout Data

User goal: Recover if the plan data is missing or empty.

Expected smooth path: The app shows a calm error and a next step instead of crashing.

Failure: Blank page, JavaScript crash, or unusable controls.

Unnecessary friction: Technical JSON messages.

## No Sync / AI Setup

User goal: Use the workout app without backend configuration.

Expected smooth path: Core workout actions work; sync/AI features explain setup only when requested.

Failure: Continue, complete, skip, or adjust requires a Web App URL or OpenAI key.

Unnecessary friction: Sync status dominating core workout screens.

## Mobile-Sized Screen

User goal: Use the app with one hand in the gym.

Expected smooth path: Primary actions are visible and text fits at phone width.

Failure: Buttons overlap, text is clipped, or the primary action is below unreachable scroll.

Unnecessary friction: Dense cards or tiny tap targets.

## In The Gym / Minimal Friction

User goal: Make a decision fast while equipment and attention are limited.

Expected smooth path: The app shows the current item, Done, and a small menu for recovery paths.

Failure: The user has to reason about week/day, sync, plan generation, or settings before continuing.

Unnecessary friction: More than one obvious competing primary action.
