# Future Change Checklist

Use this before future edits.

1. Restate the user request in plain language.
2. Identify the product goal behind the request.
3. Check the request against `product/PRODUCT_GOAL.md`.
4. Check the request against `product/UX_RULES.md`.
5. Check the request against `product/APP_QUALITY_SYSTEM.md`.
6. If the request affects generated plans, plan modification, exercise alternatives, limitations, progression, or sport context, check it against `product/PLAN_GENERATION_PRINCIPLES.md`.
7. If the request conflicts with the goal or rules, push back before coding and propose a simpler option.
8. Identify every affected screen and flow.
9. Identify the QA level and scenarios from `product/QA_SCENARIOS.md`.
10. For visual changes, identify the dominant visual idea, what text must fit, and what should be visually quiet.
11. Implement the smallest change that keeps the full flow consistent.
12. Do not change `workouts.json` unless the request is specifically about plan data.
13. State whether `apps-script.js` changed and whether deployment is needed.
14. Run `npm run qa`.
15. Report what passed, what failed, and what risks remain.

## Required Report Shape

- Request:
- Product goal:
- Affected flows:
- QA level:
- Change made:
- Apps Script deploy needed:
- QA command:
- Passed:
- Failed:
- Remaining risk:
- Recommended next step:
