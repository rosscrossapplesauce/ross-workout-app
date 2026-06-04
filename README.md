# Ross Workout Coach

An iPhone-friendly workout PWA for following Ross's workout plan one exercise at a time.

Live site: https://rosscrossapplesauce.github.io/ross-workout-app/

## What it does

- Shows one exercise or cardio item per screen.
- Keeps the suggested weight giant and easy to read from a bench or machine.
- Lets you save completed weight, notes, and completed status locally on your phone.
- Supports swipe navigation plus large bottom buttons for gym use.
- Auto-advances after marking an item done.
- Shows last completed weight, previous completion date, and weight change when an exercise appears again.
- Syncs workout history to Google Sheets when configured.

## Files

- `index.html` - App shell and PWA metadata.
- `style.css` - Mobile-first layout and iPhone safe-area styling.
- `app.js` - Workout navigation, saved progress, and local interactions.
- `apps-script.js` - Google Apps Script code for Sheets sync.
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

### 3. Deploy as a Web App

1. In Apps Script, click **Deploy > New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Click **Deploy**.
6. Approve the requested permissions.
7. Copy the Web App URL.

### 4. Connect the PWA

1. Open the workout app on your iPhone.
2. Tap the sync status pill in the top right.
3. Paste the Apps Script Web App URL.
4. Tap OK.

The status pill shows:

- `Synced` when all local records have been sent.
- `Pending Sync` when records are queued or the Web App URL has not been added.
- `Offline` when the phone is offline.

### 5. Update the Apps Script Later

If `apps-script.js` changes:

1. Paste the new script into Apps Script.
2. Click **Deploy > Manage deployments**.
3. Edit the existing Web App deployment.
4. Choose a new version.
5. Deploy.

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
- If Google Sheets sync fails, records stay queued locally until the next successful sync attempt.
- Edit `workouts.json` only when you are ready to change the workout plan.
