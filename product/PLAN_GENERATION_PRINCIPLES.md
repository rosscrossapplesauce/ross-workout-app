# Plan Generation Principles

Version: 0.1 draft

Purpose: define the evidence-backed planning rules that generated plans and plan modifications must obey before a user sees or accepts them.

This document is not medical advice and must not diagnose, treat, or override clinician guidance. It is a conservative product rulebook for apparently healthy adults unless a future version explicitly defines another population.

## Product Standard

AI may assemble a plan, but it should not invent the training philosophy. Generated plans must be checked against these principles before they are saved or shown.

Each principle should include:

- Population: who the rule applies to.
- Inputs: which app fields define that population.
- Rule: what the plan must do.
- Avoid: what the plan must not do.
- Evidence: at least four relevant sources for mature principles, using PubMed-indexed studies, systematic reviews, position stands, or guidelines where possible.
- Uncertainty: what the app should not claim as settled.

## User Input Mapping

Use current app fields this way:

- `trainingExperience`: maps to beginner, returning, intermediate, or experienced.
- `trainingPace`: maps to progression aggressiveness.
- `mainGoal` and `goals`: map to strength, hypertrophy, weight loss, endurance, hybrid, or sport-support priorities.
- `crossTrainingSport`: maps to sport-support constraints and interference management.
- `daysPerWeek`, `workoutLength`, `restDays`, `startDate`: map to schedule feasibility.
- `strengthSamples`: map to conservative starting loads, never maximal loads.
- `cardioBaseline` from settings: maps to starting aerobic dose once implemented.
- `limitationsEnabled`, `limitationDuration`, `limitationTags`, `avoidMovements`: map to temporary or indefinite constraints.
- `history`: maps to progression, missed-workout recovery, and substitutions.

## Principle 1: Baseline Weekly Activity

Population: apparently healthy adults, including returning users unless limitations suggest otherwise.

Rule:

- Plans should include both aerobic and muscle-strengthening work unless the user explicitly requests a short-term narrow goal.
- For general fitness, the long-term target should trend toward 150-300 minutes per week of moderate aerobic work or equivalent, plus muscle-strengthening activity on at least 2 days per week.
- Beginners and returning users may start below this target, but the plan must explain through structure, not copy, that volume increases gradually.

Avoid:

- Do not imply that more training is always better.
- Do not prescribe aggressive weekly cardio volume jumps for users marked beginner, returning, sore, or limited.
- Do not make AI generation necessary for a usable baseline plan.

Evidence: S1, S2, S3, S4, S9

Uncertainty:

- Exact optimal cardio dose depends on goals, baseline fitness, available time, and recovery. The app should use ranges, not false precision.

## Principle 2: Conservative Strength Progression

Population: adults doing resistance training, especially beginner, returning, or uncertain-history users.

Rule:

- Start with conservative loads derived from user samples, prior history, or clearly marked suggested weights.
- Prefer repeatable sets with good form over maximal loading.
- Use simple progression: increase load only after the user completes prescribed work with acceptable effort and no user-entered limitation signal.
- Default beginner and returning plans should use moderate set counts and avoid high-fatigue specialization.

Avoid:

- Do not prescribe one-rep-max testing as a requirement.
- Do not jump loads based only on AI confidence.
- Do not train every set to failure by default.

Evidence: S3, S4, S5, S6, S7, S8

Uncertainty:

- Hypertrophy and strength can both improve across a range of volumes and frequencies. The app should avoid pretending one narrow set/rep scheme is universally optimal.

## Principle 3: Effort And Failure

Population: all resistance-training plans, with special caution for beginners, returning users, and users with soreness or temporary limitations.

Rule:

- Default generated plans should stop short of failure most of the time.
- Failure or near-failure work may appear only when the user is experienced, the exercise is appropriate, volume is controlled, and recovery is protected.
- If the app later collects RPE/RIR, use it as a progression signal, not as a medical or diagnostic score.

Avoid:

- Do not make failure training the default path for weight loss, hypertrophy, or strength.
- Do not use failure on high-risk or high-skill movements for beginners.
- Do not add intensity techniques until the base plan is stable.

Evidence: S4, S7, S8, S10, S11

Uncertainty:

- Proximity-to-failure may matter differently for strength, hypertrophy, power, and user experience. The app should grade this conservatively.

## Principle 4: Concurrent Strength And Cardio

Population: users combining strength with rowing, running, sport, or endurance goals.

Rule:

- Hybrid plans should manage interference risk by controlling endurance volume, intensity, modality, and timing.
- If strength or hypertrophy is a major goal, place heavy strength before hard endurance in the same session when practical, or separate hard modalities across days.
- If sport/endurance is the main goal, strength should support the sport without crowding key conditioning sessions.
- Running volume should be progressed more cautiously than low-impact cardio when lower-body strength, soreness, or limitations are relevant.

Avoid:

- Do not stack hard intervals, heavy lower-body lifting, and sport-specific fatigue without recovery.
- Do not assume cardio always harms strength; use interference rules as risk management, not dogma.
- Do not bury cross-training sport in free text without converting it into plan constraints.

Evidence: S12, S13, S14, S15, S16

Uncertainty:

- Concurrent-training interference varies by training status, modality, intensity, recovery, and goal. The app should prioritize conservative scheduling over absolute claims.

## Principle 5: Recovery And Missed-Workout Handling

Population: all plans and plan modifications.

Rule:

- Every week should include recovery opportunities through rest days, lower-stress days, or reduced load/volume.
- Plans should not make missed workouts cascade into punishment. A missed day should trigger resume, skip, or adjust options.
- Temporary soreness, time limits, or equipment problems should adjust today's workout first, not permanently rewrite the plan unless the user asks.
- Deload-style reductions should be available when accumulated fatigue or repeated missed work appears.

Avoid:

- Do not double the next workout to make up for a missed one.
- Do not remove rest days to chase a goal deadline.
- Do not treat soreness notes as diagnosis.

Evidence: S2, S3, S17, S18, S19

Uncertainty:

- Recovery needs are individual and are not fully visible from app data. The app should offer conservative defaults and user-facing adjustment paths.

## Principle 6: Limitations And Substitutions

Population: users with enabled temporary or indefinite limitations, crowded equipment, unavailable equipment, or exercise preferences.

Rule:

- Limitations should only affect plans when enabled by the user.
- Temporary limitations should modify near-term loading, volume, or exercise choices without rewriting the user's identity or long-term goal.
- Indefinite limitations should remain active in future plan previews until turned off.
- Substitutions should preserve the training intent: movement pattern, primary muscle group, equipment context, set/rep intent, and fatigue cost.
- When the app cannot safely infer a substitute, it should offer conservative options and avoid claiming medical suitability.

Avoid:

- Do not offer substitutions that contradict the stated limitation.
- Do not convert a temporary sore-back note into permanent avoidance unless the user chooses indefinite.
- Do not present injury guidance as medical advice.

Evidence: S2, S3, S4, S17, S20

Uncertainty:

- Direct evidence for app-level exercise substitution rules is less standardized than volume or activity guidelines. Treat substitution logic as biomechanics-informed product policy requiring future expert review.

## Principle 7: Generated Plan Validation

Population: every AI-generated plan or plan extension.

Rule:

- Generated output must be validated before preview:
  - Has 4 weeks unless the request is explicitly an extension of different length.
  - Respects requested days per week and realistic workout length.
  - Includes rest/recovery structure.
  - Applies limitations and sport context.
  - Does not exceed conservative progression rules for beginners/returning users.
  - Does not remove local fallback usability.
  - Uses user-facing notes, not backend or model language.

Avoid:

- Do not activate a generated plan automatically.
- Do not show a plan that contradicts enabled limitations.
- Do not overwrite `workouts.json`.
- Do not require Google Sheets or AI for the starter plan.

Evidence: S1, S2, S3, S4, S17

Uncertainty:

- Validation can catch obvious contradictions, but full training quality still requires stronger rule models and future expert review.

## Implementation Roadmap

### Stage 1: Spec Only

Current stage. Keep this file as the durable product brain. No app behavior changes required yet.

### Stage 2: Prompt Integration

Add a concise version of these principles to the Apps Script plan-generation prompt. The prompt should say the model must generate within the rules, not invent alternative principles.

Requires:

- `apps-script.js` change.
- Apps Script push/deploy after merge.
- QA of generation error/recovery copy.

### Stage 3: Deterministic Validator

Create a local or Apps Script validator that checks generated plans before preview.

Potential checks:

- Days per week.
- Rest day count.
- Weekly strength/cardio balance.
- Hard-day clustering.
- Limitation contradictions.
- Conservative load progression.
- Workout length rough estimate.

### Stage 4: Evidence-Versioned Rules

Give every principle an ID, evidence grade, last-reviewed date, and source list. Generated plan metadata should include the ruleset version used.

## Source Index

S1. WHO Guidelines on Physical Activity and Sedentary Behaviour, recommendations chapter. NCBI Bookshelf. https://www.ncbi.nlm.nih.gov/books/NBK566046/

S2. Garber CE et al. ACSM Position Stand: Quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults. Med Sci Sports Exerc. 2011. PMID: 21694556. https://pubmed.ncbi.nlm.nih.gov/21694556/

S3. American College of Sports Medicine. Progression models in resistance training for healthy adults. Med Sci Sports Exerc. 2009. PMID: 19204579. https://pubmed.ncbi.nlm.nih.gov/19204579/

S4. American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Med Sci Sports Exerc. 2026. PMID: 41843416. https://pubmed.ncbi.nlm.nih.gov/41843416/

S5. Schoenfeld BJ et al. Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. J Sports Sci. 2017. PMID: 27433992. https://pubmed.ncbi.nlm.nih.gov/27433992/

S6. Schoenfeld BJ et al. How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis. J Sports Sci. 2019. PMID: 30558493. https://pubmed.ncbi.nlm.nih.gov/30558493/

S7. Grgic J et al. Effects of resistance training performed to repetition failure or non-failure on muscular strength and hypertrophy: a systematic review and meta-analysis. J Sport Health Sci. 2021. PMID: 33497853. https://pubmed.ncbi.nlm.nih.gov/33497853/

S8. Vieira AF et al. Effects of resistance training performed to failure or not to failure on muscle strength, hypertrophy, and power output: a systematic review with meta-analysis. J Strength Cond Res. 2021. PMID: 33555822. https://pubmed.ncbi.nlm.nih.gov/33555822/

S9. WHO 2020 guidelines on physical activity and sedentary behavior. PubMed. PMID: 35782159. https://pubmed.ncbi.nlm.nih.gov/35782159/

S10. Zourdos MC et al. Application of the Repetitions in Reserve-Based Rating of Perceived Exertion Scale for Resistance Training. Strength Cond J. 2016. https://pmc.ncbi.nlm.nih.gov/articles/PMC4961270/

S11. Hackett DA et al. Repetitions in Reserve Is a Reliable Tool for Prescribing Resistance Training Load. J Strength Cond Res. 2022. PMID: 36135029. https://pubmed.ncbi.nlm.nih.gov/36135029/

S12. Schumann M et al. Concurrent Strength and Endurance Training: A Systematic Review and Meta-Analysis on the Impact of Sex and Training Status. Sports Med Open. 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC10933151/

S13. Eklund D et al. Development of Maximal Dynamic Strength During Concurrent Resistance and Endurance Training in Untrained, Moderately Trained, and Trained Individuals: A Systematic Review and Meta-analysis. Sports Med. 2021. PMID: 33751469. https://pubmed.ncbi.nlm.nih.gov/33751469/

S14. Murlasits Z et al. The Role of Intra-Session Exercise Sequence in the Interference Effect: A Systematic Review with Meta-Analysis. Sports Med. 2018. PMID: 28917030. https://pubmed.ncbi.nlm.nih.gov/28917030/

S15. Fyfe JJ et al. Interference between concurrent resistance and endurance exercise: molecular bases and the role of individual training variables. Sports Med. 2014. PMID: 24728927. https://pubmed.ncbi.nlm.nih.gov/24728927/

S16. Maximizing Adaptations in Concurrent Training: An Umbrella Review of Meta-analyses. PubMed. PMID: 41762427. https://pubmed.ncbi.nlm.nih.gov/41762427/

S17. DeWeese BH et al. The Importance of Recovery in Resistance Training Microcycle Construction. PubMed. PMID: 38689583. https://pubmed.ncbi.nlm.nih.gov/38689583/

S18. Herold F et al. The use of periodization in exercise prescriptions for inactive adults: a systematic review. Prev Med. 2016. PMID: 26844095. https://pubmed.ncbi.nlm.nih.gov/26844095/

S19. Bishop PA et al. Recovery from training: a brief review. J Strength Cond Res. 2008. PMID: 18438210. https://pubmed.ncbi.nlm.nih.gov/18438210/

S20. Baz-Valle E et al. Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains? A Systematic Review. J Strength Cond Res. 2022. https://pubmed.ncbi.nlm.nih.gov/?term=Does+Varying+Resistance+Exercises+Promote+Superior+Muscle+Hypertrophy+and+Strength+Gains
