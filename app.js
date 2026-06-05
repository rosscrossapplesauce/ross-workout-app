let data;
let weekIndex = Number(localStorage.getItem("weekIndex") || 0);
let dayIndex = Number(localStorage.getItem("dayIndex") || 0);
let itemIndex = Number(localStorage.getItem("itemIndex") || 0);
let syncInFlight = false;
let overviewOpen = false;

const $ = id => document.getElementById(id);
const key = () => `rossWorkout.v1.w${weekIndex}.d${dayIndex}`;
const HISTORY_KEY = "rossWorkout.v1.history";
const PENDING_KEY = "rossWorkout.v1.pendingSync";
const SYNC_URL_KEY = "rossWorkout.v1.syncUrl";
const ALTERNATIVES_KEY = "rossWorkout.v1.alternatives";

async function init(){
  lockViewportHeight();
  const res = await fetch("workouts.json");
  data = await res.json();
  buildSelectors();
  render();
  loadRemoteHistory();
}
function lockViewportHeight(){
  const setHeight = () => document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
  setHeight();
  window.addEventListener("resize", setHeight);
  window.addEventListener("orientationchange", setHeight);
  document.addEventListener("touchmove", e => {
    if(!e.target.closest || !e.target.closest("input, textarea, select")) e.preventDefault();
  }, {passive:false});
}
function buildSelectors(){
  $("weekSelect").innerHTML = data.weeks.map((w,i)=>`<option value="${i}">Week ${w.week}</option>`).join("");
  buildDaySelector();
  $("weekSelect").value = weekIndex;
  $("daySelect").value = dayIndex;
  $("weekSelect").onchange = e => { weekIndex=Number(e.target.value); dayIndex=Math.min(dayIndex, data.weeks[weekIndex].days.length-1); itemIndex=0; buildDaySelector(); saveNav(); render(); };
  $("daySelect").onchange = e => { dayIndex=Number(e.target.value); itemIndex=0; saveNav(); render(); };
  $("prevBtn").onclick = prevItem;
  $("nextBtn").onclick = nextItem;
  $("doneBtn").onclick = markDone;
  $("resetBtn").onclick = resetDay;
  $("overviewBtn").onclick = showOverview;
  window.addEventListener("online", syncPending);
  window.addEventListener("offline", updateSyncStatus);
  updateSyncStatus();
  syncPending();
}
function buildDaySelector(){
  $("daySelect").innerHTML = data.weeks[weekIndex].days.map((d,i)=>`<option value="${i}">${d.day}</option>`).join("");
  $("daySelect").value = dayIndex;
}
function saveNav(){
  localStorage.setItem("weekIndex", weekIndex);
  localStorage.setItem("dayIndex", dayIndex);
  localStorage.setItem("itemIndex", itemIndex);
}
function getDay(){
  return data.weeks[weekIndex].days[dayIndex];
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
function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}
function formatDate(value){
  if(!value) return "";
  return new Date(value).toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"});
}
function getContextId(id){
  return `w${weekIndex}.d${dayIndex}.${id}`;
}
function getLastHistory(exName, currentContext){
  return readList(HISTORY_KEY)
    .filter(record => record.exercise === exName && record.context !== currentContext && record.completed && record.completedWeight !== "")
    .sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
}
function historySummary(item, id){
  const last = getLastHistory(item.name, getContextId(id));
  if(!last) return "";
  const lastDisplay = last.setWeights || last.completedWeight;
  const lastWeight = finalWeight(lastDisplay);
  const currentTarget = Number(item.suggestedWeight);
  const change = Number.isFinite(lastWeight) && Number.isFinite(currentTarget) ? currentTarget - lastWeight : null;
  const changeText = change === null ? "" : ` · ${change >= 0 ? "+" : ""}${change} ${item.unit}`;
  return `<div class="lastWeek">Last completed: ${escapeHtml(lastDisplay)} ${escapeHtml(item.unit)} · ${formatDate(last.timestamp)}${changeText}</div>`;
}
function render(){
  const day = getDay();
  const items = getItems(day);
  if(itemIndex >= items.length) itemIndex = Math.max(0, items.length-1);
  $("weekLabel").innerText = `Week ${weekIndex+1}`;
  $("dayTitle").innerHTML = `<span>${escapeHtml(day.day)}</span><span>${escapeHtml(day.title)}</span>`;
  $("weekSelect").value = weekIndex;
  $("daySelect").value = dayIndex;
  $("doneBtn").style.display = items.length ? "block" : "none";
  $("doneBtn").innerText = "Done ✓";
  $("prevBtn").style.display = "block";
  $("nextBtn").style.display = "block";
  $("overviewBtn").innerText = "Overview";

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
    const history = historySummary(item, id);
    const setWeights = getSetWeights(state, id, item);
    const notes = state.notes[id] || "";
    $("screen").innerHTML = `
      <section class="card ${done ? "completed":""}">
        <div>
          <div class="kicker"><span>Exercise ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${item.name}</div>
          <div class="prescription">${item.sets} × ${item.reps}</div>
          <div class="bigWeight">${item.suggestedWeight}<span class="unit"> ${item.unit}</span></div>
          ${history}
          <button class="altBtn" onclick="loadAlternatives()">Alternatives</button>
        </div>
        <div>
          <label>Completed weight by set</label>
          <div class="setGrid">
            ${setWeights.map((weight,setIndex)=>setWeightRow(item, setIndex, weight)).join("")}
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
      <div class="overviewList">
        ${items.map((item,i)=>overviewRow(item, i, !!state.completed[itemId(item, i)], state)).join("")}
      </div>
    </section>`;
  saveNav();
  updateSyncStatus();
}
function overviewRow(item, index, done, state){
  const id = itemId(item, index);
  const title = item.kind === "exercise" ? item.name : (item.type || "Rest");
  const setWeights = item.kind === "exercise" ? compactSetWeights(getSetWeights(state, id, item)) : [];
  const detail = item.kind === "exercise"
    ? `${item.sets} × ${item.reps} · suggested ${item.suggestedWeight} ${item.unit}${setWeights.length ? ` · sets ${setWeights.join(" / ")} ${item.unit}` : ""}`
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
  document.querySelectorAll(".setWeightRow").forEach(row => {
    row.classList.remove("setMissed");
    row.querySelector(".missBtn").classList.remove("missed");
    const input = row.querySelector(".setWeightInput");
    input.disabled = false;
    input.value = item.suggestedWeight;
  });
  saveInputs();
}
function adjustSetWeight(setIndex, delta){
  const item = getItems(getDay())[itemIndex];
  const input = document.querySelector(`.setWeightInput[data-set-index="${setIndex}"]`);
  if(input.disabled){
    input.disabled = false;
    input.closest(".setWeightRow").classList.remove("setMissed");
    input.closest(".setWeightRow").querySelector(".missBtn").classList.remove("missed");
  }
  const current = input.value === "" ? Number(item.suggestedWeight) : Number(input.value);
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
  return `${item.name}|${item.sets}|${item.reps}`;
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
  panel.innerHTML = `
    <div class="altSheet">
      <button class="altClose" onclick="closeAlternatives()">×</button>
      <div class="altList">
        ${alternatives.map(alt => `
          <div class="altItem">
            <div class="altName">${escapeHtml(alt.name)}</div>
            <div class="altDetail">${escapeHtml(alt.how || "")}</div>
            <div class="altReason">${escapeHtml(alt.why || "")}</div>
          </div>`).join("")}
      </div>
    </div>`;
}
function closeAlternatives(){
  const panel = $("alternativesPanel");
  if(panel) panel.remove();
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
  const isExercise = item.kind === "exercise";
  return {
    id: `${Date.now()}-${weekIndex}-${dayIndex}-${id}`,
    context: getContextId(id),
    timestamp: new Date().toISOString(),
    week: data.weeks[weekIndex].week,
    day: day.day,
    dayTitle: day.title,
    exercise: isExercise ? item.name : (item.type || item.text || item.kind),
    itemType: item.kind,
    suggestedWeight: isExercise ? item.suggestedWeight : "",
    unit: isExercise ? item.unit : "",
    completedWeight: isExercise ? compactSetWeights(getSetWeights(state, id, item)).join(" / ") : "",
    setWeights: isExercise ? compactSetWeights(getSetWeights(state, id, item)).join(" / ") : "",
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
      render();
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
    const setWeights = getSetWeights(s, id, item);
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
