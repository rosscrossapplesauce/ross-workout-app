# Product Parking Lot

Ideas here are worth revisiting, but they should not interrupt the current priority unless they directly support the product goal.

## Current Priority

Use `product/FUTURE_CHANGE_CHECKLIST.md` before the next app change, then run `npm run qa`.

## Parked Ideas

### Optional Private Account Sync And High-Quality Plan Generation

Consider adding optional accounts so users can privately back up generated plans, workout history, preferences, limitations, and progress without Google Sheets.

Also consider whether high-quality personalized plan generation needs a real backend or richer local planning rules. A simple local-only app can create useful template-based plans, but truly personalized plan generation may need more context, safer server-side AI calls, and persistent per-user history.

Product boundary:

- Accounts should be optional.
- Core workout use should remain local-first and no-account.
- Account sync should be framed as backup/sync, not as a requirement.
- AI generation should move server-side if a real backend is added.
- Local plan generation should remain a reliable fallback, even if a backend creates better custom plans.
- Plan generation requests should be sorted into one of these paths: local fallback, richer local templates/rules, optional AI/private backend, or optional account-backed storage.

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
