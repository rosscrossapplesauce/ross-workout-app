# Ross Workout Coach

An iPhone-friendly workout PWA for following Ross's workout plan one exercise at a time.

Live site: https://rosscrossapplesauce.github.io/ross-workout-app/

## What it does

- Shows one exercise or cardio item per screen.
- Keeps the suggested weight giant and easy to read from a bench or machine.
- Lets you save completed weight, notes, and completed status locally on your phone.
- Supports swipe navigation plus large bottom buttons for gym use.
- Auto-advances after marking an item done.
- Shows last week's completed weight when the same exercise appears.

## Files

- `index.html` - App shell and PWA metadata.
- `style.css` - Mobile-first layout and iPhone safe-area styling.
- `app.js` - Workout navigation, saved progress, and local interactions.
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

## Deploy on GitHub Pages

This repo is set up for GitHub Pages from the `main` branch. To update the live app:

```sh
git add -A
git commit -m "Improve iPhone workout PWA"
git push origin main
```

GitHub Pages will publish the static files at:

```text
https://rosscrossapplesauce.github.io/ross-workout-app/
```

## Notes

- Progress is saved in the browser with `localStorage`.
- No Google Sheets sync is included yet.
- Edit `workouts.json` only when you are ready to change the workout plan.
