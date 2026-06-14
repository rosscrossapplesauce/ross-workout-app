let data;
let weekIndex = Number(localStorage.getItem("weekIndex") || 0);
let dayIndex = Number(localStorage.getItem("dayIndex") || 0);
let itemIndex = Number(localStorage.getItem("itemIndex") || 0);
let syncInFlight = false;
let overviewOpen = false;
let screenMode = "home";
let activeSetupPath = "guided";
let planMessage = "";
let planMessageScope = "all";
let overviewMode = "list";
let monthMessage = "";
let holdTimer = null;
let planProgress = null;
let planProgressTimer = null;
let completionFlash = "";
let homeDayDragSuppress = false;
let homeDayDragSuppressTarget = null;
let homeDayDragSuppressUntil = 0;
let homeReorderSource = null;
let homeReorderMode = false;

const $ = id => document.getElementById(id);
const stateKeyFor = (wIdx, dIdx) => getPlanSource() === "generated" ? `rossWorkout.v1.generated.w${wIdx}.d${dIdx}` : `rossWorkout.v1.w${wIdx}.d${dIdx}`;
const key = () => stateKeyFor(weekIndex, dayIndex);
const HISTORY_KEY = "rossWorkout.v1.history";
const PENDING_KEY = "rossWorkout.v1.pendingSync";
const SYNC_URL_KEY = "rossWorkout.v1.syncUrl";
const APP_BACKEND_URL = "https://script.google.com/macros/s/AKfycbxa21SqDvaZHign7imzdMgzj6g_s9d211UfdUG8eExgPaklK_iMJA0FgFiui9p0ca4/exec";
const ALTERNATIVES_KEY = "rossWorkout.v1.alternatives";
const PLAN_SETTINGS_KEY = "rossWorkout.v1.planSettings";
const EXERCISE_PREFS_KEY = "rossWorkout.v1.exercisePreferences";
const GENERATED_PLAN_KEY = "rossWorkout.v1.generatedPlan";
const PENDING_PLAN_KEY = "rossWorkout.v1.pendingPlan";
const PLAN_REQUEST_KEY = "rossWorkout.v1.planRequest";
const PLAN_SOURCE_KEY = "rossWorkout.v1.planSource";
const PLAN_ARCHIVE_KEY = "rossWorkout.v1.planArchive";
const USER_STATS_KEY = "rossWorkout.v1.userStats";
const THEME_KEY = "rossWorkout.v1.theme";
const DAY_ORDER_KEY = "rossWorkout.v1.dayOrder";
const THEME_OPTIONS = [
  {id:"teal", label:"Sea glass"},
  {id:"graphite", label:"Soft slate"},
  {id:"dark", label:"Midnight teal"},
  {id:"ember", label:"Black cherry"}
];

function setPlanMessage(message, scope = "all"){
  planMessage = message;
  planMessageScope = scope;
}
function currentTheme(){
  const theme = localStorage.getItem(THEME_KEY) || "teal";
  return THEME_OPTIONS.some(option => option.id === theme) ? theme : "teal";
}
function themeLabel(theme = currentTheme()){
  const option = THEME_OPTIONS.find(item => item.id === theme);
  return option ? option.label : "Deep teal";
}
function applyTheme(theme = currentTheme()){
  document.body.dataset.theme = theme;
}
function setTheme(theme){
  const nextTheme = THEME_OPTIONS.some(option => option.id === theme) ? theme : "teal";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
}
function startPlanProgress(label){
  stopPlanProgress(false);
  planProgress = {
    percent: 4,
    label,
    detail: "Starting the private generator..."
  };
  planProgressTimer = setInterval(tickPlanProgress, 900);
}
function tickPlanProgress(){
  if(!planProgress) return;
  const next = planProgress.percent < 55 ? planProgress.percent + 7 : planProgress.percent < 82 ? planProgress.percent + 3 : planProgress.percent < 94 ? planProgress.percent + 1 : 94;
  planProgress.percent = Math.min(next, 94);
  planProgress.detail = planProgress.percent < 30 ? "Reading your goals and stats..." : planProgress.percent < 65 ? "Building the week-by-week structure..." : planProgress.percent < 90 ? "Checking exercise details and progression..." : "Almost done. Waiting for the final plan...";
  updatePlanProgressUi();
}
function stopPlanProgress(render = true){
  clearInterval(planProgressTimer);
  planProgressTimer = null;
  planProgress = null;
  if(render) updatePlanProgressUi();
}
function updatePlanProgressUi(){
  const percent = document.getElementById("planProgressPercent");
  const bar = document.getElementById("planProgressBar");
  const detail = document.getElementById("planProgressDetail");
  if(!planProgress){
    const card = document.getElementById("planProgressCard");
    if(card) card.remove();
    return;
  }
  if(percent) percent.innerText = `${planProgress.percent}%`;
  if(bar) bar.style.width = `${planProgress.percent}%`;
  if(detail) detail.innerText = planProgress.detail;
}
function planProgressMarkup(){
  if(!planProgress) return "";
  return `
    <div class="planProgressCard" id="planProgressCard" aria-live="polite">
      <div class="planProgressTop">
        <span>${escapeHtml(planProgress.label)}</span>
        <strong id="planProgressPercent">${escapeHtml(planProgress.percent)}%</strong>
      </div>
      <div class="planProgressTrack"><div id="planProgressBar" style="width:${escapeHtml(planProgress.percent)}%"></div></div>
      <div class="planProgressDetail" id="planProgressDetail">${escapeHtml(planProgress.detail)}</div>
    </div>`;
}
function planGenerationSoftTimeoutMs(){
  return Number(window.__ROSS_PLAN_SOFT_TIMEOUT_MS) || 45000;
}
function planGenerationHardTimeoutMs(){
  return Number(window.__ROSS_PLAN_HARD_TIMEOUT_MS) || 330000;
}

async function init(){
  lockViewportHeight();
  applyTheme();
  try {
    const res = await fetch("workouts.json");
    data = await res.json();
  } catch {
    data = null;
  }
  if(!isValidPlan(getActivePlan())){
    renderPlanRecovery();
    return;
  }
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
    if(!e.target.closest || (!e.target.closest("input, textarea, select, main, .scrollPanel, .dayTrail, .exerciseFocusRail, .reorderableWeekRail, .exerciseMapGrid"))) e.preventDefault();
  }, {passive:false});
}
function buildSelectors(){
  const plan = getActivePlan();
  if(!isValidPlan(plan)) return;
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
  const days = orderedWeekDays(plan, weekIndex);
  $("daySelect").innerHTML = days.map((d,i)=>`<option value="${i}">${d.day}</option>`).join("");
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
  return orderedWeekDays(plan, weekIndex)[dayIndex];
}
function allDayOrders(){
  return readObject(DAY_ORDER_KEY, {});
}
function weekDayOrder(plan, wIdx){
  const days = plan.weeks[wIdx] && plan.weeks[wIdx].days || [];
  const stored = allDayOrders()[`${getPlanSource()}.w${wIdx}`];
  const valid = Array.isArray(stored) && stored.length === days.length && stored.every(index => Number.isInteger(index) && index >= 0 && index < days.length);
  return valid ? stored : days.map((_, index) => index);
}
function orderedWeekDays(plan, wIdx){
  const days = plan.weeks[wIdx] && plan.weeks[wIdx].days || [];
  return weekDayOrder(plan, wIdx).map(index => days[index]).filter(Boolean);
}
function swapDayFocuses(wIdx, fromIndex, toIndex){
  const plan = getActivePlan();
  const days = plan.weeks[wIdx] && plan.weeks[wIdx].days || [];
  if(fromIndex === toIndex || !days[fromIndex] || !days[toIndex]) return;
  const orders = allDayOrders();
  const key = `${getPlanSource()}.w${wIdx}`;
  const order = weekDayOrder(plan, wIdx);
  const next = order.slice();
  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
  orders[key] = next;
  writeObject(DAY_ORDER_KEY, orders);
}
function getPlanSource(){
  return hasGeneratedPlan() ? "generated" : "original";
}
function getActivePlan(){
  return hasGeneratedPlan() ? readObject(GENERATED_PLAN_KEY, data) : data;
}
function hasGeneratedPlan(){
  const plan = readObject(GENERATED_PLAN_KEY, null);
  return isValidPlan(plan);
}
function getItems(day, state = getState()){
  const arr = [];
  if(shouldStartWithCardio(day)){
    if(day.row) arr.push({kind:"row", ...day.row});
    if(day.run) arr.push({kind:"run", ...day.run});
  }
  (day.exercises || []).forEach((x,idx)=> arr.push({kind:"exercise", idx, ...x}));
  if(Array.isArray(state.extraExercises)){
    state.extraExercises.forEach((x,idx)=> arr.push({kind:"exercise", idx, extraId:x.id || idx, source:"extra", ...x}));
  }
  if(!shouldStartWithCardio(day)){
    if(day.row) arr.push({kind:"row", ...day.row});
    if(day.run) arr.push({kind:"run", ...day.run});
  }
  if(day.recovery && !arr.length) arr.push({kind:"rest", text:day.recovery});
  return arr;
}
function cardioText(day){
  return `${day && day.title || ""} ${day && day.row && [day.row.type, day.row.duration, day.row.intensity, day.row.pace].filter(Boolean).join(" ") || ""} ${day && day.run && [day.run.type, day.run.distance, day.run.duration, day.run.intensity, day.run.pace].filter(Boolean).join(" ") || ""}`.toLowerCase();
}
function isHardOrTechnicalCardio(day){
  const text = cardioText(day);
  return /interval|hard|tempo|threshold|sprint|race|time trial|test|500|2k|5k|max|vo2|anaerobic/.test(text);
}
function shouldStartWithCardio(day){
  return !!(day && (day.row || day.run) && isHardOrTechnicalCardio(day));
}
function renderPlanRecovery(){
  screenMode = "home";
  overviewOpen = false;
  document.body.dataset.mode = "home";
  document.body.dataset.overview = "false";
  $("weekLabel").innerText = "Workout";
  $("dayTitle").innerHTML = `<span>Plan</span><span>Unavailable</span>`;
  $("progressText").innerText = "Recovery";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "0%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("resetBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "⚙";
  $("overviewBtn").onclick = renderSettings;
  $("screen").innerHTML = `
    <section class="homePanel scrollPanel">
      <div>
        <div class="homeTitle">Workout plan unavailable</div>
        <div class="homeText">The app could not load a usable workout plan. Core progress is still saved locally when a plan is available.</div>
      </div>
      <div class="homeActions">
        <button class="primary continueBtn" onclick="location.reload()">Try again</button>
        <button class="textBtn" onclick="renderSettings()">Settings</button>
      </div>
      <div class="planMessage">Next best action: retry the plan load, or open Settings if you need to adjust your app preferences.</div>
    </section>`;
}
function getState(){
  return JSON.parse(localStorage.getItem(key()) || '{"completed":{},"weights":{},"setWeights":{},"notes":{}}');
}
function setState(s){
  localStorage.setItem(key(), JSON.stringify(s));
}
function readDayState(wIdx, dIdx){
  try {
    return JSON.parse(localStorage.getItem(stateKeyFor(wIdx, dIdx)) || '{"completed":{},"weights":{},"setWeights":{},"notes":{}}');
  } catch {
    return {completed:{}, weights:{}, setWeights:{}, notes:{}};
  }
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
  const name = String(exName || "").trim().toLowerCase();
  return readList(HISTORY_KEY)
    .filter(record => String(record.exercise || "").trim().toLowerCase() === name && record.context !== currentContext && record.completed && record.completedWeight !== "")
    .sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
}
function historySuggestionForExercise(exercise, id){
  const last = getLastHistory(exercise.name, getContextId(id));
  if(!last) return "";
  const lastDisplay = last.setWeights || last.completedWeight;
  const lastWeight = finalWeight(lastDisplay);
  if(!Number.isFinite(lastWeight)) return "";
  return {
    weight: lastWeight,
    display: lastDisplay,
    unit: last.unit || exercise.unit || "lb",
    timestamp: last.timestamp
  };
}
function displayExercise(item, id, state = getState()){
  const exercise = effectiveExercise(item, id, state);
  const suggestion = historySuggestionForExercise(exercise, id);
  if(!suggestion || item.source === "extra") return exercise;
  return {
    ...exercise,
    suggestedWeight: suggestion.weight,
    historySuggested: true,
    historyDisplay: suggestion.display,
    historyTimestamp: suggestion.timestamp
  };
}
function historySummary(item, id, exerciseOverride){
  const state = getState();
  const exercise = exerciseOverride || effectiveExercise(item, id, state);
  const exerciseName = exercise.name;
  const last = getLastHistory(exerciseName, getContextId(id));
  if(!last) return "";
  const lastDisplay = last.setWeights || last.completedWeight;
  const lastWeight = finalWeight(lastDisplay);
  const currentTarget = Number(exercise.suggestedWeight);
  const change = Number.isFinite(lastWeight) && Number.isFinite(currentTarget) ? currentTarget - lastWeight : null;
  const label = exercise.historySuggested ? "Suggested from last completed" : "Last completed";
  const changeText = change === null || exercise.historySuggested ? "" : ` · ${change >= 0 ? "+" : ""}${change} ${exercise.unit}`;
  return `<div class="lastWeek">${escapeHtml(label)}: ${escapeHtml(lastDisplay)} ${escapeHtml(exercise.unit)} · ${formatDate(last.timestamp)}${changeText}</div>`;
}
function render(){
  screenMode = "workout";
  document.body.dataset.mode = "workout";
  closeWorkoutMenu();
  document.body.dataset.overview = overviewOpen ? "true" : "false";
  const plan = getActivePlan();
  const day = getDay();
  const items = getItems(day);
  if(itemIndex >= items.length) itemIndex = Math.max(0, items.length-1);
  $("weekLabel").innerText = `${getPlanSource() === "generated" ? "Custom" : "Week"} ${plan.weeks[weekIndex].week || weekIndex+1}`;
  $("dayTitle").innerHTML = `<span>${escapeHtml(workoutDayHeading(day))}</span><span>${escapeHtml(dayFocus(day))}</span>`;
  $("weekSelect").value = weekIndex;
  $("daySelect").value = dayIndex;
  $("doneBtn").style.display = items.length ? "block" : "none";
  $("doneBtn").onclick = markDone;
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Menu";
  $("overviewBtn").onclick = () => showWorkoutMenu("main");
  $("resetBtn").style.display = "block";
  $("resetBtn").innerText = "Home";
  $("resetBtn").onclick = renderHome;

  if(overviewOpen){
    renderOverview(day, items);
    return;
  }

  const state = getState();
  const completedCount = items.filter((_,i)=>state.completed[itemId(items[i], i)]).length;
  const total = items.length;
  const workoutAdjustment = activeWorkoutAdjustment(state);
  $("progressText").innerText = total ? `${itemIndex+1} of ${total} · ${completedCount} done` : "Rest day";
  $("scoreText").innerText = total ? `${Math.round(completedCount/total*100)}%` : "";
  $("progressBar").style.width = total ? `${completedCount/total*100}%` : "0%";
  const compassButton = workoutCardCompassButton(total, completedCount);

  if(!items.length){
    $("screen").innerHTML = `
      <div class="workoutStack">
        ${workoutCompassDockMarkup(day, items, state, completedCount, total)}
        <div class="card rest"><div><div class="exerciseName">Rest Day</div><div class="hint">${day.recovery || "No workout today."}</div></div></div>
      </div>`;
    attachWorkoutHoldMenu();
    return;
  }

  const item = items[itemIndex];
  const id = itemId(item, itemIndex);
  const done = !!state.completed[id];
  $("doneBtn").innerText = done ? "Undo Done" : "Done ✓";

  if(item.kind === "exercise"){
    const exercise = displayExercise(item, id, state);
    const history = exercise.historySuggested ? "" : historySummary(item, id, exercise);
    const setWeights = getSetWeights(state, id, exercise);
    const notes = state.notes[id] || "";
    const originalName = exercise.name === item.name ? "" : `<div class="altApplied">Original: ${escapeHtml(item.name)}</div>`;
    const fitClass = setWeights.length >= 4 ? "manySets" : "";
    const suggested = suggestedWeightMarkup(item, exercise);
    $("screen").innerHTML = `
      <div class="workoutStack">
      ${workoutCompassDockMarkup(day, items, state, completedCount, total)}
      <section class="card workoutCard ${fitClass} ${done ? "completed":""}">
        ${compassButton}
        ${done ? completedCueMarkup() : ""}
        <div>
          <div class="kicker"><span>Exercise ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${escapeHtml(exercise.name)}</div>
          ${originalName}
          <div class="prescription">${escapeHtml(exercise.sets)} × ${escapeHtml(exercise.reps)}</div>
          ${suggested.line}
          ${workoutAdjustment ? `<div class="lastWeek">Today adjusted: ${escapeHtml(workoutAdjustment.label)}</div>` : ""}
          ${history}
        </div>
        <div>
          <label>Completed weight by set</label>
          <div class="setGrid">
            ${setWeights.map((weight,setIndex)=>setWeightRow(exercise, setIndex, weight)).join("")}
          </div>
          <div class="workoutCardActions">
            ${suggested.button}
            <button class="notesBtn ${notes ? "hasNote" : ""}" onclick="showNotesSheet()">${notes ? "Note saved" : "Notes"}</button>
          </div>
        </div>
      </section>
      </div>`;
    setTimeout(()=>{
      document.querySelectorAll(".setWeightInput").forEach(input => input.oninput = saveInputs);
      attachWorkoutHoldMenu();
    },0);
  } else if(item.kind === "row"){
    $("screen").innerHTML = `
      <div class="workoutStack">
      ${workoutCompassDockMarkup(day, items, state, completedCount, total)}
      <section class="card workoutCard ${done ? "completed":""}">
        ${compassButton}
        ${done ? completedCueMarkup() : ""}
        <div>
          <div class="kicker"><span>Cardio ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${escapeHtml(item.type || "Row")}</div>
          <div class="bigWeight" style="font-size:64px">${escapeHtml(item.duration || "")}</div>
          <div class="prescription">${escapeHtml(item.intensity || "")}</div>
          ${item.pace ? `<div class="smallDetail">${escapeHtml(item.pace)}</div>` : ""}
        </div>
      </section>
      </div>`;
    attachWorkoutHoldMenu();
  } else if(item.kind === "run"){
    $("screen").innerHTML = `
      <div class="workoutStack">
      ${workoutCompassDockMarkup(day, items, state, completedCount, total)}
      <section class="card workoutCard ${done ? "completed":""}">
        ${compassButton}
        ${done ? completedCueMarkup() : ""}
        <div>
          <div class="kicker"><span>Run ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${escapeHtml(item.type || "Run")}</div>
          <div class="bigWeight" style="font-size:76px">${escapeHtml(item.distance || item.duration || "")}</div>
          <div class="prescription">${escapeHtml(item.pace || item.intensity || "")}</div>
        </div>
      </section>
      </div>`;
    attachWorkoutHoldMenu();
  } else {
    $("screen").innerHTML = `
      <div class="workoutStack">
        ${workoutCompassDockMarkup(day, items, state, completedCount, total)}
        <section class="card workoutCard rest ${done ? "completed":""}">
          ${compassButton}
          ${done ? completedCueMarkup() : ""}
          <div><div class="exerciseName">Rest Day</div><div class="hint">${item.text}</div></div>
        </section>
      </div>`;
    attachWorkoutHoldMenu();
  }
  saveNav();
}
function setNavArrow(button, enabled){
  button.style.display = "block";
  button.style.visibility = enabled ? "visible" : "hidden";
  button.disabled = !enabled;
}
function completedCueMarkup(){
  return `<div class="completedCue" aria-label="Completed">Completed</div>`;
}
function hasSuggestedWeight(exercise){
  const weight = exercise && exercise.suggestedWeight;
  if(weight === null || weight === undefined || weight === "") return false;
  return !Number.isNaN(Number(weight));
}
function suggestedWeightMarkup(item, exercise){
  if(!hasSuggestedWeight(exercise)) return {line:"", button:""};
  const label = "Suggested";
  const weight = `${exercise.suggestedWeight} ${exercise.unit || ""}`.trim();
  return {
    line:`<div class="suggestedLine"><span>${escapeHtml(label)}</span><strong>${escapeHtml(weight)}</strong></div>`,
    button:`<button class="suggestedBtn" onclick="useSuggested()">Use suggested for all sets</button>`
  };
}
function workoutCardCompassButton(total, completedCount){
  const current = total ? itemIndex + 1 : "R";
  return `
    <button type="button" class="cardCompassBtn" onclick="openWorkoutList()" aria-label="Open day compass">
      <span class="miniCompass" aria-hidden="true">
        <i class="miniCompassDone" style="--pct:${total ? Math.max(8, completedCount / total * 100) : 100}%"></i>
        <b>${escapeHtml(current)}</b>
      </span>
    </button>`;
}
function carouselItemTitle(item, index, state){
  if(!item) return "";
  if(item.kind === "exercise") return displayExercise(item, itemId(item, index), state).name;
  if(item.kind === "row") return item.type || "Row";
  if(item.kind === "run") return item.type || "Run";
  if(item.kind === "rest") return "Rest";
  return item.type || item.text || "Workout";
}
function carouselPeekMarkup(items, state, index, side){
  const item = items[index];
  if(!item) return `<div class="carouselPeek carouselPeekEmpty ${side}" aria-hidden="true"></div>`;
  const id = itemId(item, index);
  const done = !!state.completed[id];
  const title = carouselItemTitle(item, index, state);
  return `
    <button type="button" class="carouselPeek ${side} ${done ? "peekDone" : ""}" onclick="${side === "left" ? "prevItem()" : "nextItem()"}" aria-label="${side === "left" ? "Previous exercise" : "Next exercise"}: ${escapeHtml(title)}">
      <span>${escapeHtml(index + 1)}</span>
    </button>`;
}
function workoutCarouselMarkup(items, state, cardMarkup){
  return `
    <div class="exerciseCarousel" aria-label="Exercise carousel">
      ${carouselPeekMarkup(items, state, itemIndex - 1, "left")}
      ${cardMarkup}
      ${carouselPeekMarkup(items, state, itemIndex + 1, "right")}
    </div>`;
}
function workoutCompassDockMarkup(day, items, state, completedCount, total){
  completionFlash = "";
  return `
    <section class="compassDock" aria-label="Day compass">
      ${exerciseFocusRailMarkup(items, state)}
    </section>`;
}
function exerciseFocusRailMarkup(items, state){
  if(!items || items.length < 2) return "";
  return `
    <div class="exerciseFocusRail" aria-label="Drag to move around today's exercises">
      ${items.map((item, index) => exerciseFocusPill(item, index, state)).join("")}
    </div>`;
}
function exerciseFocusPill(item, index, state){
  const done = !!state.completed[itemId(item, index)];
  const current = index === itemIndex;
  const title = carouselItemTitle(item, index, state);
  return `
    <button type="button" class="exerciseFocusPill ${current ? "current" : ""} ${done ? "done" : ""}" onclick="jumpToItem(${index})" ${current ? 'aria-current="true"' : ""} aria-label="${escapeHtml(compassItemTitle(item, index, state))}">
      <span aria-hidden="true"></span>
      <strong>${escapeHtml(title)}</strong>
    </button>`;
}
function compassItemTitle(item, index, state){
  return `${index + 1}. ${carouselItemTitle(item, index, state)}`;
}
function workoutOrderCue(day, items, index){
  const text = workoutOrderCueText(day, items, index);
  return text ? `<div class="orderCue">${escapeHtml(text)}</div>` : "";
}
function workoutOrderCueText(day, items, index){
  const item = items[index];
  if(!item || !items.length) return "";
  const hasCardio = items.some(entry => entry.kind === "row" || entry.kind === "run");
  const strengthCount = items.filter(entry => entry.kind === "exercise").length;
  const hardCardio = isHardOrTechnicalCardio(day);
  if((item.kind === "row" || item.kind === "run") && hardCardio && strengthCount) return "Technique first: cardio before lifting fatigue";
  if(item.kind === "exercise" && hardCardio && strengthCount && index > 0) return "After technical cardio: lift with controlled form";
  if((item.kind === "row" || item.kind === "run") && strengthCount) return "Easy cardio after lifting is fine";
  if(item.kind === "exercise" && hasCardio && strengthCount >= 3) return "Lifting first when strength is today's priority";
  if(item.kind === "exercise" && index === 0 && strengthCount > 1) return "Start fresh for the main lift";
  return "";
}
function dayMomentumMarkup(day, items, state, completedCount, total){
  const focus = dayFocus(day);
  const label = total ? `${completedCount} of ${total} complete` : "Recovery day";
  const flash = completionFlash;
  completionFlash = "";
  return `
    <section class="dayMomentum" aria-label="Today's progress">
      <div>
        <div class="momentumKicker">Today</div>
        <div class="momentumFocus">${escapeHtml(focus)}</div>
        ${flash ? `<div class="momentumFlash">${escapeHtml(flash)}</div>` : ""}
      </div>
      <div class="momentumRight">
        <div class="momentumCount">${escapeHtml(label)}</div>
        <div class="momentumDots">
          ${items.length ? items.map((item, index) => {
            const done = !!state.completed[itemId(item, index)];
            const current = index === itemIndex;
            return `<span class="momentumDot ${done ? "done" : ""} ${current ? "current" : ""}" aria-label="${done ? "Done" : current ? "Current" : "Planned"} item ${index + 1}"></span>`;
          }).join("") : `<span class="momentumDot recovery done" aria-label="Recovery"></span>`}
        </div>
      </div>
    </section>`;
}
function homeWeekOverview(plan){
  const today = startOfLocalDay(new Date());
  const fallbackWeek = Math.min(weekIndex, Math.max(0, plan.weeks.length - 1));
  let activeWeek = fallbackWeek;
  plan.weeks.forEach((week, wIdx) => {
    (week.days || []).forEach((_, dIdx) => {
      if(isSameLocalDay(planDate(wIdx, dIdx), today)) activeWeek = wIdx;
    });
  });
  const week = plan.weeks[activeWeek] || plan.weeks[0];
  const orderedDays = orderedWeekDays(plan, activeWeek);
  const days = orderedDays.map((day, dIdx) => {
    const state = readDayState(activeWeek, dIdx);
    const items = getItems(day, state);
    const completed = items.filter((item, index) => state.completed[itemId(item, index)]).length;
    return {
      day,
      weekIndex: activeWeek,
      dayIndex: dIdx,
      items,
      completed,
      today: isSameLocalDay(planDate(activeWeek, dIdx), today),
      current: activeWeek === weekIndex && dIdx === dayIndex
    };
  });
  return {week, weekIndex: activeWeek, days};
}
function homeWeekMarkup(model){
  if(!model || !model.week) return "";
  const doneDays = model.days.filter(entry => entry.items.length && entry.completed >= entry.items.length).length;
  const trainingDays = model.days.filter(entry => entry.items.length).length;
  const todayEntry = model.days.find(entry => entry.today) || model.days.find(entry => entry.current) || model.days[0];
  return `
    <section class="weekRoute ${homeReorderMode ? "moving" : ""}" aria-label="This week's route">
      <div class="weekSnapshotTop">
        <div>
          <div class="summaryTitle">Week ${escapeHtml(model.week.week || model.weekIndex + 1)}</div>
          <div class="weekSnapshotTitle">Your route</div>
          <div class="weekRouteMeta">${doneDays} of ${trainingDays || model.days.length} training days complete</div>
        </div>
      </div>
      ${todayEntry ? homeWeekTodayCard(todayEntry) : ""}
      <div class="weekRail reorderableWeekRail" aria-label="Drag days to swap workout focuses">
        ${model.days.map(entry => homeWeekDayMarkup(entry)).join("")}
      </div>
    </section>`;
}
function homeWeekTodayCard(entry){
  const focus = dayFocus(entry.day);
  const label = planDateLabel(entry.weekIndex, entry.dayIndex) || entry.day.day || "Today";
  return `
    <button type="button" class="weekTodayCard" onclick="jumpHomeToDay(${entry.weekIndex}, ${entry.dayIndex})">
      <span>
        <strong>${escapeHtml(entry.today ? "Today" : "Current focus")}</strong>
        <small>${escapeHtml(label)}</small>
      </span>
      <b>${escapeHtml(focus)}</b>
      <em>${entry.items.length ? `${entry.completed}/${entry.items.length}` : "Recovery"}</em>
    </button>`;
}
function homeTodayMarkup(model){
  if(!model || !model.days || !model.days.length) return "";
  const todayEntry = model.days.find(entry => entry.today) || model.days.find(entry => entry.current) || model.days[0];
  const focus = dayFocus(todayEntry.day);
  const dateLabel = planDateLabel(todayEntry.weekIndex, todayEntry.dayIndex) || todayEntry.day.day || "Today";
  const itemLabel = todayEntry.items.length ? `${todayEntry.completed}/${todayEntry.items.length} complete` : "Recovery";
  return `
    <section class="todaySnapshot" aria-label="Today">
      <div>
        <div class="summaryTitle">Today</div>
        <div class="todayTitle">${escapeHtml(focus)}</div>
        <div class="todayMeta">${escapeHtml(dateLabel)} · ${escapeHtml(itemLabel)}</div>
      </div>
      <button class="primary continueBtn" onclick="openTodayWorkoutOverview()">View today's workout</button>
    </section>`;
}
function homeWeekDayMarkup(entry){
  const focus = dayFocus(entry.day);
  const done = entry.items.length && entry.completed >= entry.items.length;
  const partial = entry.completed > 0 && !done;
  const label = planDateLabel(entry.weekIndex, entry.dayIndex) || entry.day.day || `Day ${entry.dayIndex + 1}`;
  const shortLabel = label.replace(/,\s*/g, " ");
  const status = done ? "Done" : partial ? `${entry.completed}/${entry.items.length}` : entry.today ? "Today" : entry.items.length ? "Upcoming" : "Recovery";
  const selected = homeReorderSource && homeReorderSource.weekIndex === entry.weekIndex && homeReorderSource.dayIndex === entry.dayIndex;
  return `
    <button type="button" class="weekDay ${entry.today ? "today" : ""} ${done ? "done" : ""} ${partial ? "partial" : ""} ${selected ? "selectedForSwap" : ""}" data-week-index="${entry.weekIndex}" data-day-index="${entry.dayIndex}" onclick="selectHomeDay(this, ${entry.weekIndex}, ${entry.dayIndex})" aria-pressed="${selected ? "true" : "false"}">
      <span class="weekDayLabel">${escapeHtml(entry.today ? `Today · ${shortLabel}` : shortLabel)}</span>
      <strong>${escapeHtml(focus)}</strong>
      <span class="weekDayCount">${escapeHtml(status)}</span>
    </button>`;
}
function selectHomeDay(element, nextWeekIndex, nextDayIndex){
  if(homeDayDragSuppress){
    const shouldSuppress = element === homeDayDragSuppressTarget && Date.now() < homeDayDragSuppressUntil;
    homeDayDragSuppress = false;
    homeDayDragSuppressTarget = null;
    homeDayDragSuppressUntil = 0;
    if(shouldSuppress) return;
  }
  if(homeReorderMode && !homeReorderSource){
    homeReorderSource = { weekIndex: nextWeekIndex, dayIndex: nextDayIndex };
    renderHome();
    return;
  }
  if(homeReorderSource){
    const sameDay = homeReorderSource.weekIndex === nextWeekIndex && homeReorderSource.dayIndex === nextDayIndex;
    if(!sameDay){
      swapDayFocuses(homeReorderSource.weekIndex, homeReorderSource.dayIndex, nextDayIndex);
      weekIndex = homeReorderSource.weekIndex;
      dayIndex = nextDayIndex;
      buildDaySelector();
      saveNav();
    }
    homeReorderSource = null;
    homeReorderMode = false;
    renderHome();
    return;
  }
  jumpHomeToDay(nextWeekIndex, nextDayIndex);
}
function jumpHomeToDay(nextWeekIndex, nextDayIndex){
  weekIndex = nextWeekIndex;
  dayIndex = nextDayIndex;
  itemIndex = 0;
  overviewOpen = false;
  overviewMode = "list";
  buildDaySelector();
  saveNav();
  render();
}
function renderHome(){
  screenMode = "home";
  overviewOpen = false;
  document.body.dataset.mode = "home";
  document.body.dataset.overview = "false";
  const pendingPlan = readObject(PENDING_PLAN_KEY, null);
  const pendingRequest = readObject(PLAN_REQUEST_KEY, null);
  const activePlan = getActivePlan();
  const homeWeek = homeWeekOverview(activePlan);
  $("weekLabel").innerText = "Workout";
  $("dayTitle").innerHTML = `<span>Ross Workout</span><span>Coach</span>`;
  $("progressText").innerText = hasGeneratedPlan() ? "Current plan active" : "Starter plan active";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "⚙";
  $("overviewBtn").onclick = renderSettings;
  $("screen").innerHTML = `
    <section class="homePanel scrollPanel">
      ${homeWeekMarkup(homeWeek)}
      ${homeTodayMarkup(homeWeek)}
      <div class="homeActions">
        <button class="textBtn" onclick="renderPlanStart()">Create a new plan</button>
      </div>
      ${planMessage && planMessageScope !== "settings" ? `<div class="planMessage">${escapeHtml(planMessage)}</div>` : ""}
      ${planProgressMarkup()}
      ${pendingRequest && !pendingPlan ? planRequestRecoveryMarkup(pendingRequest) : ""}
      ${pendingPlan ? pendingPlanSummary(pendingPlan) : ""}
    </section>`;
  attachHomeDayReorder();
}
function attachHomeDayReorder(){
  const rail = document.querySelector(".reorderableWeekRail");
  if(!rail) return;
  let dragSource = null;
  let startX = 0;
  let startY = 0;
  let pointerDragging = false;
  let dropTarget = null;
  let dragGhost = null;
  let longPressTimer = null;
  const clearLongPress = () => {
    if(longPressTimer){
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  const selectSwapSource = button => {
    homeReorderMode = true;
    homeReorderSource = {
      weekIndex: Number(button.dataset.weekIndex),
      dayIndex: Number(button.dataset.dayIndex)
    };
    rail.querySelectorAll(".weekDay").forEach(day => day.classList.remove("selectedForSwap"));
    button.classList.add("selectedForSwap");
    homeDayDragSuppress = true;
    homeDayDragSuppressTarget = button;
    homeDayDragSuppressUntil = Date.now() + 500;
  };
  const setDropTarget = target => {
    const nextTarget = target && target.closest && target.closest(".weekDay");
    if(nextTarget === dropTarget) return;
    if(dropTarget) dropTarget.classList.remove("dropTarget");
    dropTarget = nextTarget && nextTarget !== dragSource ? nextTarget : null;
    if(dropTarget) dropTarget.classList.add("dropTarget");
  };
  const moveDragGhost = (x, y) => {
    if(!dragGhost) return;
    dragGhost.style.transform = `translate(${Math.round(x - startX)}px, ${Math.round(y - startY)}px) scale(1.02)`;
  };
  const removeDragGhost = () => {
    if(dragGhost) dragGhost.remove();
    dragGhost = null;
  };
  const createDragGhost = button => {
    removeDragGhost();
    const rect = button.getBoundingClientRect();
    dragGhost = button.cloneNode(true);
    dragGhost.classList.add("dragGhost");
    dragGhost.classList.remove("dragging", "dropTarget");
    dragGhost.removeAttribute("onclick");
    dragGhost.removeAttribute("aria-pressed");
    dragGhost.style.left = `${Math.round(rect.left)}px`;
    dragGhost.style.top = `${Math.round(rect.top)}px`;
    dragGhost.style.width = `${Math.round(rect.width)}px`;
    dragGhost.style.height = `${Math.round(rect.height)}px`;
    document.body.appendChild(dragGhost);
    moveDragGhost(startX, startY);
  };
  const armPointerDrag = (button, pointerId) => {
    selectSwapSource(button);
    pointerDragging = true;
    rail.classList.add("dragging");
    button.classList.add("dragging");
    createDragGhost(button);
    try{
      button.setPointerCapture(pointerId);
    }catch(error){
      // Pointer capture may already be gone if the gesture was cancelled by the browser.
    }
  };
  const swapFromTarget = target => {
    const destination = target && target.closest && target.closest(".weekDay");
    if(!dragSource || !destination || destination === dragSource) return;
    const from = Number(dragSource.dataset.dayIndex);
    const to = Number(destination.dataset.dayIndex);
    const week = Number(dragSource.dataset.weekIndex);
    swapDayFocuses(week, from, to);
    dayIndex = to;
    homeReorderSource = null;
    homeReorderMode = false;
    homeDayDragSuppress = true;
    homeDayDragSuppressTarget = dragSource;
    homeDayDragSuppressUntil = Date.now() + 500;
    renderHome();
  };
  const resetPointerDrag = button => {
    rail.classList.remove("dragging");
    if(dropTarget) dropTarget.classList.remove("dropTarget");
    dropTarget = null;
    if(button) button.classList.remove("dragging");
    removeDragGhost();
    dragSource = null;
    pointerDragging = false;
  };
  rail.querySelectorAll(".weekDay").forEach(button => {
    button.addEventListener("dragstart", event => {
      dragSource = button;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", button.dataset.dayIndex || "");
      button.classList.add("dragging");
    });
    button.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    button.addEventListener("drop", event => {
      event.preventDefault();
      swapFromTarget(button);
    });
    button.addEventListener("dragend", () => {
      button.classList.remove("dragging");
      dragSource = null;
    });
    button.addEventListener("pointerdown", event => {
      if(event.button !== undefined && event.button !== 0) return;
      dragSource = button;
      startX = event.clientX;
      startY = event.clientY;
      pointerDragging = false;
      button.dataset.pointerId = String(event.pointerId);
      clearLongPress();
      longPressTimer = setTimeout(() => {
        armPointerDrag(button, event.pointerId);
      }, 180);
    });
    button.addEventListener("pointermove", event => {
      if(dragSource !== button) return;
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if(!pointerDragging && distance > 12){
        clearLongPress();
        if(Math.abs(event.clientY - startY) > Math.abs(event.clientX - startX)){
          if(button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
          resetPointerDrag(button);
          return;
        }
        armPointerDrag(button, event.pointerId);
      }
      if(pointerDragging){
        event.preventDefault();
        moveDragGhost(event.clientX, event.clientY);
        setDropTarget(document.elementFromPoint(event.clientX, event.clientY));
      }
    });
    button.addEventListener("pointerup", event => {
      clearLongPress();
      if(pointerDragging){
        const target = document.elementFromPoint(event.clientX, event.clientY);
        swapFromTarget(target);
      }
      if(button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      resetPointerDrag(button);
    });
    button.addEventListener("pointercancel", event => {
      clearLongPress();
      if(button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      resetPointerDrag(button);
    });
  });
}
function planRequestRecoveryMarkup(request){
  return `
    <div class="planSummary previewPlan">
      <div class="summaryTitle">Plan Preview</div>
      <div>${escapeHtml(request.label || "A plan preview may still be finishing.")}</div>
      <div class="previewActions">
        <button class="primary" onclick="checkLatestPlanPreview()">Check for preview</button>
        <button onclick="cancelPlanRequest()">Dismiss</button>
      </div>
    </div>`;
}
function continueCurrentPlan(){
  goToTodayInPlan();
  overviewOpen = false;
  overviewMode = "list";
  itemIndex = 0;
  buildDaySelector();
  saveNav();
  render();
}
function openTodayWorkoutOverview(){
  goToTodayInPlan();
  overviewOpen = true;
  overviewMode = "list";
  itemIndex = nextRecommendedItemIndex(getItems(getDay()), getState());
  buildDaySelector();
  saveNav();
  render();
}
function pendingPlanSummary(plan){
  return `
    <div class="planSummary previewPlan">
      <div class="summaryTitle">Plan Preview</div>
      <div>${escapeHtml(plan.name || "Generated plan")}</div>
      <div>${escapeHtml(plan.weeks.length)} weeks · ${escapeHtml(plan.weeks[0].days.length)} days/week</div>
      ${plan.changes ? `<div><strong>What changed:</strong> ${escapeHtml(plan.changes)}</div>` : ""}
      ${plan.summary ? `<div>${escapeHtml(plan.summary)}</div>` : ""}
      ${plan.notes ? `<div>${escapeHtml(plan.notes)}</div>` : ""}
      <div class="previewActions">
        <button class="primary" onclick="activatePendingPlan()">Use this plan</button>
        <button onclick="discardPendingPlan()">Keep current plan</button>
      </div>
    </div>`;
}
function checkLatestPlanPreview(){
  const request = readObject(PLAN_REQUEST_KEY, null);
  if(!request || !request.id){
    setPlanMessage("No unfinished plan preview was found.");
    renderHome();
    return;
  }
  if(!getSyncUrl()){
    setPlanMessage("Plan generation is not available right now.");
    renderHome();
    return;
  }
  if(!navigator.onLine){
    setPlanMessage("You're offline. Check for the preview when your phone is back online.");
    renderHome();
    return;
  }
  setPlanMessage("Checking for your plan preview...");
  renderHome();
  const callback = `rossWorkoutLatestPlan${Date.now()}`;
  const script = document.createElement("script");
  const cleanup = () => {
    delete window[callback];
    script.remove();
  };
  window[callback] = payload => {
    if(payload && payload.ok && payload.ready && isValidPlan(payload.plan)){
      const plan = normalizeGeneratedPlan(payload.plan);
      plan.previewType = "new";
      writeObject(PENDING_PLAN_KEY, plan);
      localStorage.removeItem(PLAN_REQUEST_KEY);
      setPlanMessage("Plan preview ready. Review it before switching.");
    } else {
      setPlanMessage("Your plan preview is not ready yet. Keep this page open while it finishes.");
    }
    cleanup();
    renderHome();
  };
  const separator = getSyncUrl().includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    action:"latestPlan",
    callback,
    requestId: request.id
  });
  script.src = `${getSyncUrl()}${separator}${params.toString()}`;
  script.onerror = () => {
    cleanup();
    setPlanMessage("Could not check your preview. Try again while connected.");
    renderHome();
  };
  document.body.appendChild(script);
}
function cancelPlanRequest(){
  localStorage.removeItem(PLAN_REQUEST_KEY);
  setPlanMessage("Dismissed the unfinished preview.");
  renderHome();
}
function generatedPlanSummary(plan){
  return `
    <div class="summaryTitle">${escapeHtml(plan.name || "Generated plan")}</div>
    <div>${escapeHtml(plan.weeks.length)} weeks · ${escapeHtml(plan.weeks[0].days.length)} days/week</div>
    ${plan.generatedAt ? `<div>Generated ${formatDate(plan.generatedAt)}</div>` : ""}
    ${plan.changes ? `<div><strong>What changed:</strong> ${escapeHtml(plan.changes)}</div>` : ""}
    ${plan.notes ? `<div>${escapeHtml(plan.notes)}</div>` : ""}`;
}
function planSummary(settings){
  return `
    <div class="summaryTitle">Saved setup</div>
    <div>${escapeHtml(settings.mainGoal || (settings.goals || []).join(" + ") || "No goals selected")}</div>
    <div>${escapeHtml(settings.daysPerWeek || "?")} days/week · ${escapeHtml(workoutLengthLabel(settings.workoutLength))} · starts ${escapeHtml(settings.startDate || "?")}</div>
    ${settings.trainingExperience ? `<div>${escapeHtml(settings.trainingExperience)} · ${escapeHtml(settings.trainingPace || "steady pace")}</div>` : ""}
    ${settings.crossTrainingSport ? `<div>Cross-training for ${escapeHtml(settings.crossTrainingSport)}</div>` : ""}`;
}
function workoutLengthLabel(value){
  const match = setupWorkoutLengthOptions().find(option => String(option.value) === String(value));
  return match ? match.label : `${value || "?"} min`;
}
function limitationOptions(){
  return [
    "Sore back",
    "Knee pain",
    "Shoulder pain",
    "Limited equipment",
    "Temporary gym",
    "Avoid running",
    "Avoid overhead pressing",
    "Avoid heavy lower body"
  ];
}
function activeLimitations(settings){
  if(!settings || !settings.limitationsEnabled) return "";
  const tags = Array.isArray(settings.limitationTags) ? settings.limitationTags : [];
  return [...tags, settings.avoidMovements || ""].filter(Boolean).join("; ");
}
function limitationStatus(settings){
  const text = activeLimitations(settings);
  if(!text) return "None active";
  const duration = settings.limitationDuration === "temporary" ? "Temporary" : "Indefinite";
  return `${duration}: ${text}`;
}
function statsStatus(stats){
  const parts = [
    stats.weight ? `${stats.weight} lb` : "",
    stats.height || "",
    stats.age ? `${stats.age} years` : "",
    stats.cardioBaseline || ""
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not set";
}
function renderSettings(){
  screenMode = "settings";
  overviewOpen = false;
  document.body.dataset.mode = "settings";
  document.body.dataset.overview = "false";
  const stats = readObject(USER_STATS_KEY, {});
  const settings = readObject(PLAN_SETTINGS_KEY, {});
  const archive = readList(PLAN_ARCHIVE_KEY);
  $("weekLabel").innerText = "Settings";
  $("dayTitle").innerHTML = `<span>App</span><span>Settings</span>`;
  $("progressText").innerText = "Profile + plans";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  $("screen").innerHTML = `
    <section class="settingsPanel scrollPanel">
      ${planMessage && planMessageScope !== "home" ? `<div class="planMessage">${escapeHtml(planMessage)}</div>` : ""}
      <div class="settingsActions">
        <button onclick="renderStatsSettings()">Current stats</button>
        <button onclick="renderLimitationsSettings()">Limitations</button>
        <button onclick="renderThemeSettings()">Color settings</button>
        <button onclick="renderPlanTune()">Adjust current plan</button>
        <button onclick="renderProgress()">Progress</button>
      </div>
      <div class="planSummary">
        <div class="summaryTitle">Current stats</div>
        <div>${escapeHtml(statsStatus(stats))}</div>
      </div>
      <div class="planSummary">
        <div class="summaryTitle">Limitations</div>
        <div>${escapeHtml(limitationStatus(settings))}</div>
      </div>
      <div class="planSummary">
        <div class="summaryTitle">Color settings</div>
        <div>${escapeHtml(themeLabel())}</div>
      </div>
      <details class="advancedSetup">
        <summary>Inactive plans</summary>
        ${archive.length ? archive.map(planArchiveCard).join("") : `<div class="homeText">Past plans will appear here when you replace the current plan.</div>`}
      </details>
    </section>`;
}
function renderThemeSettings(){
  screenMode = "settings";
  overviewOpen = false;
  document.body.dataset.mode = "settings";
  document.body.dataset.overview = "false";
  const selectedTheme = currentTheme();
  $("weekLabel").innerText = "Settings";
  $("dayTitle").innerHTML = `<span>Color</span><span>Settings</span>`;
  $("progressText").innerText = "Display";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Settings";
  $("overviewBtn").onclick = renderSettings;
  $("screen").innerHTML = `
    <section class="settingsPanel scrollPanel">
      <div class="setupGroup">
        <div class="setupTitle">Color settings</div>
        <div class="themeGrid">
          ${THEME_OPTIONS.map(option => `
            <label class="themeOption themeOption-${escapeHtml(option.id)}">
              <input type="radio" name="appTheme" value="${escapeHtml(option.id)}" ${selectedTheme === option.id ? "checked" : ""} onchange="saveThemeSettings()">
              <span>
                <b>${escapeHtml(option.label)}</b>
                <i aria-hidden="true"></i>
              </span>
            </label>
          `).join("")}
        </div>
      </div>
      <button type="button" onclick="renderSettings()">Back to settings</button>
    </section>`;
}
function saveThemeSettings(){
  const selected = document.querySelector('input[name="appTheme"]:checked');
  setTheme(selected ? selected.value : "teal");
}
function renderStatsSettings(){
  screenMode = "stats";
  overviewOpen = false;
  document.body.dataset.mode = "settings";
  document.body.dataset.overview = "false";
  const stats = readObject(USER_STATS_KEY, {});
  $("weekLabel").innerText = "Settings";
  $("dayTitle").innerHTML = `<span>Current</span><span>Stats</span>`;
  $("progressText").innerText = "Profile";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Settings";
  $("overviewBtn").onclick = renderSettings;
  $("screen").innerHTML = `
    <section class="settingsPanel scrollPanel">
      <div class="setupGroup">
        <div class="setupTitle">Current stats</div>
        <div class="setupGrid">
          <label>Weight<input id="statWeight" type="number" inputmode="decimal" placeholder="lb" value="${escapeHtml(stats.weight || "")}"></label>
          <label>Height<input id="statHeight" placeholder="5'10&quot;" value="${escapeHtml(stats.height || "")}"></label>
          <label>Sex<select id="statSex"><option></option><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label>Age<input id="statAge" type="number" inputmode="numeric" value="${escapeHtml(stats.age || "")}"></label>
          <label>Resting HR<input id="statRestingHr" type="number" inputmode="numeric" value="${escapeHtml(stats.restingHr || "")}"></label>
          <label>Cardio baseline<input id="statCardio" placeholder="2k row, 5k, etc." value="${escapeHtml(stats.cardioBaseline || "")}"></label>
        </div>
        <button class="primary" onclick="saveUserStats()">Save stats</button>
        <button type="button" onclick="renderSettings()">Back to settings</button>
      </div>
    </section>`;
  if(stats.sex) $("statSex").value = stats.sex;
}
function renderLimitationsSettings(){
  screenMode = "limitations";
  overviewOpen = false;
  document.body.dataset.mode = "settings";
  document.body.dataset.overview = "false";
  const settings = readObject(PLAN_SETTINGS_KEY, {});
  const enabled = !!settings.limitationsEnabled;
  const duration = settings.limitationDuration || "temporary";
  const tags = Array.isArray(settings.limitationTags) ? settings.limitationTags : [];
  $("weekLabel").innerText = "Settings";
  $("dayTitle").innerHTML = `<span>Plan</span><span>Limitations</span>`;
  $("progressText").innerText = enabled ? "Active for plan previews" : "Off";
  $("scoreText").innerText = "";
  $("progressBar").style.width = enabled ? "100%" : "0%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Settings";
  $("overviewBtn").onclick = renderSettings;
  $("screen").innerHTML = `
    <section class="settingsPanel scrollPanel">
      <label class="toggleOption">
        <input id="limitationsEnabled" type="checkbox" ${enabled ? "checked" : ""} onchange="updateLimitationsProgress()">
        <span><strong>Use limitations in plans</strong><small>Off is best unless something should change your training.</small></span>
      </label>
      <div id="limitationsOffHint" class="setupHint" ${enabled ? `style="display:none"` : ""}>Leave this off unless a temporary issue, equipment limit, or long-term restriction should affect future plan previews.</div>
      <div id="limitationsDetail" class="limitationsDetail" ${enabled ? "" : `style="display:none"`}>
        <div class="setupGroup">
          <div class="setupTitle">How long?</div>
          <div class="segmented">
            <label><input type="radio" name="limitationDuration" value="temporary" ${duration === "temporary" ? "checked" : ""}><span>Temporary</span></label>
            <label><input type="radio" name="limitationDuration" value="indefinite" ${duration === "indefinite" ? "checked" : ""}><span>Indefinite</span></label>
          </div>
        </div>
        <div class="setupGroup">
          <div class="setupTitle">What should plans account for?</div>
          <div class="checkGrid">${limitationOptions().map(option => checkOption("limitationTag", option, tags.includes(option))).join("")}</div>
        </div>
        <label>Extra detail<textarea id="avoidMovements" placeholder="Movements to avoid, equipment missing, what hurts, or what feels okay.">${escapeHtml(settings.avoidMovements || "")}</textarea></label>
      </div>
      <button class="primary" onclick="saveLimitationsSettings()">Save limitations</button>
      <button type="button" onclick="renderSettings()">Back to settings</button>
    </section>`;
}
function updateLimitationsProgress(){
  const enabled = $("limitationsEnabled") && $("limitationsEnabled").checked;
  $("progressText").innerText = enabled ? "Active for plan previews" : "Off";
  $("progressBar").style.width = enabled ? "100%" : "0%";
  if($("limitationsDetail")) $("limitationsDetail").style.display = enabled ? "flex" : "none";
  if($("limitationsOffHint")) $("limitationsOffHint").style.display = enabled ? "none" : "block";
}
function saveLimitationsSettings(){
  const settings = readObject(PLAN_SETTINGS_KEY, {});
  settings.limitationsEnabled = $("limitationsEnabled").checked;
  const selectedDuration = document.querySelector('input[name="limitationDuration"]:checked');
  settings.limitationDuration = selectedDuration ? selectedDuration.value : "temporary";
  settings.limitationTags = Array.from(document.querySelectorAll('input[name="limitationTag"]:checked')).map(input => input.value);
  settings.avoidMovements = $("avoidMovements") ? $("avoidMovements").value.trim() : (settings.avoidMovements || "");
  settings.planBias = generatePlanBias(settings);
  writeObject(PLAN_SETTINGS_KEY, settings);
  setPlanMessage(settings.limitationsEnabled ? "Limitations saved for future plan previews." : "Limitations turned off.", "settings");
  renderSettings();
}
function saveUserStats(){
  const stats = {
    weight: $("statWeight").value.trim(),
    height: $("statHeight").value.trim(),
    sex: $("statSex").value,
    age: $("statAge").value.trim(),
    restingHr: $("statRestingHr").value.trim(),
    cardioBaseline: $("statCardio").value.trim(),
    updatedAt: new Date().toISOString()
  };
  writeObject(USER_STATS_KEY, stats);
  setPlanMessage("Stats saved.", "settings");
  renderSettings();
}
function planArchiveCard(entry, index){
  return `
    <div class="planSummary">
      <div class="summaryTitle">${escapeHtml(entry.name || "Past plan")}</div>
      <div>${escapeHtml(entry.weeks || "?")} weeks · inactive ${escapeHtml(formatDate(entry.savedAt))}</div>
      ${entry.summary ? `<div>${escapeHtml(entry.summary)}</div>` : ""}
      <button onclick="activateArchivedPlan(${index})">Make active</button>
    </div>`;
}
function activateArchivedPlan(index){
  const archive = readList(PLAN_ARCHIVE_KEY);
  const entry = archive[index];
  if(!entry || !isValidPlan(entry.plan)) return;
  archiveCurrentPlan("Moved to inactive plans");
  const refreshed = readList(PLAN_ARCHIVE_KEY);
  refreshed.splice(index, 1);
  writeList(PLAN_ARCHIVE_KEY, refreshed);
  writeObject(GENERATED_PLAN_KEY, normalizeGeneratedPlan(entry.plan));
  weekIndex = 0;
  dayIndex = 0;
  itemIndex = 0;
  buildSelectors();
  saveNav();
  setPlanMessage("Plan made active.");
  renderHome();
}
function renderScheduleSetup(){
  screenMode = "schedule";
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
  setPlanMessage("Schedule saved.");
  overviewMode = "calendar";
  renderHome();
}
function renderPlanStart(){
  screenMode = "planStart";
  overviewOpen = false;
  document.body.dataset.mode = "setup";
  document.body.dataset.overview = "false";
  $("weekLabel").innerText = "New Plan";
  $("dayTitle").innerHTML = `<span>Start</span><span>Training</span>`;
  $("progressText").innerText = "Pick the path that fits";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "20%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("resetBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  $("screen").innerHTML = `
    <section class="setupPanel scrollPanel">
      <div class="setupHint">Plan setup now follows the scaffold: one clear choice per category, then weights adjust from what you actually log.</div>
      <div class="pathGrid">
        <button type="button" class="pathOption primaryPath" onclick="renderSetup('new','guided')">
          <strong>Build a new plan</strong>
          <span>Choose goal, readiness, schedule, length, and one emphasis. Starting weights come from your first logged workouts.</span>
        </button>
        <button type="button" class="pathOption" onclick="renderPlanTune()">
          <strong>Modify current plan</strong>
          <span>Make the current plan shorter, stronger, more cardio, more recovery, or more targeted.</span>
        </button>
      </div>
    </section>`;
}
function renderPlanTune(){
  screenMode = "planTune";
  overviewOpen = false;
  document.body.dataset.mode = "setup";
  document.body.dataset.overview = "false";
  $("weekLabel").innerText = "Plan";
  $("dayTitle").innerHTML = `<span>Edit</span><span>Current Plan</span>`;
  $("progressText").innerText = "Choose what should change";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("resetBtn").style.display = "block";
  $("resetBtn").innerText = "Settings";
  $("resetBtn").onclick = renderSettings;
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  const options = planTuneOptions();
  $("screen").innerHTML = `
    <section class="setupPanel scrollPanel">
      ${planMessage && planMessageScope === "planTune" ? `<div class="planMessage">${escapeHtml(planMessage)}</div>` : ""}
      <div class="setupHint">This keeps your logged exercise history and stats, then creates a preview before anything becomes active.</div>
      <div class="tuneGrid">
        ${options.map(option => `
          <button type="button" class="tuneOption" onclick="selectPlanTune('${escapeHtml(option.id)}')">
            <strong>${escapeHtml(option.label)}</strong>
            <span>${escapeHtml(option.detail)}</span>
          </button>`).join("")}
      </div>
      <button type="button" onclick="renderScheduleSetup()">Edit dates + rest days</button>
    </section>`;
}
function planTuneOptions(){
  return [
    {id:"shorter", label:"Shorter workouts", detail:"Reduce daily time and keep the highest-value work."},
    {id:"longer", label:"Longer workouts", detail:"Add useful volume without changing the goal."},
    {id:"more_strength", label:"More strength", detail:"Prioritize progressive lifting and major muscle groups."},
    {id:"less_strength", label:"Less strength", detail:"Reduce lifting volume and preserve maintenance work."},
    {id:"more_cardio", label:"More cardio", detail:"Add rowing/running volume and aerobic progression."},
    {id:"less_cardio", label:"Less cardio", detail:"Ease up on conditioning while keeping fitness."},
    {id:"more_arms", label:"More arms + upper", detail:"Bias shoulders, arms, chest, and back."},
    {id:"more_legs", label:"More legs", detail:"Bias lower-body strength without wrecking recovery."},
    {id:"recovery", label:"More recovery", detail:"Add rest, reduce intensity, and protect consistency."},
    {id:"maximum_gains", label:"Maximum gains", detail:"Optimize recoverable strength and cardio progress."}
  ];
}
function selectPlanTune(id){
  const option = planTuneOptions().find(item => item.id === id);
  if(!option) return;
  const settings = ensurePlanSettings(getActivePlan());
  settings.planAdjustment = option.label;
  settings.planAdjustmentDetail = option.detail;
  settings.generatedAt = new Date().toISOString();
  settings.planBias = {
    ...generatePlanBias(settings),
    adjustment: option.label,
    adjustmentDetail: option.detail
  };
  writeObject(PLAN_SETTINGS_KEY, settings);
  localStorage.removeItem(PENDING_PLAN_KEY);
  if(getSyncUrl() && navigator.onLine){
    setPlanMessage(`Creating preview: ${option.label}.`);
    generatePersonalPlan();
  } else if(!navigator.onLine){
    setPlanMessage("Plan edit saved. Create the preview when your phone is back online.", "planTune");
    renderPlanTune();
  } else {
    setPlanMessage("Plan edit saved. Plan generation is not available right now.", "planTune");
    renderPlanTune();
  }
}
function renderSetup(mode, path = "guided"){
  screenMode = "setup";
  activeSetupPath = "guided";
  overviewOpen = false;
  document.body.dataset.mode = "setup";
  document.body.dataset.overview = "false";
  const savedSettings = readObject(PLAN_SETTINGS_KEY, {});
  const current = mode === "change" ? savedSettings : {};
  const sportValue = current.crossTrainingSport || "";
  const sportSelected = selectedCrossTrainingSport(sportValue);
  const startDefault = current.startDate || (mode === "new" ? todayInputDate() : "");
  const goalDefault = setupOptionValue(setupGoalOptions(), current.mainGoal || (current.goals || [])[0], "General Fitness");
  const readinessDefault = setupOptionValue(setupReadinessOptions(), current.trainingExperience, "Currently active");
  const emphasisDefault = setupOptionValue(setupEmphasisOptions(), current.trainingPace, "Balanced scaffold");
  const daysDefault = setupOptionValue(setupDaysOptions(), current.daysPerWeek || (mode === "new" ? "5" : ""), "5");
  const lengthDefault = setupOptionValue(setupWorkoutLengthOptions(), current.workoutLength || (mode === "new" ? "45" : ""), "45");
  const gymDefault = setupOptionValue(setupGymOptions(), current.gymAccess, "Full gym");
  const restDefault = setupOptionValue(setupRestDayOptions(), current.restDays, "");
  $("weekLabel").innerText = mode === "new" ? "New Plan" : "Plan Goals";
  $("dayTitle").innerHTML = `<span>Build</span><span>Training Plan</span>`;
  $("progressText").innerText = "Scaffold choices";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "55%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "block";
  $("doneBtn").innerText = mode === "new" ? "Create preview" : "Update preview";
  $("doneBtn").onclick = () => savePlanSetup(mode);
  $("resetBtn").style.display = "block";
  $("resetBtn").innerText = "Back";
  $("resetBtn").onclick = mode === "new" ? renderPlanStart : renderHome;
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  $("screen").innerHTML = `
    <section class="setupPanel scrollPanel">
      ${planMessage && planMessageScope === "setup" ? `<div class="planMessage">${escapeHtml(planMessage)}</div>` : ""}
      <div class="setupHint">No starting weights here. The first time you do an exercise, log the sets, reps, and weights you actually completed; future workouts suggest from that history.</div>
      <div class="setupGroup">
        <div class="setupTitle">Plan basics</div>
        <div class="setupGrid">
          <label>Main goal<select id="mainGoal">
            ${optionMarkup(setupGoalOptions(), goalDefault)}
          </select></label>
          <label>Start date<input id="startDate" type="date" required value="${escapeHtml(startDefault)}"></label>
          <label>Days/week<select id="daysPerWeek">
            ${optionMarkup(setupDaysOptions(), daysDefault)}
          </select></label>
          <label>Workout length<select id="workoutLength">
            ${optionMarkup(setupWorkoutLengthOptions(), lengthDefault)}
          </select></label>
        </div>
      </div>
      <div class="setupGroup">
        <div class="setupTitle">Fine tune</div>
        <div class="setupGrid">
          <label>Experience<select id="trainingExperience">
            ${optionMarkup(setupReadinessOptions(), readinessDefault)}
          </select></label>
          <label>Emphasis<select id="trainingPace">
            ${optionMarkup(setupEmphasisOptions(), emphasisDefault)}
          </select></label>
          <label>Gym access<select id="gymAccess">
            ${optionMarkup(setupGymOptions(), gymDefault)}
          </select></label>
          <label>Rest days<select id="restDays">
            ${optionMarkup(setupRestDayOptions(), restDefault)}
          </select></label>
          <label class="wideField">Cross-training sport<select id="crossTrainingSport">
            ${optionMarkup(crossTrainingSportOptions(), sportSelected)}
          </select></label>
        </div>
      </div>
    </section>`;
}
function setupGoalOptions(){
  return [
    "General Fitness",
    "Build Muscle",
    "Build Strength",
    "Improve Endurance",
    "Lose Fat / Improve Body Composition",
    "Hybrid Strength + Endurance",
    "Support a Sport"
  ];
}
function setupReadinessOptions(){
  return [
    "Currently active",
    "New to structured training",
    "Returning after time off",
    "Training hard already",
    "Working around pain or injury"
  ];
}
function setupEmphasisOptions(){
  return [
    "Balanced scaffold",
    "More strength emphasis",
    "More endurance/cardio emphasis",
    "More recovery buffer",
    "Sport performance support"
  ];
}
function setupDaysOptions(){
  return [
    {value:"3", label:"3 days/week"},
    {value:"4", label:"4 days/week"},
    {value:"5", label:"5 days/week"},
    {value:"6", label:"6 days/week"}
  ];
}
function setupWorkoutLengthOptions(){
  return [
    {value:"45", label:"30-45 min"},
    {value:"60", label:"45-60 min"},
    {value:"75", label:"60-75 min"},
    {value:"90", label:"75-90 min"}
  ];
}
function setupGymOptions(){
  return ["Full gym", "Limited gym", "Home/basic equipment"];
}
function setupRestDayOptions(){
  return [
    {value:"", label:"No preference"},
    {value:"Sunday", label:"Sunday"},
    {value:"Saturday, Sunday", label:"Weekend"},
    {value:"Wednesday, Sunday", label:"Midweek + Sunday"},
    {value:"After hard days", label:"After hard days"}
  ];
}
function optionMarkup(options, selectedValue){
  return options.map(option => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return `<option value="${escapeHtml(value)}" ${String(value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}
function setupOptionValue(options, value, fallback){
  const values = options.map(option => String(typeof option === "string" ? option : option.value));
  const normalized = normalizeSetupValue(value);
  const exact = values.find(candidate => candidate.toLowerCase() === normalized.toLowerCase());
  if(exact) return exact;
  const mapped = legacySetupValue(normalized);
  const legacy = values.find(candidate => candidate.toLowerCase() === mapped.toLowerCase());
  return legacy || fallback;
}
function normalizeSetupValue(value){
  return String(value || "").trim();
}
function legacySetupValue(value){
  const lower = String(value || "").toLowerCase();
  if(!lower) return "";
  if(lower === "hybrid" || lower.includes("hybrid strength") || lower.includes("strength + cardio")) return "Hybrid Strength + Endurance";
  if(lower.includes("build endurance") || lower.includes("cardio")) return "Improve Endurance";
  if(lower.includes("build muscle") || lower.includes("muscle")) return "Build Muscle";
  if(lower.includes("strength")) return "Build Strength";
  if(lower.includes("weight") || lower.includes("fat")) return "Lose Fat / Improve Body Composition";
  if(lower.includes("general fitness") || lower.includes("maintenance")) return "General Fitness";
  if(lower.includes("return") || lower.includes("time away")) return "Returning after time off";
  if(lower.includes("beginner") || lower.includes("new")) return "New to structured training";
  if(lower.includes("advanced") || lower.includes("ambitious") || lower.includes("hard")) return "Training hard already";
  if(lower.includes("injury") || lower.includes("pain")) return "Working around pain or injury";
  if(lower.includes("conservative") || lower.includes("recovery")) return "More recovery buffer";
  if(lower.includes("moderate") || lower.includes("balanced")) return "Balanced scaffold";
  if(lower === "yes") return "Full gym";
  if(lower === "no") return "Home/basic equipment";
  const numeric = lower.match(/\d+/);
  if(numeric){
    const valueNumber = Number(numeric[0]);
    if(valueNumber <= 45) return "45";
    if(valueNumber <= 60) return "60";
    if(valueNumber <= 75) return "75";
    return "90";
  }
  return value;
}
function crossTrainingSportOptions(){
  return ["None", "Running", "Rowing", "Cycling", "Swimming", "Tennis", "Basketball", "Soccer", "Golf", "Pickleball", "Other sport"];
}
function selectedCrossTrainingSport(value){
  if(!value) return "None";
  const cleanValue = String(value).split(":")[0].trim();
  const match = crossTrainingSportOptions().find(option => option.toLowerCase() === cleanValue.toLowerCase());
  return match || "Other sport";
}
function readCrossTrainingSport(){
  const selected = $("crossTrainingSport") ? $("crossTrainingSport").value : "";
  return selected && selected !== "None" ? selected : "";
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
  const mainGoal = $("mainGoal").value;
  const goals = [mainGoal];
  const crossTrainingSport = readCrossTrainingSport();
  if(crossTrainingSport) goals.push("Cross training");
  const strengthSamples = [];
  const savedSettings = readObject(PLAN_SETTINGS_KEY, {});
  const settings = {
    ...savedSettings,
    mode,
    goals,
    mainGoal,
    trainingExperience: $("trainingExperience").value,
    trainingPace: $("trainingPace").value,
    startDate: $("startDate").value,
    crossTrainingSport,
    gymAccess: $("gymAccess").value,
    workoutLength: $("workoutLength").value,
    daysPerWeek: $("daysPerWeek").value,
    restDays: $("restDays").value,
    strengthSamples,
    generatedAt: new Date().toISOString(),
    planBias: generatePlanBias({
      goals,
      mainGoal,
      trainingExperience:$("trainingExperience").value,
      trainingPace:$("trainingPace").value,
      limitationsEnabled: savedSettings.limitationsEnabled,
      limitationDuration: savedSettings.limitationDuration,
      limitationTags: savedSettings.limitationTags,
      avoidMovements: savedSettings.avoidMovements,
      startDate:$("startDate").value,
      crossTrainingSport,
      strengthSamples
    })
  };
  writeObject(PLAN_SETTINGS_KEY, settings);
  localStorage.removeItem(PENDING_PLAN_KEY);
  if(getSyncUrl() && navigator.onLine){
    setPlanMessage(mode === "new" ? "Creating your plan preview..." : "Updating your plan preview...");
    generatePersonalPlan();
  } else if(!navigator.onLine){
    setPlanMessage("Setup saved. Create the preview when your phone is back online.", "setup");
    renderSetup(mode, activeSetupPath);
  } else {
    setPlanMessage("Setup saved. Plan generation is not available right now.", "setup");
    renderSetup(mode, activeSetupPath);
  }
}
function generatePersonalPlan(){
  const settings = readObject(PLAN_SETTINGS_KEY, null);
  if(!settings){
    setPlanMessage("Save your plan setup first.");
    renderHome();
    return;
  }
  if(!getSyncUrl()){
    setPlanMessage("Plan generation is not available right now.", "setup");
    renderSetup(settings.mode || "new", activeSetupPath);
    return;
  }
  if(!navigator.onLine){
    setPlanMessage("You're offline. Create the plan preview when your phone is back online.");
    renderHome();
    return;
  }
  startPlanProgress("Creating your plan preview");
  setPlanMessage("Creating your plan preview. Keep this page open until the preview is ready.");
  renderHome();
  const requestId = `plan-${Date.now()}`;
  writeObject(PLAN_REQUEST_KEY, {
    id: requestId,
    type: "new",
    label: "Your plan preview may still be finishing.",
    createdAt: new Date().toISOString()
  });
  const callback = `rossWorkoutPlan${Date.now()}`;
  const script = document.createElement("script");
  let softTimeout;
  let hardTimeout;
  let finished = false;
  const cleanup = () => {
    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    delete window[callback];
    script.remove();
  };
  window[callback] = payload => {
    if(finished) return;
    finished = true;
    stopPlanProgress(false);
    if(payload && payload.ok && isValidPlan(payload.plan)){
      const plan = normalizeGeneratedPlan(payload.plan);
      plan.previewType = "new";
      writeObject(PENDING_PLAN_KEY, plan);
      localStorage.removeItem(PLAN_REQUEST_KEY);
      setPlanMessage("Plan preview ready. Review it before switching.");
    } else {
      setPlanMessage(planGenerationErrorMessage(payload && payload.error));
    }
    cleanup();
    renderHome();
  };
  const separator = getSyncUrl().includes("?") ? "&" : "?";
  const payload = {
    settings,
    stats: readObject(USER_STATS_KEY, {}),
    preferences: readObject(EXERCISE_PREFS_KEY, {}),
    history: compactGenerationHistory(),
    currentPlan: settings.planAdjustment ? compactPlanForGeneration(getActivePlan()) : null,
    requestId
  };
  const params = new URLSearchParams({
    action:"generatePlan",
    callback,
    payload: JSON.stringify(payload)
  });
  script.src = `${getSyncUrl()}${separator}${params.toString()}`;
  script.onerror = () => {
    if(finished) return;
    finished = true;
    cleanup();
    stopPlanProgress(false);
    setPlanMessage("Keep this page open while your preview is created. If you left and came back, use Check for preview.");
    renderHome();
  };
  softTimeout = setTimeout(() => {
    if(finished) return;
    stopPlanProgress(false);
    setPlanMessage("The generator is still working. Keep this page open, or use Check for preview if you leave and come back.");
    renderHome();
  }, planGenerationSoftTimeoutMs());
  hardTimeout = setTimeout(() => {
    if(finished) return;
    finished = true;
    cleanup();
    stopPlanProgress(false);
    setPlanMessage("The generator is taking too long. Try again, then use Check for preview if it finishes after you leave this page.");
    renderHome();
  }, planGenerationHardTimeoutMs());
  document.body.appendChild(script);
}
function planGenerationErrorMessage(error){
  if(!error) return "Plan preview could not be created. Try again in a minute.";
  if(/planning checks|did not pass|validation|validator/i.test(error)){
    return "That preview did not meet your plan rules, so it was not shown. Adjust your setup or try again for a safer preview.";
  }
  if(/key|openai|property|backend|script|deploy/i.test(error)){
    return "Plan preview could not be created right now. Try again in a minute.";
  }
  return error;
}
function activatePendingPlan(){
  const plan = readObject(PENDING_PLAN_KEY, null);
  if(!plan || !isValidPlan(plan)){
    setPlanMessage("No plan preview is ready.");
    renderHome();
    return;
  }
  const previewType = plan.previewType || "new";
  if(previewType !== "extension") archiveCurrentPlan("Replaced by new plan");
  writeObject(GENERATED_PLAN_KEY, normalizeGeneratedPlan(plan));
  localStorage.removeItem(PENDING_PLAN_KEY);
  if(previewType !== "extension"){
    weekIndex = 0;
    dayIndex = 0;
    itemIndex = 0;
  }
  buildSelectors();
  saveNav();
  setPlanMessage("Generated plan is active.");
  renderHome();
}
function archiveCurrentPlan(reason){
  const current = getActivePlan();
  if(!isValidPlan(current)) return;
  const archive = readList(PLAN_ARCHIVE_KEY);
  archive.push({
    name: current.name || (hasGeneratedPlan() ? "Generated plan" : "Starter plan"),
    summary: current.summary || "",
    weeks: current.weeks.length,
    plan: current,
    reason,
    savedAt: new Date().toISOString()
  });
  writeList(PLAN_ARCHIVE_KEY, archive.slice(-12));
}
function discardPendingPlan(){
  localStorage.removeItem(PENDING_PLAN_KEY);
  setPlanMessage("Kept your current plan.");
  renderHome();
}
function addAnotherMonth(){
  const activePlan = getActivePlan();
  const settings = ensurePlanSettings(activePlan);
  if(!getSyncUrl()){
    alert("Plan generation is not available right now.");
    return;
  }
  if(!navigator.onLine){
    alert("You're offline. Add another month when your phone is back online.");
    return;
  }
  monthMessage = "Building the next month...";
  startPlanProgress("Building the next month");
  overviewOpen = true;
  render();
  const callback = `rossWorkoutExtend${Date.now()}`;
  const script = document.createElement("script");
  let softTimeout;
  let hardTimeout;
  let finished = false;
  const cleanup = () => {
    clearTimeout(softTimeout);
    clearTimeout(hardTimeout);
    delete window[callback];
    script.remove();
  };
  window[callback] = payload => {
    if(finished) return;
    finished = true;
    stopPlanProgress(false);
    if(payload && payload.ok && isValidPlan(payload.plan)){
      const extension = normalizeGeneratedPlan(payload.plan);
      const combined = appendPlanMonth(activePlan, extension);
      combined.previewType = "extension";
      writeObject(PENDING_PLAN_KEY, combined);
      monthMessage = "";
      setPlanMessage("Next-month preview ready. Review it before switching.");
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
      stats: readObject(USER_STATS_KEY, {}),
      currentPlan: compactPlanForGeneration(activePlan),
      history: compactGenerationHistory()
    })
  });
  script.src = `${getSyncUrl()}${separator}${params.toString()}`;
  script.onerror = () => {
    if(finished) return;
    finished = true;
    cleanup();
    stopPlanProgress(false);
    monthMessage = "Could not reach the plan generator.";
    render();
  };
  softTimeout = setTimeout(() => {
    if(finished) return;
    stopPlanProgress(false);
    monthMessage = "The generator is still working. Keep this page open, or check again in a moment.";
    render();
  }, planGenerationSoftTimeoutMs());
  hardTimeout = setTimeout(() => {
    if(finished) return;
    finished = true;
    cleanup();
    stopPlanProgress(false);
    monthMessage = "Adding another month is taking too long. Try again in a moment.";
    render();
  }, planGenerationHardTimeoutMs());
  document.body.appendChild(script);
}
function ensurePlanSettings(plan){
  const saved = readObject(PLAN_SETTINGS_KEY, null);
  if(saved && saved.mainGoal && saved.startDate) return saved;
  const settings = {
    ...(saved || {}),
    mode: saved && saved.mode ? saved.mode : "auto",
    goals: saved && Array.isArray(saved.goals) ? saved.goals : inferredGoals(plan),
    mainGoal: saved && saved.mainGoal ? saved.mainGoal : (inferredGoals(plan)[0] || "General Fitness"),
    trainingExperience: saved && saved.trainingExperience ? saved.trainingExperience : "Currently active",
    trainingPace: saved && saved.trainingPace ? saved.trainingPace : "Balanced scaffold",
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
  if(text.includes("endurance") || text.includes("row")) goals.push("Improve Endurance");
  if(text.includes("muscle")) goals.push("Build Muscle");
  if(text.includes("strength")) goals.push("Build Strength");
  if(text.includes("loss") || text.includes("fat")) goals.push("Lose Fat / Improve Body Composition");
  return goals.length ? goals : ["Hybrid Strength + Endurance"];
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
  const goalText = `${goals.join(" ")} ${settings.mainGoal || ""} ${settings.crossTrainingSport || ""} ${settings.trainingPace || ""}`.toLowerCase();
  const limitations = activeLimitations(settings);
  return {
    mainGoal: settings.mainGoal || "",
    experience: settings.trainingExperience || "",
    pace: settings.trainingPace || "",
    avoidMovements: limitations,
    limitationDuration: limitations ? (settings.limitationDuration || "temporary") : "",
    startDate: settings.startDate || "",
    conditioning: /endurance|cardio|conditioning|fat|weight|hybrid|sport|row|run/.test(goalText) ? "rowing-forward aerobic base with one hard interval day" : "moderate conditioning",
    strength: /muscle|strength|hybrid|sport/.test(goalText) ? "progressive strength/hypertrophy with conservative loading" : "maintenance-friendly strength progression",
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
  $("dayTitle").innerHTML = `<span>Fitness</span><span>Score</span>`;
  $("progressText").innerText = "Completed + planned";
  $("scoreText").innerText = "";
  $("progressBar").style.width = "100%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "none";
  $("homeBtn").style.display = "none";
  $("overviewBtn").innerText = "Home";
  $("overviewBtn").onclick = renderHome;
  const model = fitnessModel();
  $("screen").innerHTML = `
    <section class="progressPanel scrollPanel">
      <div class="scoreCard">
        <div class="scoreNumber">${model.score}</div>
        <div>
          <div class="summaryTitle">Overall fitness score</div>
          <div class="homeText">Strength ${model.strengthScore}/50 · Cardio ${model.cardioScore}/50</div>
        </div>
      </div>
      <div class="chartCard">
        <div class="chartTitle">Trajectory</div>
        ${fitnessChartSvg(model)}
        <div class="legend"><span class="actualLine"></span>Completed <span class="planLine"></span>Current plan <span class="potentialLine"></span>Max training potential</div>
      </div>
      <div class="metricGrid">
        <div class="metricCard"><span>${model.currentGain}%</span><strong>Projected monthly gain</strong></div>
        <div class="metricCard"><span>${model.maxGain}%</span><strong>Max training potential</strong></div>
        <div class="metricCard"><span>${model.cardioMinutes}</span><strong>Planned cardio min/wk</strong></div>
        <div class="metricCard"><span>${model.strengthDays}</span><strong>Strength days/wk</strong></div>
      </div>
      <div class="planMessage">Score uses logged set weights, completed cardio, future planned workouts, and your saved stats. Max potential excludes diet and assumes recoverable training volume.</div>
      <button class="primary" onclick="selectPlanTune('maximum_gains')">Edit plan for maximum gains</button>
    </section>`;
}
function fitnessModel(){
  const history = readList(HISTORY_KEY).filter(record => record.completed);
  const stats = readObject(USER_STATS_KEY, {});
  const plan = getActivePlan();
  const planStats = weeklyPlanStats(plan);
  const strengthTrend = strengthTrendScore(history);
  const completion = completionScore(history);
  const cardioLogged = history.filter(record => record.itemType === "row" || record.itemType === "run").length;
  const ageFactor = stats.age ? Math.max(.82, 1 - Math.max(0, Number(stats.age) - 35) * .004) : 1;
  const strengthDose = Math.min(1, (planStats.strengthDays / 3) * .55 + (planStats.strengthSets / 45) * .45);
  const cardioDose = Math.min(1, planStats.cardioMinutes / 300 + planStats.intervalDays * .08);
  const strengthScore = Math.round(50 * Math.min(1, strengthDose * .62 + strengthTrend * .25 + completion * .13) * ageFactor);
  const cardioScore = Math.round(50 * Math.min(1, cardioDose * .68 + Math.min(1, cardioLogged / 12) * .17 + completion * .15) * ageFactor);
  const currentGain = Math.round((planStats.monthlyStrengthGain + planStats.monthlyCardioGain) / 2);
  const maxGain = Math.round((MAX_STRENGTH_GAIN + MAX_CARDIO_GAIN) / 2);
  return {
    score: Math.max(0, Math.min(100, strengthScore + cardioScore)),
    strengthScore,
    cardioScore,
    currentGain,
    maxGain,
    cardioMinutes: planStats.cardioMinutes,
    strengthDays: planStats.strengthDays,
    points: scorePoints(strengthScore + cardioScore, currentGain, maxGain)
  };
}
const MAX_STRENGTH_GAIN = 12;
const MAX_CARDIO_GAIN = 8;
function weeklyPlanStats(plan){
  const days = (plan.weeks || []).flatMap(week => week.days || []);
  const weeks = Math.max(1, plan.weeks ? plan.weeks.length : 1);
  const strengthDays = days.filter(day => day.exercises && day.exercises.length).length / weeks;
  const strengthSets = days.reduce((sum, day) => sum + (day.exercises || []).reduce((inner, ex) => inner + (Number(ex.sets) || 0), 0), 0) / weeks;
  const cardioMinutes = Math.round(days.reduce((sum, day) => sum + cardioMinutesForDay(day), 0) / weeks);
  const intervalDays = days.filter(day => `${day.title || ""} ${day.row && day.row.type || ""}`.toLowerCase().includes("interval")).length / weeks;
  return {
    strengthDays: Math.round(strengthDays * 10) / 10,
    strengthSets: Math.round(strengthSets),
    cardioMinutes,
    intervalDays,
    monthlyStrengthGain: Math.round(MAX_STRENGTH_GAIN * Math.min(1, (strengthDays / 3) * .6 + (strengthSets / 45) * .4)),
    monthlyCardioGain: Math.round(MAX_CARDIO_GAIN * Math.min(1, cardioMinutes / 300 + intervalDays * .08))
  };
}
function cardioMinutesForDay(day){
  let minutes = 0;
  const rowMatch = day.row && day.row.duration && String(day.row.duration).match(/\d+/);
  if(rowMatch) minutes += Number(rowMatch[0]);
  const runMatch = day.run && (day.run.duration || day.run.distance) && String(day.run.duration || day.run.distance).match(/\d+/);
  if(runMatch) minutes += day.run && day.run.duration ? Number(runMatch[0]) : Number(runMatch[0]) * 10;
  return minutes;
}
function strengthTrendScore(history){
  const byExercise = {};
  history.filter(record => record.exercise && record.setWeights).forEach(record => {
    const weight = finalWeight(record.setWeights);
    if(!Number.isFinite(weight)) return;
    if(!byExercise[record.exercise]) byExercise[record.exercise] = [];
    byExercise[record.exercise].push({date:record.timestamp, weight});
  });
  const trends = Object.values(byExercise).map(points => {
    const sorted = points.sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(-6);
    if(sorted.length < 2 || !sorted[0].weight) return 0;
    return Math.max(0, (sorted[sorted.length - 1].weight - sorted[0].weight) / sorted[0].weight);
  });
  if(!trends.length) return 0;
  return Math.min(1, trends.reduce((sum, value) => sum + value, 0) / trends.length / .18);
}
function completionScore(history){
  if(!history.length) return 0;
  return Math.min(1, history.slice(-24).filter(record => record.completed).length / 24);
}
function scorePoints(score, currentGain, maxGain){
  return {
    actual:[Math.max(0, score - 6), score],
    plan:[score, Math.min(100, score + currentGain), Math.min(100, score + currentGain * 2)],
    potential:[score, Math.min(100, score + maxGain), Math.min(100, score + maxGain * 2)]
  };
}
function fitnessChartSvg(model){
  const width = 320, height = 140, pad = 18;
  const y = value => height - pad - (value / 100) * (height - pad * 2);
  const line = (values, startIndex = 0) => values.map((value, index)=>`${pad + (startIndex + index) * (width - pad * 2) / 3},${y(value)}`).join(" ");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    <polyline class="actual" points="${line(model.points.actual)}"></polyline>
    <polyline class="plan" points="${line(model.points.plan, 1)}"></polyline>
    <polyline class="potential" points="${line(model.points.potential, 1)}"></polyline>
  </svg>`;
}
function renderOverview(day, items){
  const state = getState();
  const completedCount = items.filter((item,i)=>state.completed[itemId(item, i)]).length;
  const recommendedIndex = nextRecommendedItemIndex(items, state);
  $("progressText").innerText = items.length ? `${completedCount} of ${items.length} done` : "Rest day";
  $("scoreText").innerText = items.length ? `${Math.round(completedCount/items.length*100)}%` : "";
  $("progressBar").style.width = items.length ? `${completedCount/items.length*100}%` : "0%";
  $("prevBtn").style.display = "none";
  $("nextBtn").style.display = "none";
  $("doneBtn").style.display = "block";
  $("doneBtn").innerText = selectedWorkoutButtonLabel();
  $("overviewBtn").innerText = "Workout";
  $("overviewBtn").onclick = showOverview;

  if(overviewMode === "calendar"){
    renderCalendarOverview();
    return;
  }

  if(!items.length){
    $("screen").innerHTML = `
      <section class="overviewCard rest">
        <div class="exerciseName">Rest Day</div>
        <div class="hint">${escapeHtml(day.recovery || "No workout today.")}</div>
        <div class="overviewActions">
          <button type="button" onclick="toggleOverviewMode()">Calendar view</button>
        </div>
        ${monthMessage ? `<div class="planMessage">${escapeHtml(monthMessage)}</div>` : ""}
        ${planProgressMarkup()}
      </section>`;
    saveNav();
    return;
  }

  $("screen").innerHTML = `
    <section class="overviewCard compassMap">
      <div class="overviewHeader">
        <div>
          <div class="kicker">Day Compass</div>
          <div class="overviewTitle">Choose next</div>
          <div class="overviewSubtitle">Recommendation: ${escapeHtml(recommendedWorkoutText(day, items, recommendedIndex, state))}</div>
        </div>
        <div class="overviewTools">
          <button type="button" class="closeOverviewBtn" onclick="showOverview()">Close</button>
        </div>
      </div>
      ${monthMessage ? `<div class="planMessage">${escapeHtml(monthMessage)}</div>` : ""}
      ${planProgressMarkup()}
      ${workoutCompassOrbitMarkup(day, items, state, recommendedIndex)}
    </section>`;
  saveNav();
}
function nextRecommendedItemIndex(items, state){
  const openIndex = items.findIndex((item, index) => !state.completed[itemId(item, index)]);
  return openIndex >= 0 ? openIndex : Math.max(0, items.length - 1);
}
function recommendedWorkoutText(day, items, recommendedIndex, state){
  const item = items[recommendedIndex];
  if(!item) return dayFocus(day);
  const title = carouselItemTitle(item, recommendedIndex, state);
  const cue = workoutOrderCueText(day, items, recommendedIndex);
  if(cue.includes("Technique first")) return `${title} before lifting fatigue`;
  if(cue.includes("After technical cardio")) return `${title} after technical cardio`;
  if(cue.includes("Lifting first")) return `${title} before easy cardio`;
  return `${title} next`;
}
function workoutCompassOrbitMarkup(day, items, state, recommendedIndex){
  const total = items.length || 1;
  return `
    <div class="compassOrbit" aria-label="Workout visual map" onclick="handleOrbitTap(event)">
      <div class="orbitTrack" aria-hidden="true"></div>
      ${items.map((item, index) => orbitItemMarkup(item, index, state, total, recommendedIndex)).join("")}
      <button type="button" class="orbitCenter" onclick="jumpToItem(${itemIndex})">
        <span>${itemIndex + 1}</span>
        <strong>${escapeHtml(carouselItemTitle(items[itemIndex], itemIndex, state))}</strong>
      </button>
    </div>`;
}
function orbitItemMarkup(item, index, state, total, recommendedIndex){
  const angle = -90 + (360 / total) * index;
  const radians = angle * Math.PI / 180;
  const x = 50 + Math.cos(radians) * 42;
  const y = 50 + Math.sin(radians) * 42;
  const done = !!state.completed[itemId(item, index)];
  const current = index === itemIndex;
  const recommended = index === recommendedIndex;
  const title = carouselItemTitle(item, index, state);
  return `
    <button type="button" class="orbitItem ${done ? "done" : ""} ${current ? "current" : ""} ${recommended ? "recommended" : ""}" style="--x:${x}%;--y:${y}%" onclick="jumpToItem(${index})" aria-label="${escapeHtml(compassItemTitle(item, index, state))}">
      <span>${done ? "✓" : index + 1}</span>
      <strong>${escapeHtml(shortOrbitTitle(title))}</strong>
    </button>`;
}
function handleOrbitTap(event){
  if(event.target.closest(".orbitItem,.orbitCenter")) return;
  const orbit = event.currentTarget;
  const items = Array.from(orbit.querySelectorAll(".orbitItem"));
  const nearest = items.map(button => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + Math.min(rect.width, rect.height) / 2;
    return {button, distance: Math.hypot(event.clientX - x, event.clientY - y)};
  }).sort((a, b) => a.distance - b.distance)[0];
  if(nearest && nearest.distance < 86) nearest.button.click();
}
function shortOrbitTitle(title){
  return String(title || "Move").replace(/\b(machine|press|dumbbell|cable)\b/ig, "").trim().split(/\s+/).slice(0, 2).join(" ") || title;
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
      </div>
      <div class="overviewActions">
        <button type="button" onclick="toggleOverviewMode()">${escapeHtml(selectedWorkoutButtonLabel())}</button>
      </div>
      ${monthMessage ? `<div class="planMessage">${escapeHtml(monthMessage)}</div>` : ""}
      ${planProgressMarkup()}
      <div class="calendarGrid scrollPanel">
        ${plan.weeks.map((week, wIdx) => `
          <div class="calendarWeek">
            <div class="calendarWeekTitle">Week ${escapeHtml(week.week || wIdx + 1)}</div>
            ${week.days.map((day, dIdx) => calendarDay(day, wIdx, dIdx, state)).join("")}
          </div>`).join("")}
      </div>
    </section>`;
}
function calendarDay(day, weekIdx, dayIdx, state){
  const focus = dayFocus(day);
  const current = weekIdx === weekIndex && dayIdx === dayIndex;
  const today = isPlanToday(weekIdx, dayIdx);
  const dateLabel = planDateLabel(weekIdx, dayIdx);
  const label = dateLabel ? `${today ? "Today · " : ""}${dateLabel}` : (day.day || `Day ${dayIdx + 1}`);
  return `
    <button class="calendarDay ${today ? "calendarToday" : ""} ${current ? "calendarCurrent" : ""}" onclick="jumpToDay(${weekIdx}, ${dayIdx})">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(focus)}</strong>
    </button>`;
}
function workoutDayHeading(day){
  return planDateLabel(weekIndex, dayIndex) || day.day || "Workout";
}
function planDate(weekIdx, dayIdx){
  const start = planStartDate();
  if(!start) return null;
  const date = new Date(start);
  date.setDate(date.getDate() + weekIdx * 7 + dayIdx);
  return date;
}
function planDateLabel(weekIdx, dayIdx){
  const date = planDate(weekIdx, dayIdx);
  if(!date) return "";
  return date.toLocaleDateString(undefined, {weekday:"short", month:"short", day:"numeric"});
}
function planStartDate(){
  const settings = readObject(PLAN_SETTINGS_KEY, null);
  const savedStart = parseLocalDate(settings && settings.startDate);
  if(savedStart) return savedStart;
  const today = startOfLocalDay(new Date());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return monday;
}
function parseLocalDate(value){
  if(!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : startOfLocalDay(date);
}
function startOfLocalDay(date){
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function isSameLocalDay(a, b){
  return !!(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
}
function isPlanToday(weekIdx, dayIdx){
  return isSameLocalDay(planDate(weekIdx, dayIdx), startOfLocalDay(new Date()));
}
function goToTodayInPlan(){
  const plan = getActivePlan();
  const start = planStartDate();
  if(!start || !plan.weeks.length) return;
  const today = startOfLocalDay(new Date());
  const offset = Math.floor((today - start) / 86400000);
  const lastWeekIndex = plan.weeks.length - 1;
  const targetWeek = Math.max(0, Math.min(lastWeekIndex, Math.floor(offset / 7)));
  const targetDay = Math.max(0, offset - targetWeek * 7);
  weekIndex = targetWeek;
  dayIndex = Math.min(targetDay, plan.weeks[weekIndex].days.length - 1);
}
function selectedWorkoutButtonLabel(){
  const day = getDay();
  const dateLabel = planDateLabel(weekIndex, dayIndex);
  return dateLabel ? `View ${dateLabel} workout` : `View ${day.day || "selected"} workout`;
}
function dayFocus(day){
  if(!day) return "Workout";
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
function overviewRow(item, index, done, state, current = false){
  const id = itemId(item, index);
  const exercise = item.kind === "exercise" ? displayExercise(item, id, state) : item;
  const title = item.kind === "exercise" ? exercise.name : (item.type || "Rest");
  const setWeights = item.kind === "exercise" ? compactSetWeights(getSetWeights(state, id, exercise)) : [];
  const detail = item.kind === "exercise"
    ? `${exercise.sets} × ${exercise.reps} · ${item.source === "extra" ? "last" : exercise.historySuggested ? "last time" : "suggested"} ${exercise.suggestedWeight} ${exercise.unit}${setWeights.length ? ` · sets ${setWeights.join(" / ")} ${exercise.unit}` : ""}`
    : item.kind === "row"
      ? `${item.duration} · ${item.intensity}${item.pace ? ` · ${item.pace}` : ""}`
      : item.kind === "run"
        ? `${item.distance} · ${item.pace}`
        : item.text;
  return `
    <button class="overviewItem mapItem ${done ? "overviewDone" : ""} ${current ? "overviewCurrent" : ""}" onclick="jumpToItem(${index})" ${current ? 'aria-current="true"' : ""}>
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
function attachWorkoutHoldMenu(){
  const screen = $("screen");
  if(!screen) return;
  attachExerciseFocusRail();
  screen.onpointerdown = event => {
    if(screenMode !== "workout" || overviewOpen || event.target.closest("button,input,textarea,select,summary,details,.exerciseFocusRail")) return;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => showWorkoutMenu("quick"), 650);
  };
  screen.onpointerup = clearWorkoutHold;
  screen.onpointercancel = clearWorkoutHold;
  screen.onpointerleave = clearWorkoutHold;
  screen.onpointermove = event => {
    if(Math.abs(event.movementX || 0) > 6 || Math.abs(event.movementY || 0) > 6) clearWorkoutHold();
  };
  screen.oncontextmenu = event => {
    if(screenMode !== "workout" || overviewOpen) return;
    event.preventDefault();
    showWorkoutMenu("quick");
  };
}
function attachExerciseFocusRail(){
  const rail = document.querySelector(".exerciseFocusRail");
  if(!rail) return;
  const current = rail.querySelector(".exerciseFocusPill.current");
  if(current) current.scrollIntoView({inline:"center", block:"nearest"});
  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  rail.onpointerdown = event => {
    if(event.target.closest("button")) return;
    dragging = true;
    startX = event.clientX;
    startScroll = rail.scrollLeft;
    rail.classList.add("dragging");
    rail.setPointerCapture(event.pointerId);
  };
  rail.onpointermove = event => {
    if(!dragging) return;
    rail.scrollLeft = startScroll - (event.clientX - startX);
  };
  rail.onpointerup = event => {
    dragging = false;
    rail.classList.remove("dragging");
    if(rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
  };
  rail.onpointercancel = () => {
    dragging = false;
    rail.classList.remove("dragging");
  };
}
function clearWorkoutHold(){
  clearTimeout(holdTimer);
  holdTimer = null;
}
function attachCarouselNavigation(){
  const carousel = document.querySelector(".exerciseCarousel");
  if(!carousel) return;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  carousel.onpointerdown = event => {
    if(event.target.closest("button,input,textarea,select,summary,details")) return;
    startX = event.clientX;
    startY = event.clientY;
    tracking = true;
  };
  carousel.onpointerup = event => {
    if(!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if(Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    clearWorkoutHold();
    if(dx < 0) nextItem();
    else prevItem();
  };
  carousel.onpointercancel = () => { tracking = false; };
}
function showWorkoutMenu(type = "main"){
  clearWorkoutHold();
  if(screenMode !== "workout") return;
  closeWorkoutMenu();
  const items = getItems(getDay());
  const item = items[itemIndex];
  const menuButtons = type === "more" ? `
      <button type="button" onclick="addExerciseFromMenu()">Add exercise</button>
      ${item && item.kind === "exercise" ? `<button type="button" onclick="showAlternativesFromMenu()">Swap / alternatives</button>` : ""}
      ${item && item.kind === "exercise" ? `<button type="button" onclick="skipExerciseFromMenu()">Skip exercise (DNC)</button>` : ""}
      <button type="button" onclick="showNotesSheet()">Notes</button>
      <button type="button" class="dangerAction" onclick="resetDayFromMenu()">Reset day</button>
      <button type="button" onclick="showWorkoutMenu('main')">Back</button>
    ` : `
      <button type="button" onclick="openWorkoutList()">Choose exercise</button>
      <button type="button" onclick="openWorkoutCalendar()">Change day</button>
      <button type="button" onclick="showWorkoutAdjustMenu()">Adjust today</button>
      <button type="button" onclick="showWorkoutMenu('more')">More actions</button>
      <button type="button" onclick="openSettingsFromMenu()">Settings</button>
      <button type="button" onclick="goHomeFromMenu()">Home</button>
      <button type="button" onclick="closeWorkoutMenu()">Cancel</button>
    `;
  const sheet = document.createElement("div");
  sheet.id = "workoutMenu";
  sheet.className = "actionSheet";
  sheet.innerHTML = `
    <button class="sheetBackdrop" type="button" aria-label="Close menu" onclick="closeWorkoutMenu()"></button>
    <div class="sheetPanel" role="dialog" aria-modal="true" aria-label="Workout menu">
      <div class="sheetHandle"></div>
      <div class="sheetTitle">${type === "more" ? "More actions" : "Workout menu"}</div>
      ${menuButtons}
    </div>`;
  document.body.appendChild(sheet);
}
function closeWorkoutMenu(){
  const existing = document.getElementById("workoutMenu");
  if(existing) existing.remove();
}
function showWorkoutAdjustMenu(){
  closeWorkoutMenu();
  const current = activeWorkoutAdjustment(getState());
  const sheet = document.createElement("div");
  sheet.id = "workoutMenu";
  sheet.className = "actionSheet";
  sheet.innerHTML = `
    <button class="sheetBackdrop" type="button" aria-label="Close menu" onclick="closeWorkoutMenu()"></button>
    <div class="sheetPanel" role="dialog" aria-modal="true" aria-label="Adjust today">
      <div class="sheetHandle"></div>
      <button type="button" onclick="applyWorkoutAdjustment('short_time')">Short on time</button>
      <button type="button" onclick="applyWorkoutAdjustment('sore_today')">Sore today</button>
      <button type="button" onclick="applyWorkoutAdjustment('equipment_crowded')">Equipment crowded</button>
      ${current ? `<button type="button" onclick="clearWorkoutAdjustment()">Clear today's adjustment</button>` : ""}
      <button type="button" onclick="closeWorkoutMenu()">Cancel</button>
    </div>`;
  document.body.appendChild(sheet);
}
function showNotesSheet(){
  saveInputs();
  closeWorkoutMenu();
  const items = getItems(getDay());
  const item = items[itemIndex];
  if(!item) return;
  const id = itemId(item, itemIndex);
  const state = getState();
  const note = state.notes && state.notes[id] || "";
  const sheet = document.createElement("div");
  sheet.id = "workoutMenu";
  sheet.className = "actionSheet";
  sheet.innerHTML = `
    <button class="sheetBackdrop" type="button" aria-label="Close notes" onclick="closeWorkoutMenu(); render()"></button>
    <div class="sheetPanel notesSheet" role="dialog" aria-modal="true" aria-label="Exercise notes">
      <div class="sheetHandle"></div>
      <div class="sheetTitle">Notes</div>
      <textarea id="noteInput" placeholder="Optional">${escapeHtml(note)}</textarea>
      <button type="button" class="primary" onclick="saveNotesFromSheet()">Save note</button>
      <button type="button" onclick="closeWorkoutMenu(); render()">Cancel</button>
    </div>`;
  document.body.appendChild(sheet);
  const input = $("noteInput");
  if(input){
    input.focus({preventScroll:true});
    input.oninput = saveInputs;
  }
}
function saveNotesFromSheet(){
  saveInputs();
  closeWorkoutMenu();
  render();
}
function applyWorkoutAdjustment(type){
  const adjustment = workoutAdjustmentFor(type);
  if(!adjustment) return;
  const state = getState();
  state.workoutAdjustment = {...adjustment, createdAt: new Date().toISOString()};
  setState(state);
  closeWorkoutMenu();
  render();
  if(type === "equipment_crowded"){
    const item = getItems(getDay())[itemIndex];
    if(item && item.kind === "exercise") loadAlternatives();
  }
}
function clearWorkoutAdjustment(){
  const state = getState();
  delete state.workoutAdjustment;
  setState(state);
  closeWorkoutMenu();
  render();
}
function openWorkoutList(){
  closeWorkoutMenu();
  overviewMode = "list";
  overviewOpen = true;
  render();
}
function openWorkoutCalendar(){
  closeWorkoutMenu();
  overviewMode = "calendar";
  overviewOpen = true;
  render();
}
function openSettingsFromMenu(){
  closeWorkoutMenu();
  renderSettings();
}
function goHomeFromMenu(){
  closeWorkoutMenu();
  renderHome();
}
function resetDayFromMenu(){
  closeWorkoutMenu();
  resetDay();
}
function skipExerciseFromMenu(){
  closeWorkoutMenu();
  skipCurrentExercise();
}
function showAlternativesFromMenu(){
  closeWorkoutMenu();
  loadAlternatives();
}
function addExerciseFromMenu(){
  closeWorkoutMenu();
  const name = prompt("Exercise name:");
  const cleanName = String(name || "").trim();
  if(!cleanName) return;
  const setsInput = prompt("Sets:", "3");
  const repsInput = prompt("Reps:", "8-12");
  const sets = Math.max(1, Math.min(8, Number(setsInput) || 3));
  const reps = String(repsInput || "8-12").trim() || "8-12";
  const last = getLastHistory(cleanName, "");
  const lastWeight = last ? finalWeight(last.setWeights || last.completedWeight) : null;
  const suggestedWeight = Number.isFinite(lastWeight) ? lastWeight : 0;
  const state = getState();
  if(!Array.isArray(state.extraExercises)) state.extraExercises = [];
  const id = `extra-${Date.now()}`;
  state.extraExercises.push({
    id,
    name: cleanName,
    sets,
    reps,
    suggestedWeight,
    unit: "lb",
    notes: last ? "Added outside the plan. Starting from last logged weight." : "Added outside the plan."
  });
  setState(state);
  itemIndex = Math.max(0, getItems(getDay()).findIndex(item => item.extraId === id));
  render();
}
function itemId(item, i){
  if(item.extraId) return `extra-${item.extraId}`;
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
  const base = alternative ? {
    ...item,
    name: alternative.name || item.name,
    sets: Number(alternative.sets) || item.sets,
    reps: alternative.reps || item.reps,
    suggestedWeight: alternative.suggestedWeight !== undefined && alternative.suggestedWeight !== "" ? Number(alternative.suggestedWeight) : item.suggestedWeight,
    unit: alternative.unit || item.unit,
    notes: alternative.notes || alternative.how || item.notes || ""
  } : item;
  return adjustedExercise(base, activeWorkoutAdjustment(state));
}
function activeWorkoutAdjustment(state = getState()){
  return state && state.workoutAdjustment && state.workoutAdjustment.type ? state.workoutAdjustment : null;
}
function workoutAdjustmentFor(type){
  const options = {
    short_time: {
      type,
      label: "Short on time",
      detail: "Lifting sets capped at 2 for today."
    },
    sore_today: {
      type,
      label: "Sore today",
      detail: "Suggested lifting weights reduced 15% for today."
    },
    equipment_crowded: {
      type,
      label: "Equipment crowded",
      detail: "Use alternatives for crowded stations today."
    }
  };
  return options[type] || null;
}
function adjustedExercise(item, adjustment){
  if(!adjustment) return item;
  if(adjustment.type === "short_time"){
    return {...item, sets: Math.min(getSetCount(item), 2)};
  }
  if(adjustment.type === "sore_today"){
    const current = Number(item.suggestedWeight);
    if(!Number.isFinite(current)) return item;
    const step = String(item.unit || "").toLowerCase() === "kg" ? 2.5 : 5;
    const reduced = Math.max(0, Math.round((current * 0.85) / step) * step);
    return {...item, suggestedWeight: reduced};
  }
  return item;
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
  const exercise = displayExercise(item, id);
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
  const exercise = displayExercise(item, id);
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
function localAlternativesFor(item){
  const name = String(item.name || "").toLowerCase();
  const defaults = {sets: item.sets, reps: item.reps, suggestedWeight: item.suggestedWeight, unit: item.unit || "lb"};
  const make = (altName, how, why, weight = item.suggestedWeight) => ({
    ...defaults,
    name: altName,
    suggestedWeight: weight,
    how,
    why
  });

  if(name.includes("chest press") || name.includes("bench")){
    return [
      make("Dumbbell Bench Press", "Use a flat bench and controlled reps.", "Same horizontal press pattern for chest and triceps.", Math.max(0, Math.round((Number(item.suggestedWeight) || 40) / 2))),
      make("Push-Up", "Use bodyweight or elevate hands if needed.", "Keeps the same press intent with no machine needed.", 0),
      make("Cable Chest Press", "Set handles around chest height and press forward.", "Similar movement with adjustable load.")
    ];
  }
  if(name.includes("row")){
    return [
      make("One-Arm Dumbbell Row", "Brace on a bench and row one side at a time.", "Keeps the horizontal pull intent.", Math.max(0, Math.round((Number(item.suggestedWeight) || 50) / 2))),
      make("Cable Row", "Use a neutral or close grip and pull to ribs.", "Similar back-focused pull with easy setup."),
      make("Chest-Supported Dumbbell Row", "Lie chest-down on an incline bench and row.", "Reduces lower-back demand while training the same pattern.")
    ];
  }
  if(name.includes("pulldown") || name.includes("pull down")){
    return [
      make("Assisted Pull-Up", "Use assistance that lets reps stay smooth.", "Same vertical pull intent.", 0),
      make("Single-Arm Cable Pulldown", "Kneel or sit and pull elbow toward ribs.", "Keeps lat focus if the pulldown station is busy."),
      make("Band Lat Pulldown", "Anchor a band high and pull down with control.", "Simple fallback for vertical pulling.", 0)
    ];
  }
  if(name.includes("shoulder press") || name.includes("overhead")){
    return [
      make("Dumbbell Shoulder Press", "Press seated or standing with controlled range.", "Same overhead press intent.", Math.max(0, Math.round((Number(item.suggestedWeight) || 40) / 2))),
      make("Landmine Press", "Press one side at a time from shoulder height.", "Similar shoulder press with a friendlier angle."),
      make("Machine Lateral Raise", "Use slow reps and stop short of discomfort.", "Keeps shoulder emphasis if overhead press is not a fit.")
    ];
  }
  if(name.includes("lateral raise")){
    return [
      make("Cable Lateral Raise", "Set cable low and raise to shoulder height.", "Same side-delt target with steady tension."),
      make("Machine Lateral Raise", "Use the machine pads and controlled reps.", "Same shoulder isolation intent."),
      make("Lean-Away Dumbbell Lateral Raise", "Hold a stable post and raise one arm.", "Keeps the movement simple with dumbbells.")
    ];
  }
  if(name.includes("tricep") || name.includes("triceps")){
    return [
      make("Cable Triceps Pressdown", "Keep elbows pinned and press down.", "Same triceps isolation intent."),
      make("Dumbbell Overhead Triceps Extension", "Use one dumbbell and slow reps.", "Still trains elbow extension with common equipment."),
      make("Close-Grip Push-Up", "Keep elbows closer to the body.", "Bodyweight triceps fallback.", 0)
    ];
  }
  if(name.includes("curl") || name.includes("bicep")){
    return [
      make("Dumbbell Curl", "Curl with palms up and controlled lowering.", "Same elbow-flexion intent."),
      make("Cable Curl", "Use a straight or rope attachment.", "Similar arm work with adjustable load."),
      make("Preacher Curl Machine", "Use light, controlled reps.", "Keeps biceps isolated if dumbbells are busy.")
    ];
  }
  if(name.includes("leg press")){
    return [
      make("Goblet Squat", "Hold one dumbbell and squat to comfortable depth.", "Keeps squat pattern with simpler equipment."),
      make("Hack Squat Machine", "Use controlled depth and steady reps.", "Similar leg press intent on another machine."),
      make("Walking Lunge", "Use bodyweight or light dumbbells.", "Keeps lower-body work available without the leg press.", 0)
    ];
  }
  if(name.includes("leg curl")){
    return [
      make("Lying Leg Curl", "Use another curl machine if available.", "Same hamstring curl intent."),
      make("Stability Ball Hamstring Curl", "Bridge hips and curl ball toward you.", "Hamstring fallback without a machine.", 0),
      make("Romanian Deadlift", "Hinge with soft knees and light load.", "Keeps hamstring emphasis with a different pattern.")
    ];
  }
  if(name.includes("leg extension")){
    return [
      make("Goblet Squat", "Use controlled reps and stay comfortable.", "Keeps quad work available."),
      make("Step-Up", "Use a stable box and alternate legs.", "Simple quad-focused fallback.", 0),
      make("Split Squat", "Use bodyweight or light dumbbells.", "Trains quads without the extension machine.", 0)
    ];
  }
  if(name.includes("calf")){
    return [
      make("Standing Calf Raise", "Use bodyweight, dumbbells, or a machine.", "Same calf raise intent."),
      make("Leg Press Calf Press", "Press through the balls of your feet.", "Uses common equipment if the calf machine is busy."),
      make("Single-Leg Calf Raise", "Use a wall for balance.", "No-machine calf fallback.", 0)
    ];
  }
  return [
    make("Dumbbell version", "Use the same movement pattern with dumbbells if possible.", "Keeps the workout moving with common equipment."),
    make("Cable version", "Use a cable station and match the movement direction.", "Keeps adjustable resistance available."),
    make("Bodyweight version", "Use a controlled bodyweight option for the same area.", "Fallback when equipment is limited.", 0)
  ];
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
  if(!state.setWeights) state.setWeights = {};
  if(!state.weights) state.weights = {};
  state.setWeights[id] = Array.from({length:getSetCount(alternative)}, () => "");
  state.weights[id] = "";
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
  const id = itemId(item, itemIndex);
  const exercise = displayExercise(item, id);
  const cache = readAlternatives();
  const localKey = alternativesKey(item);
  if(cache[localKey]){
    renderAlternativesPanel("ready", cache[localKey]);
    return;
  }
  if(!getSyncUrl()){
    renderAlternativesPanel("ready", localAlternativesFor(exercise));
    return;
  }
  if(!navigator.onLine){
    renderAlternativesPanel("ready", localAlternativesFor(exercise));
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
    exercise:exercise.name,
    sets:String(exercise.sets),
    reps:String(exercise.reps),
    suggestedWeight:String(exercise.suggestedWeight),
    unit:exercise.unit || "",
    dayTitle:getDay().title || ""
  });
  script.src = `${getSyncUrl()}${separator}${params.toString()}`;
  script.onerror = () => {
    renderAlternativesPanel("error", "Could not reach alternatives right now.");
    cleanup();
  };
  document.body.appendChild(script);
}
function makeLogRecord(item, id, completed){
  const day = getDay();
  const state = getState();
  const plan = getActivePlan();
  const isExercise = item.kind === "exercise";
  const exercise = isExercise ? displayExercise(item, id, state) : item;
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
  return localStorage.getItem(SYNC_URL_KEY) || defaultBackendUrl();
}
function defaultBackendUrl(){
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname) ? "" : APP_BACKEND_URL;
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
  else if(screenMode === "planStart") renderPlanStart();
  else if(screenMode === "setup") renderSetup("change");
  else if(screenMode === "schedule") renderScheduleSetup();
  else if(screenMode === "progress") renderProgress();
  else if(screenMode === "settings") renderSettings();
  else if(screenMode === "stats") renderStatsSettings();
  else if(screenMode === "limitations") renderLimitationsSettings();
  else if(screenMode === "planTune") renderPlanTune();
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
  s.completed[id] = willComplete;
  setState(s);
  saveLogRecord(makeLogRecord(item, id, !!s.completed[id]));
  if(willComplete) completionFlash = `${completedItemLabel(item, id, s)} completed`;
  if(s.completed[id] && itemIndex < items.length-1){ itemIndex++; }
  render();
  $("screen").focus({preventScroll:true});
}
function completedItemLabel(item, id, state){
  if(item.kind === "exercise") return displayExercise(item, id, state).name || "Exercise";
  return item.type || item.text || "Item";
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
function skipCurrentExercise(){
  const items = getItems(getDay());
  const item = items[itemIndex];
  if(!item || item.kind !== "exercise") return;
  const id = itemId(item, itemIndex);
  const state = getState();
  const exercise = displayExercise(item, id, state);
  if(!state.setWeights) state.setWeights = {};
  if(!state.weights) state.weights = {};
  if(!state.notes) state.notes = {};
  state.setWeights[id] = Array.from({length:getSetCount(exercise)}, () => "DNC");
  state.weights[id] = compactSetWeights(state.setWeights[id]).join(" / ");
  state.completed[id] = true;
  state.notes[id] = state.notes[id] || "Skipped exercise.";
  setState(state);
  saveLogRecord(makeLogRecord(item, id, true));
  if(itemIndex < items.length - 1) itemIndex++;
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
