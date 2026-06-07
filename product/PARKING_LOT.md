# Product Parking Lot

Ideas here are worth revisiting, but they should not interrupt the current priority unless they directly support the product goal.

## Current Priority

Fix the failing QA guardrails from `npm run qa`:

1. Empty or missing workout data should show a calm recovery path.
2. Exercise alternatives should offer a local next-best option without requiring Apps Script.

## Parked Ideas

### Optional Private Account Sync

Consider adding optional accounts so users can privately back up generated plans, workout history, preferences, limitations, and progress without Google Sheets.

Product boundary:

- Accounts should be optional.
- Core workout use should remain local-first and no-account.
- Account sync should be framed as backup/sync, not as a requirement.
- AI generation should move server-side if a real backend is added.

Possible later architecture:

- Static app remains simple.
- Private backend stores per-user data.
- Auth protects user data.
- Local mode remains the fallback.

Potential providers to evaluate later:

- Supabase
- Firebase
- Cloudflare Pages/Workers/D1
- Vercel or Netlify with serverless storage
