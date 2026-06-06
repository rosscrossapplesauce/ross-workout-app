let data;
let weekIndex = Number(localStorage.getItem("weekIndex") || 0);
let dayIndex = Number(localStorage.getItem("dayIndex") || 0);
let itemIndex = Number(localStorage.getItem("itemIndex") || 0);
let syncInFlight = false;
let overviewOpen = false;
let screenMode = "home";
let planMessage = "";
let overviewMode = "list";
let monthMessage = "";

const $ = id => document.getElementById(id);
const key = () => getPlanSource() === "generated" ? `rossWorkout.v1.generated.w${weekIndex}.d${dayIndex}` : `rossWorkout.v1.w${weekIndex}.d${dayIndex}`;
const HISTORY_KEY = "rossWorkout.v1.history";
const PENDING_KEY = "rossWorkout.v1.pendingSync";
const SYNC_URL_KEY = "rossWorkout.v1.syncUrl";
const ALTERNATIVES_KEY = "rossWorkout.v1.alternatives";
const PLAN_SETTINGS_KEY = "rossWorkout.v1.planSettings";
const EXERCISE_PREFS_KEY = "rossWorkout.v1.exercisePreferences";
const GENERATED_PLAN_KEY = "rossWorkout.v1.generatedPlan";
const PENDING_PLAN_KEY = "rossWorkout.v1.pendingPlan";
const PLAN_SOURCE_KEY = "rossWorkout.v1.planSource";

async function init(){
  lockViewportHeight();
  const res = await fetch("workouts.json");
  data = await res.json();
  buildSelectors();
  renderHome();
  loadRemoteHistory();
}
function lockViewportHeight(){
  const setHeight = () => document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
  setHeight();
  window.addEventListener("resize", setHeight);
  window.addEventListener("orientationchange", setHeight);
  document.addEventListener("touchmove", e => {
    if(!e.target.closest || (!e.target.closest("input, textarea, select") && !e.target.closest(".scrollPanel"))) e.preventDefault();
  }, {passive:false});
}
function buildSelectors(){
  const plan = getActivePlan();
  $("weekSelect").innerHTML = plan.weeks.map((w,i)=>`<option value="${i}">Week ${w.week}</option>`).join("");
  buildDaySelector();
  $("weekSelect").value = weekIndex;
  $("daySelect").value = dayIndex;
  $("weekSelect").onchange = e => { weekIndex=Number(e.target.value); dayIndex=Math.min(dayIndex, getActivePlan().weeks[weekIndex].days.length-1); itemIndex=0; buildDaySelector(); saveNav(); render(); };
  $("daySelect").onchange = e => { dayIndex=Number(e.target.value); itemIndex=0; saveNav(); render(); };
  $("prevBtn").onclick = prevItem;
  $("nextBtn").onclick = nextItem;
  $("doneBtn").onclick = markDone;
  $("resetBtn").onclick = resetDay;
  $("homeBtn").onclick = renderHome;
  $("overviewBtn").onclick = showOverview;
  window.addEventListener("online", syncPending);
  window.addEventListener("offline", updateSyncStatus);
  updateSyncStatus();
  syncPending();
}
function buildDaySelector(){
  const plan = getActivePlan();
  weekIndex = Math.min(weekIndex, plan.weeks.length - 1);
  dayIndex = Math.min(dayIndex, plan.weeks[weekIndex].days.length - 1);
  $("daySelect").innerHTML = plan.weeks[weekIndex].days.map((d,i)=>`<option value="${i}">${d.day}</option>`).join("");
  $("daySelect").value = dayIndex;
}
function saveNav(){
  localStorage.setItem("weekIndex", weekIndex);
  localStorage.setItem("dayIndex", dayIndex);
  localStorage.setItem("itemIndex", itemIndex);
}
function getDay(){
  const plan = getActivePlan();
  weekIndex = Math.min(weekIndex, plan.weeks.length - 1);
  dayIndex = Math.min(dayIndex, plan.weeks[weekIndex].days.length - 1);
  return plan.weeks[weekIndex].days[dayIndex];
}
function getPlanSource(){
  return hasGeneratedPlan() && localStorage.getItem(PLAN_SOURCE_KEY) === "generated" ? "generated" : "original";
}
function getActivePlan(){
  return getPlanSource() === "generated" ? readObject(GENERATED_PLAN_KEY, data) : data;
}
function hasGeneratedPlan(){
  const plan = readObject(GENERATED_PLAN_KEY, null);
  return isValidPlan(plan);
}
function switchPlan(source){
  if(source === "generated" && !hasGeneratedPlan()) return;
  localStorage.setItem(PLAN_SOURCE_KEY, source === "generated" ? "generated" : "original");
  weekIndex = 0;
  dayIndex = 0;
  itemIndex = 0;
  overviewOpen = false;
  buildSelectors();
  saveNav();
  renderHome();
}
function getItems(day){
  const arr = [];
  day.exercises.forEach((x,idx)=> arr.push({kind:"exercise", idx, ...x}));
  if(day.row) arr.push({kind:"row", ...day.row});
  if(day.run) arr.push({kind:"run", ...day.run});
  if(day.recovery) arr.push({kind:"rest", text:day.recovery});
  return arr;
}
function getState(){
  return JSON.parse(localStorage.getItem(key()) || '{"completed":{},"weights":{},"setWeights":{},"notes":{}}');
}
function setState(s){
  localStorage.setItem(key(), JSON.stringify(s));
}
function readList(storageKey){
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}
function writeList(storageKey, value){
  localStorage.setItem(storageKey, JSON.stringify(value));
}
function readObject(storageKey, fallback = {}){
  try {
    return JSON.parse(localStorage.getItem(storageKey) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
function writeObject(storageKey, value){
  localStorage.setItem(storageKey, JSON.stringify(value));
}
function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}
function jsString(value){
  return JSON.stringify(String(value ?? "")).replace(/</g, "\\u003c");
}
function formatDate(value){
  if(!value) return "";
  return new Date(value).toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"});
}
function todayInputDate(){
  const date = new Date();
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}
function getContextId(id){
  return `${getPlanSource()}.w${weekIndex}.d${dayIndex}.${id}`;
}
function getLastHistory(exName, currentContext){
  return readList(HISTORY_KEY)
    .filter(record => record.exercise === exName && record.context !== currentContext && record.completed && record.completedWeight !== "")
    .sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
}
function historySummary(item, id){
  const state = getState();
  const exercise = effectiveExercise(item, id, state);
  const exerciseName = exercise.name;
  const last = getLastHistory(exerciseName, getContextId(id));
  if(!last) return "";
  const lastDisplay = last.setWeights || last.completedWeight;
  const lastWeight = finalWeight(lastDisplay);
  const currentTarget = Number(exercise.suggestedWeight);
  const change = Number.isFinite(lastWeight) && Number.isFinite(currentTarget) ? currentTarget - lastWeight : null;
  const changeText = change === null ? "" : ` · ${change >= 0 ? "+" : ""}${change} ${exercise.unit}`;
  return `<div class="lastWeek">Last completed: ${escapeHtml(lastDisplay)} ${escapeHtml(exercise.unit)} · ${formatDate(last.timestamp)}${changeText}</div>`;
}
function render(){
  screenMode = "workout";
  document.body.dataset.mode = "workout";
  document.body.dataset.overview = overviewOpen ? "true" : "false";
  const plan = getActivePlan();
  const day = getDay();
  const items = getItems(day);
  if(itemIndex >= items.length) itemIndex = Math.max(0, items.length-1);
  $("weekLabel").innerText = `${getPlanSource() === "generated" ? "Custom" : "Week"} ${plan.weeks[weekIndex].week || weekIndex+1}`;
  $("dayTitle").innerHTML = `<span>${escapeHtml(day.day)}</span><span>${escapeHtml(day.title)}</span>`;
  $("weekSelect").value = weekIndex;
  $("daySelect").value = dayIndex;
  $("doneBtn").style.display = items.length ? "block" : "none";
  $("doneBtn").innerText = "Done ✓";
  $("doneBtn").onclick = markDone;
  $("prevBtn").style.display = "block";
  $("nextBtn").style.display = "block";
  $("homeBtn").style.display = "block";
  $("overviewBtn").innerText = "Overview";
  $("overviewBtn").onclick = showOverview;
  $("resetBtn").style.display = "block";
  $("resetBtn").innerText = "Reset Day";
  $("resetBtn").onclick = resetDay;

  if(overviewOpen){
    renderOverview(day, items);
    return;
  }

  const state = getState();
  const completedCount = items.filter((_,i)=>state.completed[itemId(items[i], i)]).length;
  const total = items.length;
  $("progressText").innerText = total ? `${itemIndex+1} of ${total} · ${completedCount} done` : "Rest day";
  $("scoreText").innerText = total ? `${Math.round(completedCount/total*100)}%` : "";
  $("progressBar").style.width = total ? `${completedCount/total*100}%` : "0%";

  if(!items.length){ $("screen").innerHTML = `<div class="card rest"><div><div class="exerciseName">Rest Day</div><div class="hint">${day.recovery || "No workout today."}</div></div></div>`; return; }

  const item = items[itemIndex];
  const id = itemId(item, itemIndex);
  const done = !!state.completed[id];

  if(item.kind === "exercise"){
    const exercise = effectiveExercise(item, id, state);
    const history = historySummary(item, id);
    const setWeights = getSetWeights(state, id, exercise);
    const notes = state.notes[id] || "";
    const originalName = exercise.name === item.name ? "" : `<div class="altApplied">Original: ${escapeHtml(item.name)}</div>`;
    $("screen").innerHTML = `
      <section class="card ${done ? "completed":""}">
        <div>
          <div class="kicker"><span>Exercise ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${escapeHtml(exercise.name)}</div>
          ${originalName}
          <div class="prescription">${escapeHtml(exercise.sets)} × ${escapeHtml(exercise.reps)}</div>
          <div class="bigWeight">${escapeHtml(exercise.suggestedWeight)}<span class="unit"> ${escapeHtml(exercise.unit)}</span></div>
          ${history}
          <button class="altBtn" onclick="loadAlternatives()">Alternatives</button>
        </div>
        <div>
          <label>Completed weight by set</label>
          <div class="setGrid">
            ${setWeights.map((weight,setIndex)=>setWeightRow(exercise, setIndex, weight)).join("")}
          </div>
          <button class="suggestedBtn" onclick="useSuggested()">Use suggested for all sets</button>
          <details class="notesFold" ${notes ? "open" : ""}>
            <summary>Notes</summary>
            <textarea id="noteInput" placeholder="Optional">${notes}</textarea>
          </details>
        </div>
      </section>`;
    setTimeout(()=>{
      document.querySelectorAll(".setWeightInput").forEach(input => input.oninput = saveInputs);
      $("noteInput").oninput = saveInputs;
    },0);
  } else if(item.kind === "row"){
    $("screen").innerHTML = `
      <section class="card ${done ? "completed":""}">
        <div>
          <div class="kicker"><span>Cardio ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${item.type}</div>
          <div class="bigWeight" style="font-size:64px">${item.duration}</div>
          <div class="prescription">${item.intensity}</div>
          <div class="smallDetail">${item.pace}</div>
        </div>
      </section>`;
  } else if(item.kind === "run"){
    $("screen").innerHTML = `
      <section class="card ${done ? "completed":""}">
        <div>
          <div class="kicker"><span>Run ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${item.type}</div>
          <div class="bigWeight" style="font-size:76px">${item.distance}</div>
          <div class="prescription">${item.pace}</div>
        </div>
      </section>`;
  } else {
    $("screen").innerHTML = `<section class="card rest ${done ? "completed":""}"><div><div class="exerciseName">Rest Day</div><div class="hint">${item.text}</div></div></section>`;
  }
  saveNav();
}
function renderHome(){
  screenMode = "home";
  overviewOpen = false;
  document.body.dataset.mode = "home";
  document.body.dataset.overview = "false";
  const settings = readObject(PLAN_SETTINGS_KEY, null);
  const generatedPlan = hasGeneratedPlan() ? readObject(GENERATED_PLAN_KEY, null) : null;
  const pendingPlan = readObject(PENDING_PLAN_KEY, null);
  const generatedActive = getPlanSource() === "generated";
  const activePlan = getActivePlan();
  $("weekLabel").innerText = "Workout";
  $("dayTitle").innerHTML = `<span>Ross Workout</span><span>Coach</span>`;
  $("progressText").innerText = generatedActive ? "Generated plan active" : (settings ? "Custom goals saved" : "Current hybrid fat-loss plan");
  $("scoreText").innerText = "";
  $("progressBar").style.width = settings ? "100%" : "0%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Workout";
  $("overviewBtn").onclick = () => render();
  $("screen").innerHTML = `
    <section class="homePanel scrollPanel">
      <div>
        <div class="homeTitle">${generatedActive ? "Generated Plan" : "Current Plan"}</div>
        <div class="homeText">${escapeHtml(activePlan.summary || "Fat-loss hybrid training with rowing, conservative strength progression, upper/shoulder emphasis, lower-body work, one easy run, and Sunday rest.")}</div>
      </div>
      <div class="homeActions">
        <button class="primary" onclick="render()">Continue current plan</button>
        ${settings ? `<button onclick="generatePersonalPlan()">Generate private plan</button>` : ""}
        ${generatedPlan && !generatedActive ? `<button onclick="switchPlan('generated')">Use generated plan</button>` : ""}
        ${generatedActive ? `<button onclick="switchPlan('original')">Use original plan</button>` : ""}
        <button onclick="renderSetup('change')">Change current plan's goals</button>
        ${settings ? `<button onclick="renderScheduleSetup()">Edit dates + rest days</button>` : ""}
        <button onclick="renderSetup('new')">Start a new plan</button>
        <button onclick="renderProgress()">Progress</button>
      </div>
      ${planMessage ? `<div class="planMessage">${escapeHtml(planMessage)}</div>` : ""}
      ${pendingPlan ? pendingPlanSummary(pendingPlan) : ""}
      ${generatedPlan ? `<div class="planSummary">${generatedPlanSummary(generatedPlan)}</div>` : ""}
      ${settings ? `<div class="planSummary">${planSummary(settings)}</div>` : ""}
    </section>`;
}
function pendingPlanSummary(plan){
  return `
    <div class="planSummary previewPlan">
      <div class="summaryTitle">Plan Preview</div>
      <div>${escapeHtml(plan.name || "Generated plan")}</div>
      <div>${escapeHtml(plan.weeks.length)} weeks · ${escapeHtml(plan.weeks[0].days.length)} days/week</div>
      ${plan.summary ? `<div>${escapeHtml(plan.summary)}</div>` : ""}
      ${plan.notes ? `<div>${escapeHtml(plan.notes)}</div>` : ""}
      <div class="previewActions">
        <button class="primary" onclick="activatePendingPlan()">Use this plan</button>
        <button onclick="discardPendingPlan()">Keep current plan</button>
      </div>
    </div>`;
}
function generatedPlanSummary(plan){
  return `
    <div class="summaryTitle">${escapeHtml(plan.name || "Generated plan")}</div>
    <div>${escapeHtml(plan.weeks.length)} weeks · ${escapeHtml(plan.weeks[0].days.length)} days/week</div>
    ${plan.generatedAt ? `<div>Generated ${formatDate(plan.generatedAt)}</div>` : ""}
    ${plan.notes ? `<div>${escapeHtml(plan.notes)}</div>` : ""}`;
}
function planSummary(settings){
  return `
    <div class="summaryTitle">Saved setup</div>
    <div>${escapeHtml(settings.mainGoal || (settings.goals || []).join(" + ") || "No goals selected")}</div>
    <div>${escapeHtml(settings.daysPerWeek || "?")} days/week · ${escapeHtml(settings.workoutLength || "?")} min · starts ${escapeHtml(settings.startDate || "?")}</div>
    ${settings.trainingExperience ? `<div>${escapeHtml(settings.trainingExperience)} · ${escapeHtml(settings.trainingPace || "steady pace")}</div>` : ""}
    ${settings.crossTrainingSport ? `<div>Cross-training for ${escapeHtml(settings.crossTrainingSport)}</div>` : ""}`;
}
function renderScheduleSetup(){
  screenMode = "setup";
  overviewOpen = false;
  document.body.dataset.mode = "setup";
  document.body.dataset.overview = "false";
  const current = readObject(PLAN_SETTINGS_KEY, {});
  $("weekLabel").innerText = "Schedule";
  $("dayTitle").innerHTML = `<span>Edit</span><span>Plan Dates</span>`;
  $("progressText").innerText = "This does not change your workouts";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "block";
  $("doneBtn").innerText = "Save schedule";
  $("doneBtn").onclick = saveScheduleSetup;
  $("resetBtn").style.display = "block";
  $("resetBtn").innerText = "Cancel";
  $("resetBtn").onclick = renderHome;
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  $("screen").innerHTML = `
    <section class="setupPanel scrollPanel">
      <div class="setupHint">Adjust calendar dates without changing the exercises or weights already in your plan.</div>
      <div class="setupGrid">
        <label>Start date<input id="scheduleStartDate" type="date" required value="${escapeHtml(current.startDate || "")}"></label>
        <label>Preferred rest days<input id="scheduleRestDays" placeholder="Sunday, Thursday" value="${escapeHtml(current.restDays || "")}"></label>
      </div>
    </section>`;
}
function saveScheduleSetup(){
  const settings = readObject(PLAN_SETTINGS_KEY, {});
  if(!$("scheduleStartDate").value){
    alert("Pick a starting date before saving your schedule.");
    return;
  }
  settings.startDate = $("scheduleStartDate").value;
  settings.restDays = $("scheduleRestDays").value.trim();
  if(settings.planBias) settings.planBias.startDate = settings.startDate;
  writeObject(PLAN_SETTINGS_KEY, settings);
  planMessage = "Schedule saved.";
  overviewMode = "calendar";
  renderHome();
}
function renderSetup(mode){
  screenMode = "setup";
  overviewOpen = false;
  document.body.dataset.mode = "setup";
  document.body.dataset.overview = "false";
  const current = mode === "change" ? readObject(PLAN_SETTINGS_KEY, {}) : {};
  $("weekLabel").innerText = mode === "new" ? "New Plan" : "Plan Goals";
  $("dayTitle").innerHTML = `<span>${mode === "new" ? "Start" : "Update"}</span><span>Training Plan</span>`;
  $("progressText").innerText = "Skip anything you do not know";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "33%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "block";
  $("doneBtn").innerText = "Save plan setup";
  $("doneBtn").onclick = () => savePlanSetup(mode);
  $("resetBtn").style.display = "block";
  $("resetBtn").innerText = "Skip for now";
  $("resetBtn").onclick = renderHome;
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  $("screen").innerHTML = `
    <section class="setupPanel scrollPanel">
      <div class="setupHint">New to gym tracking? Leave weights blank. The app will start conservatively and adjust from what you log.</div>
      <div class="setupGroup">
        <div class="setupTitle">Quick start</div>
        <div class="setupGrid">
          <label>Main goal<select id="mainGoal">
            <option>Build muscle</option>
            <option>Lose weight</option>
            <option>Build endurance</option>
            <option>Return from injury</option>
            <option>General fitness</option>
            <option>Hybrid strength + cardio</option>
          </select></label>
          <label>Gym experience<select id="trainingExperience">
            <option>Athletic, new to gym</option>
            <option>Beginner</option>
            <option>Returning after time away</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select></label>
          <label>Pace<select id="trainingPace">
            <option>Conservative</option>
            <option>Moderate</option>
            <option>Ambitious</option>
          </select></label>
          <label>Limitations<input id="avoidMovements" placeholder="Injuries, machines to avoid..." value="${escapeHtml(current.avoidMovements || "")}"></label>
          <label>Start date<input id="startDate" type="date" required value="${escapeHtml(current.startDate || "")}"></label>
        </div>
      </div>
      <div class="setupGroup">
        <div class="setupTitle">Goals</div>
        <div class="checkGrid">${goalOptions().map(goal => checkOption("goal", goal, (current.goals || []).includes(goal))).join("")}</div>
        <input id="crossTrainingSport" class="setupInput" placeholder="Sport/activity for cross training" value="${escapeHtml(current.crossTrainingSport || "")}">
      </div>
      <div class="setupGrid">
        <label>Gym access<select id="gymAccess"><option>Yes</option><option>No</option></select></label>
        <label>Workout length<input id="workoutLength" type="number" inputmode="numeric" placeholder="45" value="${escapeHtml(current.workoutLength || "")}"></label>
        <label>Days/week<input id="daysPerWeek" type="number" inputmode="numeric" placeholder="5" value="${escapeHtml(current.daysPerWeek || "")}"></label>
        <label>Preferred rest days<input id="restDays" placeholder="Sunday, Thursday" value="${escapeHtml(current.restDays || "")}"></label>
      </div>
      <details class="advancedSetup">
        <summary>Add advanced starting weights</summary>
        <div class="setupHint">Optional. If you do not know these, skip them.</div>
        ${defaultStrengthSamples(current).map((sample,i) => strengthRow(i, sample)).join("")}
      </details>
    </section>`;
  if(current.gymAccess) $("gymAccess").value = current.gymAccess;
  if(current.mainGoal) $("mainGoal").value = current.mainGoal;
  if(current.trainingExperience) $("trainingExperience").value = current.trainingExperience;
  if(current.trainingPace) $("trainingPace").value = current.trainingPace;
}
function goalOptions(){
  return ["Returning to activity", "Maintenance", "Cross training", "Build endurance", "Build muscle", "Hybrid", "Weight loss"];
}
function checkOption(name, value, checked){
  return `<label class="checkOption"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${checked ? "checked" : ""}>${escapeHtml(value)}</label>`;
}
function strengthRow(index, sample = {}){
  return `
    <div class="strengthRow">
      <input class="strengthName" placeholder="Exercise" value="${escapeHtml(sample.name || "")}">
      <input class="strengthWeight" type="number" inputmode="decimal" placeholder="Weight" value="${escapeHtml(sample.weight || "")}">
      <input class="strengthReps" type="number" inputmode="numeric" placeholder="Reps" value="${escapeHtml(sample.reps || "")}">
      <input class="strengthRpe" placeholder="RPE" value="${escapeHtml(sample.rpe || "")}">
    </div>`;
}
function defaultStrengthSamples(current){
  if(current.strengthSamples && current.strengthSamples.length) return current.strengthSamples;
  const goals = current.goals || [];
  const shoulderFocus = goals.includes("Hybrid") || goals.includes("Build muscle");
  const names = shoulderFocus
    ? ["Overhead press", "Lateral raise", "Row or pulldown"]
    : ["Bench press or dumbbell press", "Squat, leg press, or split squat", "Row, pulldown, or pull-up"];
  return names.map(name => ({name}));
}
function savePlanSetup(mode){
  if(!$("startDate").value){
    alert("Pick a starting date before saving your plan setup.");
    return;
  }
  const goals = Array.from(document.querySelectorAll('input[name="goal"]:checked')).map(input => input.value);
  const strengthSamples = Array.from(document.querySelectorAll(".strengthRow")).map(row => ({
    name: row.querySelector(".strengthName").value.trim(),
    weight: row.querySelector(".strengthWeight").value.trim(),
    reps: row.querySelector(".strengthReps").value.trim(),
    rpe: row.querySelector(".strengthRpe").value.trim()
  })).filter(sample => sample.name || sample.weight || sample.reps);
  const settings = {
    mode,
    goals,
    mainGoal: $("mainGoal").value,
    trainingExperience: $("trainingExperience").value,
    trainingPace: $("trainingPace").value,
    avoidMovements: $("avoidMovements").value.trim(),
    startDate: $("startDate").value,
    crossTrainingSport: $("crossTrainingSport").value.trim(),
    gymAccess: $("gymAccess").value,
    workoutLength: $("workoutLength").value.trim(),
    daysPerWeek: $("daysPerWeek").value.trim(),
    restDays: $("restDays").value.trim(),
    strengthSamples,
    generatedAt: new Date().toISOString(),
    planBias: generatePlanBias({
      goals,
      mainGoal:$("mainGoal").value,
      trainingExperience:$("trainingExperience").value,
      trainingPace:$("trainingPace").value,
      avoidMovements:$("avoidMovements").value.trim(),
      startDate:$("startDate").value,
      crossTrainingSport:$("crossTrainingSport").value.trim(),
      strengthSamples
    })
  };
  writeObject(PLAN_SETTINGS_KEY, settings);
  localStorage.removeItem(PENDING_PLAN_KEY);
  planMessage = "Setup saved. Generate a private plan when you're ready.";
  renderHome();
}
function generatePersonalPlan(){
  const settings = readObject(PLAN_SETTINGS_KEY, null);
  if(!settings){
    planMessage = "Save your plan setup first.";
    renderHome();
    return;
  }
  if(!getSyncUrl()){
    planMessage = "Add your Apps Script Web App URL before generating a private plan.";
    renderHome();
    return;
  }
  if(!navigator.onLine){
    planMessage = "You're offline. Generate the plan when your phone is back online.";
    renderHome();
    return;
  }
  planMessage = "Generating your private plan...";
  renderHome();
  const callback = `rossWorkoutPlan${Date.now()}`;
  const script = document.createElement("script");
  let timeout;
  const cleanup = () => {
    clearTimeout(timeout);
    delete window[callback];
    script.remove();
  };
  window[callback] = payload => {
    if(payload && payload.ok && isValidPlan(payload.plan)){
      const plan = normalizeGeneratedPlan(payload.plan);
      plan.previewType = "new";
      writeObject(PENDING_PLAN_KEY, plan);
      planMessage = "Plan preview ready. Review it before switching.";
    } else {
      planMessage = payload && payload.error ? payload.error : "Could not generate a plan.";
    }
    cleanup();
    renderHome();
  };
  const separator = getSyncUrl().includes("?") ? "&" : "?";
  const payload = {
    settings,
    preferences: readObject(EXERCISE_PREFS_KEY, {}),
    history: compactGenerationHistory()
  };
  const params = new URLSearchParams({
    action:"generatePlan",
    callback,
    payload: JSON.stringify(payload)
  });
  script.src = `${getSyncUrl()}${separator}${params.toString()}`;
  script.onerror = () => {
    cleanup();
    planMessage = "Could not reach the plan generator.";
    renderHome();
  };
  timeout = setTimeout(() => {
    cleanup();
    planMessage = "Plan generation timed out. Try again in a minute.";
    renderHome();
  }, 45000);
  document.body.appendChild(script);
}
function activatePendingPlan(){
  const plan = readObject(PENDING_PLAN_KEY, null);
  if(!plan || !isValidPlan(plan)){
    planMessage = "No plan preview is ready.";
    renderHome();
    return;
  }
  const previewType = plan.previewType || "new";
  writeObject(GENERATED_PLAN_KEY, normalizeGeneratedPlan(plan));
  localStorage.removeItem(PENDING_PLAN_KEY);
  localStorage.setItem(PLAN_SOURCE_KEY, "generated");
  if(previewType !== "extension"){
    weekIndex = 0;
    dayIndex = 0;
    itemIndex = 0;
  }
  buildSelectors();
  saveNav();
  planMessage = "Generated plan is active.";
  renderHome();
}
function discardPendingPlan(){
  localStorage.removeItem(PENDING_PLAN_KEY);
  planMessage = "Kept your current plan.";
  renderHome();
}
function addAnotherMonth(){
  const activePlan = getActivePlan();
  const settings = ensurePlanSettings(activePlan);
  if(!getSyncUrl()){
    alert("Add your Apps Script Web App URL before adding another month.");
    return;
  }
  if(!navigator.onLine){
    alert("You're offline. Add another month when your phone is back online.");
    return;
  }
  monthMessage = "Building the next month...";
  overviewOpen = true;
  render();
  const callback = `rossWorkoutExtend${Date.now()}`;
  const script = document.createElement("script");
  let timeout;
  const cleanup = () => {
    clearTimeout(timeout);
    delete window[callback];
    script.remove();
  };
  window[callback] = payload => {
    if(payload && payload.ok && isValidPlan(payload.plan)){
      const extension = normalizeGeneratedPlan(payload.plan);
      const combined = appendPlanMonth(activePlan, extension);
      combined.previewType = "extension";
      writeObject(PENDING_PLAN_KEY, combined);
      monthMessage = "";
      planMessage = "Next-month preview ready. Review it before switching.";
      renderHome();
    } else {
      monthMessage = payload && payload.error ? payload.error : "Could not add another month.";
      render();
    }
    cleanup();
  };
  const separator = getSyncUrl().includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    action:"extendPlan",
    callback,
    payload: JSON.stringify({
      settings,
      currentPlan: compactPlanForGeneration(activePlan),
      history: compactGenerationHistory()
    })
  });
  script.src = `${getSyncUrl()}${separator}${params.toString()}`;
  script.onerror = () => {
    cleanup();
    monthMessage = "Could not reach the plan generator.";
    render();
  };
  timeout = setTimeout(() => {
    cleanup();
    monthMessage = "Adding another month timed out. Try again in a minute.";
    render();
  }, 45000);
  document.body.appendChild(script);
}
function ensurePlanSettings(plan){
  const saved = readObject(PLAN_SETTINGS_KEY, null);
  if(saved && saved.mainGoal && saved.startDate) return saved;
  const settings = {
    ...(saved || {}),
    mode: saved && saved.mode ? saved.mode : "auto",
    goals: saved && Array.isArray(saved.goals) ? saved.goals : inferredGoals(plan),
    mainGoal: saved && saved.mainGoal ? saved.mainGoal : "Continue current workout plan",
    trainingExperience: saved && saved.trainingExperience ? saved.trainingExperience : "Returning after time away",
    trainingPace: saved && saved.trainingPace ? saved.trainingPace : "Conservative",
    avoidMovements: saved && saved.avoidMovements ? saved.avoidMovements : "",
    startDate: saved && saved.startDate ? saved.startDate : todayInputDate(),
    crossTrainingSport: saved && saved.crossTrainingSport ? saved.crossTrainingSport : "rowing and running",
    gymAccess: saved && saved.gymAccess ? saved.gymAccess : "Yes",
    workoutLength: saved && saved.workoutLength ? saved.workoutLength : inferredWorkoutLength(plan),
    daysPerWeek: saved && saved.daysPerWeek ? saved.daysPerWeek : String((plan.weeks && plan.weeks[0] && plan.weeks[0].days || []).filter(day => getItems(day).some(item => item.kind !== "rest")).length || ""),
    restDays: saved && saved.restDays ? saved.restDays : inferredRestDays(plan),
    strengthSamples: saved && saved.strengthSamples ? saved.strengthSamples : [],
    generatedAt: saved && saved.generatedAt ? saved.generatedAt : new Date().toISOString()
  };
  settings.planBias = generatePlanBias(settings);
  writeObject(PLAN_SETTINGS_KEY, settings);
  return settings;
}
function inferredGoals(plan){
  const text = `${plan.name || ""} ${plan.summary || ""}`.toLowerCase();
  const goals = [];
  if(text.includes("endurance") || text.includes("row")) goals.push("Build endurance");
  if(text.includes("muscle") || text.includes("strength")) goals.push("Build muscle");
  if(text.includes("loss") || text.includes("fat")) goals.push("Weight loss");
  return goals.length ? goals : ["Hybrid"];
}
function inferredWorkoutLength(plan){
  const firstDay = plan.weeks && plan.weeks[0] && plan.weeks[0].days && plan.weeks[0].days.find(day => day.row || day.run || (day.exercises && day.exercises.length));
  if(!firstDay) return "";
  const rowMinutes = firstDay.row && firstDay.row.duration && firstDay.row.duration.match(/\d+/);
  if(rowMinutes) return rowMinutes[0];
  return firstDay.exercises && firstDay.exercises.length ? "45" : "";
}
function inferredRestDays(plan){
  const firstWeek = plan.weeks && plan.weeks[0] && plan.weeks[0].days || [];
  return firstWeek
    .filter(day => !day.row && !day.run && (!day.exercises || !day.exercises.length))
    .map(day => day.day)
    .filter(Boolean)
    .join(", ");
}
function compactPlanForGeneration(plan){
  return {
    name: plan.name || "",
    summary: plan.summary || "",
    weeks: (plan.weeks || []).slice(-4)
  };
}
function appendPlanMonth(currentPlan, extension){
  const base = normalizeGeneratedPlan(currentPlan);
  const startWeek = base.weeks.length;
  const extraWeeks = extension.weeks.map((week, index) => ({
    ...week,
    week: startWeek + index + 1
  }));
  return {
    ...base,
    source:"generated",
    name: base.name || extension.name || "Generated plan",
    summary: base.summary || extension.summary || "",
    notes: extension.notes || base.notes || "",
    generatedAt: new Date().toISOString(),
    weeks: [...base.weeks, ...extraWeeks]
  };
}
function compactGenerationHistory(){
  return readList(HISTORY_KEY)
    .filter(record => record && record.completed)
    .slice(-16)
    .map(record => ({
      date: record.timestamp,
      exercise: record.exercise,
      itemType: record.itemType,
      weight: record.setWeights || record.completedWeight || "",
      notes: record.notes || ""
    }));
}
function isValidPlan(plan){
  return !!(plan && Array.isArray(plan.weeks) && plan.weeks.length && plan.weeks.every(week => Array.isArray(week.days) && week.days.length));
}
function normalizeGeneratedPlan(plan){
  return {
    ...plan,
    source:"generated",
    generatedAt: plan.generatedAt || new Date().toISOString(),
    units: plan.units || "lb unless noted",
    weeks: plan.weeks.map((week, weekIdx) => ({
      week: week.week || weekIdx + 1,
      days: week.days.map((day, dayIdx) => ({
        day: day.day || `Day ${dayIdx + 1}`,
        title: day.title || "Training",
        row: day.row || null,
        run: day.run || null,
        recovery: day.recovery || "",
        exercises: Array.isArray(day.exercises) ? day.exercises.map(ex => ({
          name: ex.name || "Exercise",
          sets: Number(ex.sets) || 1,
          reps: String(ex.reps || ""),
          suggestedWeight: Number(ex.suggestedWeight) || 0,
          unit: ex.unit || "lb",
          notes: ex.notes || ""
        })) : []
      }))
    }))
  };
}
function generatePlanBias(settings){
  const goals = settings.goals || [];
  return {
    mainGoal: settings.mainGoal || "",
    experience: settings.trainingExperience || "",
    pace: settings.trainingPace || "",
    avoidMovements: settings.avoidMovements || "",
    startDate: settings.startDate || "",
    conditioning: goals.includes("Build endurance") || goals.includes("Weight loss") || goals.includes("Hybrid") ? "rowing-forward aerobic base with one hard interval day" : "moderate conditioning",
    strength: goals.includes("Build muscle") ? "progressive hypertrophy with conservative loading" : "maintenance-friendly strength progression",
    sport: settings.crossTrainingSport || "",
    equipment: "standard gym equipment",
    startingWeights: estimateStartingWeights(settings.strengthSamples || [])
  };
}
function estimateStartingWeights(samples){
  return samples.map(sample => {
    const weight = Number(sample.weight);
    const reps = Number(sample.reps);
    const estimate = Number.isFinite(weight) && Number.isFinite(reps) ? Math.round(weight * (1 + reps / 30) * 0.7 / 5) * 5 : "";
    return {...sample, conservativeStart: estimate};
  });
}
function renderProgress(){
  screenMode = "progress";
  overviewOpen = false;
  document.body.dataset.mode = "progress";
  document.body.dataset.overview = "false";
  $("weekLabel").innerText = "Progress";
  $("dayTitle").innerHTML = `<span>Strength</span><span>Trends</span>`;
  $("progressText").innerText = "Actual + projected";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  const series = strengthSeries().slice(0, 3);
  $("screen").innerHTML = `
    <section class="progressPanel scrollPanel">
      ${series.length ? series.map(chartCard).join("") : `<div class="homeText">Log completed set weights to see strength charts here.</div>`}
      <div class="legend"><span class="actualLine"></span>Actual <span class="planLine"></span>Current plan <span class="potentialLine"></span>Adjusted potential</div>
    </section>`;
}
function strengthSeries(){
  const byExercise = {};
  readList(HISTORY_KEY).filter(record => record.completed && record.exercise && record.setWeights).forEach(record => {
    const weight = finalWeight(record.setWeights);
    if(!Number.isFinite(weight)) return;
    if(!byExercise[record.exercise]) byExercise[record.exercise] = [];
    byExercise[record.exercise].push({date:record.timestamp, weight});
  });
  return Object.entries(byExercise)
    .map(([exercise, points]) => ({exercise, points:points.slice(-8)}))
    .filter(item => item.points.length)
    .sort((a,b)=>b.points.length-a.points.length);
}
function chartCard(series){
  return `<div class="chartCard"><div class="chartTitle">${escapeHtml(series.exercise)}</div>${chartSvg(series.points)}</div>`;
}
function chartSvg(points){
  const width = 320, height = 140, pad = 18;
  const weights = points.map(p => p.weight);
  const min = Math.min(...weights) - 5;
  const max = Math.max(...weights) + 15;
  const x = i => pad + (points.length === 1 ? 0 : i * (width - pad * 2) / (points.length - 1));
  const y = weight => height - pad - ((weight - min) / Math.max(1, max - min)) * (height - pad * 2);
  const actual = points.map((p,i)=>`${x(i)},${y(p.weight)}`).join(" ");
  const last = points[points.length-1].weight;
  const gain = points.length > 1 ? Math.max(1, (last - points[0].weight) / points.length) : 2;
  const startX = x(points.length - 1);
  const planEnd = `${width-pad},${y(last + gain * 4)}`;
  const potentialEnd = `${width-pad},${y(last + gain * 7)}`;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    <polyline class="actual" points="${actual}"></polyline>
    <line class="plan" x1="${startX}" y1="${y(last)}" x2="${planEnd.split(",")[0]}" y2="${planEnd.split(",")[1]}"></line>
    <line class="potential" x1="${startX}" y1="${y(last)}" x2="${potentialEnd.split(",")[0]}" y2="${potentialEnd.split(",")[1]}"></line>
  </svg>`;
}
function renderOverview(day, items){
  const state = getState();
  const completedCount = items.filter((item,i)=>state.completed[itemId(item, i)]).length;
  $("progressText").innerText = items.length ? `${completedCount} of ${items.length} done` : "Rest day";
  $("scoreText").innerText = items.length ? `${Math.round(completedCount/items.length*100)}%` : "";
  $("progressBar").style.width = items.length ? `${completedCount/items.length*100}%` : "0%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "block";
  $("doneBtn").innerText = "Back to Exercise";
  $("overviewBtn").innerText = "Exercise";

  if(overviewMode === "calendar"){
    renderCalendarOverview();
    return;
  }

  if(!items.length){
    $("screen").innerHTML = `<section class="overviewCard rest"><div class="exerciseName">Rest Day</div><div class="hint">${escapeHtml(day.recovery || "No workout today.")}</div></section>`;
    saveNav();
    return;
  }

  $("screen").innerHTML = `
    <section class="overviewCard">
      <div class="overviewHeader">
        <div>
          <div class="kicker">Today's Workout</div>
          <div class="overviewTitle">${escapeHtml(day.day)}: ${escapeHtml(day.title)}</div>
        </div>
        <div class="overviewTools">
          <button id="syncStatus" class="status pending" type="button" onclick="configureSync()">Pending Sync</button>
          <div class="overviewCount">${completedCount}/${items.length}</div>
        </div>
      </div>
      <div class="overviewActions">
        <button type="button" onclick="toggleOverviewMode()">Calendar view</button>
        <button type="button" onclick="addAnotherMonth()">Add another month</button>
      </div>
      ${monthMessage ? `<div class="planMessage">${escapeHtml(monthMessage)}</div>` : ""}
      <div class="overviewList">
        ${items.map((item,i)=>overviewRow(item, i, !!state.completed[itemId(item, i)], state)).join("")}
      </div>
    </section>`;
  saveNav();
  updateSyncStatus();
}
function renderCalendarOverview(){
  const plan = getActivePlan();
  const state = getState();
  $("screen").innerHTML = `
    <section class="overviewCard">
      <div class="overviewHeader">
        <div>
          <div class="kicker">Calendar View</div>
          <div class="overviewTitle">${escapeHtml(plan.name || "Workout Plan")}</div>
        </div>
        <div class="overviewTools">
          <button id="syncStatus" class="status pending" type="button" onclick="configureSync()">Pending Sync</button>
        </div>
      </div>
      <div class="overviewActions">
        <button type="button" onclick="toggleOverviewMode()">Today's workout</button>
        <button type="button" onclick="addAnotherMonth()">Add another month</button>
      </div>
      ${monthMessage ? `<div class="planMessage">${escapeHtml(monthMessage)}</div>` : ""}
      <div class="calendarGrid">
        ${plan.weeks.map((week, wIdx) => `
          <div class="calendarWeek">
            <div class="calendarWeekTitle">Week ${escapeHtml(week.week || wIdx + 1)}</div>
            ${week.days.map((day, dIdx) => calendarDay(day, wIdx, dIdx, state)).join("")}
          </div>`).join("")}
      </div>
    </section>`;
  updateSyncStatus();
}
function calendarDay(day, weekIdx, dayIdx, state){
  const focus = dayFocus(day);
  const current = weekIdx === weekIndex && dayIdx === dayIndex;
  const dateLabel = planDateLabel(weekIdx, dayIdx);
  const label = dateLabel ? `${dateLabel} · ${day.day || `Day ${dayIdx + 1}`}` : (day.day || `Day ${dayIdx + 1}`);
  return `
    <button class="calendarDay ${current ? "calendarCurrent" : ""}" onclick="jumpToDay(${weekIdx}, ${dayIdx})">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(focus)}</strong>
    </button>`;
}
function planDateLabel(weekIdx, dayIdx){
  const settings = readObject(PLAN_SETTINGS_KEY, null);
  if(!settings || !settings.startDate) return "";
  const date = new Date(`${settings.startDate}T00:00:00`);
  if(Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + weekIdx * 7 + dayIdx);
  return date.toLocaleDateString(undefined, {month:"short", day:"numeric"});
}
function dayFocus(day){
  const parts = [];
  if(day.row) parts.push(`${day.row.duration || ""} row`.trim());
  if(day.run) parts.push(`${day.run.distance || day.run.duration || ""} run`.trim());
  if(day.exercises && day.exercises.length) parts.push(day.title || "Strength");
  if(!parts.length && day.recovery) parts.push("Recovery");
  return parts.filter(Boolean).join(" + ") || day.title || "Workout";
}
function toggleOverviewMode(){
  overviewMode = overviewMode === "calendar" ? "list" : "calendar";
  overviewOpen = true;
  render();
}
function jumpToDay(nextWeekIndex, nextDayIndex){
  weekIndex = nextWeekIndex;
  dayIndex = nextDayIndex;
  itemIndex = 0;
  overviewMode = "list";
  overviewOpen = true;
  buildDaySelector();
  saveNav();
  render();
}
function overviewRow(item, index, done, state){
  const id = itemId(item, index);
  const exercise = item.kind === "exercise" ? effectiveExercise(item, id, state) : item;
  const title = item.kind === "exercise" ? exercise.name : (item.type || "Rest");
  const setWeights = item.kind === "exercise" ? compactSetWeights(getSetWeights(state, id, exercise)) : [];
  const detail = item.kind === "exercise"
    ? `${exercise.sets} × ${exercise.reps} · suggested ${exercise.suggestedWeight} ${exercise.unit}${setWeights.length ? ` · sets ${setWeights.join(" / ")} ${exercise.unit}` : ""}`
    : item.kind === "row"
      ? `${item.duration} · ${item.intensity}${item.pace ? ` · ${item.pace}` : ""}`
      : item.kind === "run"
        ? `${item.distance} · ${item.pace}`
        : item.text;
  return `
    <button class="overviewItem ${done ? "overviewDone" : ""}" onclick="jumpToItem(${index})">
      <span class="overviewCheck">${done ? "✓" : index + 1}</span>
      <span class="overviewBody">
        <span class="overviewName">${escapeHtml(title)}</span>
        <span class="overviewDetail">${escapeHtml(detail)}</span>
      </span>
    </button>`;
}
function showOverview(){
  overviewOpen = !overviewOpen;
  render();
  $("screen").focus({preventScroll:true});
}
function jumpToItem(index){
  itemIndex = index;
  overviewOpen = false;
  render();
  $("screen").focus({preventScroll:true});
}
function itemId(item, i){
  if(item.kind === "exercise") return `exercise-${item.idx}`;
  return `${item.kind}-${i}`;
}
function getAppliedAlternative(state, id){
  const alternative = state.alternatives && state.alternatives[id];
  if(!alternative) return null;
  return typeof alternative === "string" ? {name: alternative} : alternative;
}
function effectiveExercise(item, id, state = getState()){
  const alternative = getAppliedAlternative(state, id);
  if(!alternative) return item;
  return {
    ...item,
    name: alternative.name || item.name,
    sets: Number(alternative.sets) || item.sets,
    reps: alternative.reps || item.reps,
    suggestedWeight: alternative.suggestedWeight !== undefined && alternative.suggestedWeight !== "" ? Number(alternative.suggestedWeight) : item.suggestedWeight,
    unit: alternative.unit || item.unit,
    notes: alternative.notes || alternative.how || item.notes || ""
  };
}
function getSetCount(item){
  const count = Number(item.sets);
  return Number.isFinite(count) && count > 0 ? count : 1;
}
function getSetWeights(state, id, item){
  const count = getSetCount(item);
  const saved = Array.isArray(state.setWeights && state.setWeights[id]) ? state.setWeights[id] : [];
  const legacy = state.weights && state.weights[id] ? [state.weights[id]] : [];
  return Array.from({length:count}, (_,index)=> String(saved[index] ?? legacy[index] ?? ""));
}
function compactSetWeights(weights){
  return weights.map(weight => String(weight).trim()).filter(Boolean);
}
function isSetComplete(value){
  return String(value).trim() !== "";
}
function setWeightRow(item, setIndex, weight){
  const missed = String(weight).toUpperCase() === "DNC";
  return `
    <div class="setWeightRow ${missed ? "setMissed" : ""}">
      <div class="setLabel">Set ${setIndex + 1}</div>
      <button class="stepBtn" onclick="adjustSetWeight(${setIndex}, -5)" aria-label="Decrease set ${setIndex + 1} weight">−</button>
      <input class="setWeightInput" data-set-index="${setIndex}" type="number" inputmode="decimal" enterkeyhint="done" placeholder="${item.suggestedWeight}" value="${missed ? "" : escapeHtml(weight)}" ${missed ? "disabled" : ""}>
      <button class="stepBtn" onclick="adjustSetWeight(${setIndex}, 5)" aria-label="Increase set ${setIndex + 1} weight">+</button>
      <button class="missBtn ${missed ? "missed" : ""}" onclick="toggleSetMissed(${setIndex})" aria-label="Did not complete set ${setIndex + 1}">${missed ? "Missed" : "DNC"}</button>
    </div>`;
}
function finalWeight(value){
  const parts = Array.isArray(value) ? compactSetWeights(value) : String(value || "").split(/[,/]/).map(part => part.trim()).filter(Boolean);
  const numeric = parts.map(part => Number(part)).filter(Number.isFinite);
  return numeric.slice(-1)[0];
}
function saveInputs(){
  const item = getItems(getDay())[itemIndex];
  const id = itemId(item,itemIndex);
  const s = getState();
  if(document.querySelector(".setWeightInput")){
    if(!s.weights) s.weights = {};
    if(!s.setWeights) s.setWeights = {};
    s.setWeights[id] = Array.from(document.querySelectorAll(".setWeightInput")).map(input => input.disabled ? "DNC" : input.value);
    s.weights[id] = compactSetWeights(s.setWeights[id]).join(" / ");
  }
  if($("noteInput")){
    if(!s.notes) s.notes = {};
    s.notes[id] = $("noteInput").value;
  }
  setState(s);
}
function useSuggested(){
  const item = getItems(getDay())[itemIndex];
  const id = itemId(item, itemIndex);
  const exercise = effectiveExercise(item, id);
  document.querySelectorAll(".setWeightRow").forEach(row => {
    row.classList.remove("setMissed");
    row.querySelector(".missBtn").classList.remove("missed");
    const input = row.querySelector(".setWeightInput");
    input.disabled = false;
    input.value = exercise.suggestedWeight;
  });
  saveInputs();
}
function adjustSetWeight(setIndex, delta){
  const item = getItems(getDay())[itemIndex];
  const id = itemId(item, itemIndex);
  const exercise = effectiveExercise(item, id);
  const input = document.querySelector(`.setWeightInput[data-set-index="${setIndex}"]`);
  if(input.disabled){
    input.disabled = false;
    input.closest(".setWeightRow").classList.remove("setMissed");
    input.closest(".setWeightRow").querySelector(".missBtn").classList.remove("missed");
  }
  const current = input.value === "" ? Number(exercise.suggestedWeight) : Number(input.value);
  if(Number.isNaN(current)) return;
  input.value = Math.max(0, current + delta);
  saveInputs();
}
function toggleSetMissed(setIndex){
  const input = document.querySelector(`.setWeightInput[data-set-index="${setIndex}"]`);
  const row = input.closest(".setWeightRow");
  const button = row.querySelector(".missBtn");
  const missed = !input.disabled;
  input.disabled = missed;
  input.value = "";
  row.classList.toggle("setMissed", missed);
  button.classList.toggle("missed", missed);
  saveInputs();
}
function alternativesKey(item){
  return `v2|${item.name}|${item.sets}|${item.reps}`;
}
function readAlternatives(){
  try {
    return JSON.parse(localStorage.getItem(ALTERNATIVES_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeAlternatives(value){
  localStorage.setItem(ALTERNATIVES_KEY, JSON.stringify(value));
}
function renderAlternativesPanel(state, alternatives){
  let panel = $("alternativesPanel");
  if(!panel){
    panel = document.createElement("div");
    panel.id = "alternativesPanel";
    panel.className = "alternativesPanel";
    document.body.appendChild(panel);
  }
  if(!panel) return;
  if(state === "loading"){
    panel.innerHTML = `<div class="altSheet"><button class="altClose" onclick="closeAlternatives()">×</button><div class="altState">Finding alternatives...</div></div>`;
    return;
  }
  if(state === "error"){
    panel.innerHTML = `<div class="altSheet"><button class="altClose" onclick="closeAlternatives()">×</button><div class="altState error">${escapeHtml(alternatives || "Could not load alternatives.")}</div></div>`;
    return;
  }
  window.currentAlternatives = alternatives.map(normalizeAlternative);
  panel.innerHTML = `
    <div class="altSheet">
      <button class="altClose" onclick="closeAlternatives()">×</button>
      <div class="altList">
        ${window.currentAlternatives.map((alt, index) => `
          <div class="altItem">
            <div class="altName">${escapeHtml(alt.name)}</div>
            <div class="altRx">${escapeHtml(alt.sets)} × ${escapeHtml(alt.reps)} · ${escapeHtml(alt.suggestedWeight)} ${escapeHtml(alt.unit)}</div>
            <div class="altDetail">${escapeHtml(alt.how || "")}</div>
            <div class="altReason">${escapeHtml(alt.why || "")}</div>
            <div class="altActions">
              <button class="justOnceBtn" onclick="useAlternativeThisTime(${index})">Just this time</button>
              <button class="preferBtn" onclick="preferAlternative(${index})">Future workouts</button>
            </div>
          </div>`).join("")}
      </div>
    </div>`;
}
function normalizeAlternative(alt){
  const item = getItems(getDay())[itemIndex];
  return {
    name: alt.name || "Alternative exercise",
    sets: Number(alt.sets) || item.sets,
    reps: alt.reps || item.reps,
    suggestedWeight: alt.suggestedWeight !== undefined && alt.suggestedWeight !== "" ? Number(alt.suggestedWeight) : item.suggestedWeight,
    unit: alt.unit || item.unit || "lb",
    how: alt.how || alt.notes || "",
    why: alt.why || ""
  };
}
function selectedAlternative(index){
  return window.currentAlternatives && window.currentAlternatives[index] ? normalizeAlternative(window.currentAlternatives[index]) : null;
}
function applyAlternativeToCurrent(alternative){
  const item = getItems(getDay())[itemIndex];
  const id = itemId(item, itemIndex);
  const state = getState();
  if(!state.alternatives) state.alternatives = {};
  state.alternatives[id] = alternative;
  if(state.setWeights && state.setWeights[id]){
    state.setWeights[id] = state.setWeights[id].slice(0, Number(alternative.sets) || 1);
  }
  setState(state);
}
function useAlternativeThisTime(index){
  const alternative = selectedAlternative(index);
  if(!alternative) return;
  applyAlternativeToCurrent(alternative);
  closeAlternatives();
  render();
}
function preferAlternative(index){
  const alternative = selectedAlternative(index);
  if(!alternative) return;
  const item = getItems(getDay())[itemIndex];
  const prefs = readObject(EXERCISE_PREFS_KEY, {});
  prefs[item.name] = {
    preferred: alternative,
    source: item.name,
    savedAt: new Date().toISOString()
  };
  writeObject(EXERCISE_PREFS_KEY, prefs);
  applyAlternativeToCurrent(alternative);
  closeAlternatives();
  render();
}
function closeAlternatives(){
  const panel = $("alternativesPanel");
  if(panel) panel.remove();
  window.currentAlternatives = [];
}
function loadAlternatives(){
  const item = getItems(getDay())[itemIndex];
  if(item.kind !== "exercise") return;
  const cache = readAlternatives();
  const localKey = alternativesKey(item);
  if(cache[localKey]){
    renderAlternativesPanel("ready", cache[localKey]);
    return;
  }
  if(!getSyncUrl()){
    renderAlternativesPanel("error", "Tap Pending Sync first and add your Apps Script Web App URL.");
    return;
  }
  if(!navigator.onLine){
    renderAlternativesPanel("error", "Offline. Try alternatives when you are back online.");
    return;
  }
  renderAlternativesPanel("loading");
  const callback = `rossWorkoutAlternatives${Date.now()}`;
  const script = document.createElement("script");
  const cleanup = () => {
    delete window[callback];
    script.remove();
  };
  window[callback] = payload => {
    if(payload && payload.ok && Array.isArray(payload.alternatives)){
      cache[localKey] = payload.alternatives;
      writeAlternatives(cache);
      renderAlternativesPanel("ready", payload.alternatives);
    } else {
      renderAlternativesPanel("error", payload && payload.error ? payload.error : "No alternatives returned.");
    }
    cleanup();
  };
  const separator = getSyncUrl().includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    action:"alternatives",
    callback,
    exercise:item.name,
    sets:String(item.sets),
    reps:String(item.reps),
    suggestedWeight:String(item.suggestedWeight),
    unit:item.unit || "",
    dayTitle:getDay().title || ""
  });
  script.src = `${getSyncUrl()}${separator}${params.toString()}`;
  script.onerror = () => {
    renderAlternativesPanel("error", "Could not reach the alternatives backend.");
    cleanup();
  };
  document.body.appendChild(script);
}
function makeLogRecord(item, id, completed){
  const day = getDay();
  const state = getState();
  const plan = getActivePlan();
  const isExercise = item.kind === "exercise";
  const exercise = isExercise ? effectiveExercise(item, id, state) : item;
  return {
    id: `${Date.now()}-${weekIndex}-${dayIndex}-${id}`,
    context: getContextId(id),
    timestamp: new Date().toISOString(),
    planSource: getPlanSource(),
    week: plan.weeks[weekIndex].week,
    day: day.day,
    dayTitle: day.title,
    exercise: isExercise ? exercise.name : (item.type || item.text || item.kind),
    originalExercise: isExercise ? item.name : "",
    itemType: item.kind,
    suggestedWeight: isExercise ? exercise.suggestedWeight : "",
    unit: isExercise ? exercise.unit : "",
    completedWeight: isExercise ? compactSetWeights(getSetWeights(state, id, exercise)).join(" / ") : "",
    setWeights: isExercise ? compactSetWeights(getSetWeights(state, id, exercise)).join(" / ") : "",
    notes: isExercise ? (state.notes[id] || "") : "",
    completed
  };
}
function saveLogRecord(record){
  const history = readList(HISTORY_KEY);
  history.push(record);
  writeList(HISTORY_KEY, history.slice(-500));
  const pending = readList(PENDING_KEY);
  pending.push(record);
  writeList(PENDING_KEY, pending);
  updateSyncStatus();
  syncPending();
}
function getSyncUrl(){
  return localStorage.getItem(SYNC_URL_KEY) || "";
}
function configureSync(){
  const existing = getSyncUrl();
  const next = prompt("Paste your Google Apps Script Web App URL:", existing);
  if(next === null) return;
  const trimmed = next.trim();
  if(trimmed){
    localStorage.setItem(SYNC_URL_KEY, trimmed);
  } else {
    localStorage.removeItem(SYNC_URL_KEY);
  }
  updateSyncStatus();
  loadRemoteHistory();
  syncPending();
}
function updateSyncStatus(){
  const pending = readList(PENDING_KEY).length;
  const status = $("syncStatus");
  if(!status) return;
  status.classList.remove("synced", "pending", "offline");
  if(!navigator.onLine){
    status.innerText = "Offline";
    status.classList.add("offline");
  } else if(pending || !getSyncUrl()){
    status.innerText = pending ? `Pending Sync (${pending})` : "Pending Sync";
    status.classList.add("pending");
  } else {
    status.innerText = "Synced";
    status.classList.add("synced");
  }
}
async function syncPending(){
  if(syncInFlight || !navigator.onLine || !getSyncUrl()) {
    updateSyncStatus();
    return;
  }
  const pending = readList(PENDING_KEY);
  if(!pending.length){
    updateSyncStatus();
    return;
  }
  syncInFlight = true;
  try {
    const remaining = [...pending];
    while(remaining.length && navigator.onLine){
      const saved = await syncRecord(remaining[0]);
      if(!saved) break;
      remaining.shift();
      writeList(PENDING_KEY, remaining);
      updateSyncStatus();
    }
    if(!remaining.length) loadRemoteHistory();
  } finally {
    syncInFlight = false;
  }
  updateSyncStatus();
}
function syncRecord(record){
  return new Promise(resolve => {
    const callback = `rossWorkoutLog${Date.now()}${Math.round(Math.random()*1000)}`;
    const script = document.createElement("script");
    let timeout;
    const cleanup = result => {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
      resolve(result);
    };
    timeout = setTimeout(() => cleanup(false), 12000);
    window[callback] = payload => cleanup(!!(payload && payload.ok && payload.saved));
    const separator = getSyncUrl().includes("?") ? "&" : "?";
    script.src = `${getSyncUrl()}${separator}action=log&callback=${callback}&record=${encodeURIComponent(JSON.stringify(record))}`;
    script.onerror = () => cleanup(false);
    document.body.appendChild(script);
  });
}
function loadRemoteHistory(){
  if(!getSyncUrl() || !navigator.onLine) return;
  const callback = `rossWorkoutHistory${Date.now()}`;
  const script = document.createElement("script");
  window[callback] = payload => {
    if(payload && Array.isArray(payload.records)){
      const local = readList(HISTORY_KEY);
      const byId = new Map([...local, ...payload.records].map(record => [record.id || `${record.timestamp}-${record.exercise}`, record]));
      writeList(HISTORY_KEY, Array.from(byId.values()).slice(-500));
      renderCurrentScreen();
    }
    delete window[callback];
    script.remove();
  };
  const separator = getSyncUrl().includes("?") ? "&" : "?";
  script.src = `${getSyncUrl()}${separator}action=history&callback=${callback}`;
  script.onerror = () => {
    delete window[callback];
    script.remove();
  };
  document.body.appendChild(script);
}
function renderCurrentScreen(){
  if(screenMode === "home") renderHome();
  else if(screenMode === "setup") renderSetup("change");
  else if(screenMode === "progress") renderProgress();
  else render();
}
function markDone(){
  if(overviewOpen){
    overviewOpen = false;
    render();
    $("screen").focus({preventScroll:true});
    return;
  }
  saveInputs();
  const items = getItems(getDay());
  const item = items[itemIndex];
  const id = itemId(item,itemIndex);
  const s = getState();
  const willComplete = !s.completed[id];
  if(item.kind === "exercise" && willComplete){
    const setWeights = getSetWeights(s, id, effectiveExercise(item, id, s));
    if(!setWeights.every(isSetComplete)){
      alert("Enter a weight or tap DNC for every set before marking this exercise done.");
      render();
      return;
    }
  }
  s.completed[id] = willComplete;
  setState(s);
  saveLogRecord(makeLogRecord(item, id, !!s.completed[id]));
  if(s.completed[id] && itemIndex < items.length-1){ itemIndex++; }
  render();
  $("screen").focus({preventScroll:true});
}
function nextItem(){
  const items = getItems(getDay());
  overviewOpen = false;
  itemIndex = Math.min(items.length-1, itemIndex+1);
  render();
  $("screen").focus({preventScroll:true});
}
function prevItem(){
  overviewOpen = false;
  itemIndex = Math.max(0, itemIndex-1);
  render();
  $("screen").focus({preventScroll:true});
}
function resetDay(){
  if(confirm("Clear completed weights and checkmarks for this day?")){
    localStorage.removeItem(key());
    itemIndex = 0;
    render();
  }
}
// swipe support
let startX=0;
document.addEventListener("touchstart", e => startX = e.changedTouches[0].screenX, {passive:true});
document.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].screenX - startX;
  if(Math.abs(dx)>60){ dx<0 ? nextItem() : prevItem(); }
}, {passive:true});
init();
