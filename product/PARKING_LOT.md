# Product Parking Lot

Ideas here are worth revisiting, but they should not interrupt the current priority unless they directly support the product goal.

## Current Priority

Use `product/FUTURE_CHANGE_CHECKLIST.md` before the next app change, then run `npm run qa`.

## Parked Ideas

### Optional Private Account Sync And High-Quality Plan Generation

Consider adding optional accounts so users can privately back up generated plans, workout history, preferences, limitations, and progress without Google Sheets.

Also consider whether high-quality personalized plan generation needs a real backend or richer local planning rules. A simple local-only app can create useful template-based plans, but truly personalized plan generation may need more context, safer server-side AI calls, and persistent per-user history.

### Science-Backed Plan Principles

Consider creating a durable planning guide that every generated plan and plan modification must satisfy.

The guide should work like a product "brain" for training decisions:

- Principles should be written as clear rules that can be checked before a plan is shown to the user.
- Each principle should cite multiple primary sources, ideally PubMed-indexed studies, meta-analyses, or position stands.
- Each principle should include the population it applies to, such as beginner, returning, intermediate, experienced, older adult, or limitation/injury context.
- Each principle should state what user inputs define that population, such as current stats, cardio baseline, training history, limitations, schedule, and recovery.
- Each principle should include what the generated plan must do, what it must avoid, and what uncertainty remains.
- The system should avoid claiming certainty when evidence is mixed or context-dependent.
- The AI should generate within these constraints, not invent rules on the fly.

Possible principle areas:

- Cardio dose and intensity distribution by starting fitness level.
- Strength volume, frequency, progression, and deload logic.
- Concurrent strength/cardio interference management.
- Beginner and returning-trainee progression limits.
- Recovery, rest days, soreness, and missed-workout adjustment.
- Exercise substitution rules that preserve movement pattern, target muscle, and training intent.
- Contraindication-style guardrails for limitations without turning the app into medical advice.

Important boundary:

- "Never contradict science" is too absolute because evidence changes and studies can conflict.
- Better target: evidence-graded rules with citations, version history, and conservative defaults.
- Any AI/backend planning feature should be checked against this guide before a plan is saved or shown.

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
