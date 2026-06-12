# Ross Workout Coach

An iPhone-friendly workout PWA for following Ross's workout plan one exercise at a time.

Live site: https://rosscrossapplesauce.github.io/ross-workout-app/

## What it does

- Shows one exercise or cardio item per screen.
- Opens to a home screen with the current plan, goal editing, new plan setup, and progress.
- Keeps the suggested weight giant and easy to read from a bench or machine.
- Lets you save completed weight for every set, mark missed sets as `DNC`, add notes, and save completed status locally on your phone.
- Supports swipe navigation plus large bottom buttons for gym use.
- Auto-advances after marking an item done.
- Shows last completed weight, previous completion date, and weight change when an exercise appears again.
- Syncs workout history to Google Sheets through the configured app backend.
- Suggests alternative exercises through a private Apps Script OpenAI proxy.
- Generates a private custom training plan from saved goals through Apps Script/OpenAI.
- Lets you switch between the original `workouts.json` plan and the generated plan.
- Saves preferred alternative exercises for future generated plans.
- Shows strength progress charts with actual progress and two projection lines.

## Files

- `index.html` - App shell and PWA metadata.
- `style.css` - Mobile-first layout and iPhone safe-area styling.
- `app.js` - Workout navigation, saved progress, and local interactions.
- `apps-script.js` - Google Apps Script code for Sheets sync.
- `appsscript.json` - Apps Script manifest for CLI deployments.
- `.clasp.example.json` - Local Apps Script project config template.
- `workouts.json` - The workout plan data.
- `manifest.json` - PWA install metadata.

## Run Locally

Because the app loads `workouts.json`, run it from a small local web server instead of opening `index.html` directly.

```sh
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## QA / Product Review

The product guardrails live in:

- `product/PRODUCT_GOAL.md`
- `product/UX_RULES.md`
- `product/QA_SCENARIOS.md`
- `product/FUTURE_CHANGE_CHECKLIST.md`

Run the repeatable QA review with:

```sh
npm run qa
```

The command starts a local server, runs the browser flow tests, and writes a readable report to:

```text
qa-results/last-run.md
```

If QA fails, read the failed flow and product reason before changing code.

## Install on iPhone

1. Open the live site in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open it from the new home-screen icon.

## Google Sheets Sync Setup

The app keeps working offline with `localStorage`. Google Sheets sync is optional, and queued workout logs upload automatically when your phone comes back online.

### 1. Create the Sheet

1. Create a new Google Sheet.
2. Name it something like `Ross Workout Log`.
3. Open **Extensions > Apps Script**.

### 2. Paste the Script

1. Delete any starter code in Apps Script.
2. Copy everything from `apps-script.js`.
3. Paste it into the Apps Script editor.
4. Save the project.

The script automatically creates these sheets the first time it runs:

- `Workout Log`
- `PRs`
- `Settings`

Workout rows include both a `completedWeight` summary and a `setWeights` value for per-set logging. Missed sets are saved as `DNC`.

### 3. Deploy as a Web App

1. In Apps Script, click **Deploy > New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Click **Deploy**.
6. Approve the requested permissions.
7. Copy the Web App URL.

### 4. Configure the PWA Backend

The public app uses the Apps Script Web App URL configured in `app.js` as `APP_BACKEND_URL`.
Users should not need to paste the Web App URL inside the app.

The status pill shows:

- `Synced` when all local records have been sent.
- `Pending Sync` when records are queued.
- `Offline` when the phone is offline.

### 5. Set Up Apps Script CLI Updates

After the first manual deployment, you can update Apps Script from this repo with `clasp`.

Install dependencies:

```sh
npm install
```

Sign in to Google:

```sh
npm run apps-script:login
```

Create your private local clasp config:

```sh
cp .clasp.example.json .clasp.json
```

Then edit `.clasp.json` and replace `PASTE_YOUR_APPS_SCRIPT_PROJECT_ID_HERE` with the Apps Script project ID from **Project Settings > Script ID**.

Check the connection:

```sh
npm run apps-script:status
```

Open the connected Apps Script project:

```sh
npm run apps-script:open
```

`.clasp.json` and `.clasprc.json` are ignored by Git because they are local/private.

### 6. Update the Apps Script Later

If `apps-script.js` changes:

1. Push the latest local script:

```sh
npm run apps-script:push
```

2. Deploy a new Apps Script version:

```sh
npm run apps-script:deploy -- -d "Update workout app script"
```

If you want to update an existing deployment instead of creating a new one, pass its deployment ID:

```sh
npm run apps-script:deploy -- -i YOUR_DEPLOYMENT_ID -d "Update workout app script"
```

You can find deployment IDs in Apps Script under **Deploy > Manage deployments**.

## Private OpenAI Setup

Alternative exercise suggestions and generated training plans run through Google Apps Script so your OpenAI API key is never stored in the public PWA or GitHub Pages.

### 1. Create an OpenAI API Key

1. Go to the OpenAI API keys page.
2. Create a new API key.
3. Copy it once and keep it private.

### 2. Store the Key in Apps Script

1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Click **Project Settings**.
4. Under **Script properties**, add:

```text
OPENAI_API_KEY = your_api_key_here
```

Optional model override:

```text
OPENAI_MODEL = gpt-5.4-mini
```

If `OPENAI_MODEL` is not set, the script uses `gpt-5.4-mini`.

### 3. Redeploy the Web App

Before redeploying, authorize the new OpenAI permission:

1. In Apps Script, use the function dropdown near **Run**.
2. Select `authorizeOpenAIAccess`.
3. Click **Run**.
4. Approve the requested permissions.

Then redeploy:

1. Click **Deploy > Manage deployments**.
2. Edit the existing Web App deployment.
3. Choose **New version**.
4. Deploy.

### 4. Use Alternatives

1. Open an exercise in the workout app.
2. Tap **Alternatives**.
3. The app asks Apps Script for three substitutions and caches them in the `Settings` sheet.

### 5. Generate a Private Plan

1. Open the workout app.
2. Tap **Create a new plan** or **Adjust current plan**.
3. Choose the scaffold options for goal, readiness, schedule, length, equipment, and sport context.
4. The app asks Apps Script to create a preview and saves it locally on your phone.
5. Review the preview, then choose whether to use it.

Generated plans do not edit `workouts.json`. The original plan remains the fallback plan in the repo.

Do not paste your OpenAI key into the workout app, GitHub, or `workouts.json`.

## Deploy on GitHub Pages

This repo is set up for GitHub Pages from the `main` branch. To update the live app:

```sh
git add -A
git commit -m "Update workout app"
git push origin main
```

GitHub Pages will publish the static files at:

```text
https://rosscrossapplesauce.github.io/ross-workout-app/
```

## Notes

- Progress is saved in the browser with `localStorage`.
- Plan setup, goal preferences, generated plans, and preferred alternatives are saved in `localStorage`.
- The original plan data still comes from `workouts.json`; generated plans are a local override created through Apps Script/OpenAI.
- If Google Sheets sync fails, records stay queued locally until the next successful sync attempt.
- Edit `workouts.json` only when you are ready to change the workout plan.
