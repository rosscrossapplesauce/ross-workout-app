let data;
let weekIndex = Number(localStorage.getItem("weekIndex") || 0);
let dayIndex = Number(localStorage.getItem("dayIndex") || 0);
let itemIndex = Number(localStorage.getItem("itemIndex") || 0);
let syncInFlight = false;

const $ = id => document.getElementById(id);
const key = () => `rossWorkout.v1.w${weekIndex}.d${dayIndex}`;
const HISTORY_KEY = "rossWorkout.v1.history";
const PENDING_KEY = "rossWorkout.v1.pendingSync";
const SYNC_URL_KEY = "rossWorkout.v1.syncUrl";

async function init(){
  const res = await fetch("workouts.json");
  data = await res.json();
  buildSelectors();
  render();
  loadRemoteHistory();
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
  $("syncStatus").onclick = configureSync;
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
  return JSON.parse(localStorage.getItem(key()) || '{"completed":{},"weights":{},"notes":{}}');
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
  const lastWeight = Number(last.completedWeight);
  const currentTarget = Number(item.suggestedWeight);
  const change = Number.isFinite(lastWeight) && Number.isFinite(currentTarget) ? currentTarget - lastWeight : null;
  const changeText = change === null ? "" : ` · ${change >= 0 ? "+" : ""}${change} ${item.unit}`;
  return `<div class="lastWeek">Last completed: ${escapeHtml(last.completedWeight)} ${escapeHtml(item.unit)} · ${formatDate(last.timestamp)}${changeText}</div>`;
}
function render(){
  const day = getDay();
  const items = getItems(day);
  if(itemIndex >= items.length) itemIndex = Math.max(0, items.length-1);
  $("weekLabel").innerText = `Week ${weekIndex+1}`;
  $("dayTitle").innerText = `${day.day}: ${day.title}`;
  $("weekSelect").value = weekIndex;
  $("daySelect").value = dayIndex;
  $("doneBtn").style.display = items.length ? "block" : "none";

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
    const completedWeight = state.weights[id] || "";
    const notes = state.notes[id] || "";
    $("screen").innerHTML = `
      <section class="card ${done ? "completed":""}">
        <div>
          <div class="kicker"><span>Exercise ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${item.name}</div>
          <div class="prescription">${item.sets} × ${item.reps}</div>
          <div class="bigWeight">${item.suggestedWeight}<span class="unit"> ${item.unit}</span></div>
          ${history}
        </div>
        <div>
          <label>Completed weight</label>
          <div class="inputRow">
            <button class="stepBtn" onclick="adjustWeight(-5)" aria-label="Decrease weight">−</button>
            <input id="weightInput" type="number" inputmode="decimal" enterkeyhint="done" placeholder="${item.suggestedWeight}" value="${completedWeight}">
            <button class="stepBtn" onclick="adjustWeight(5)" aria-label="Increase weight">+</button>
          </div>
          <button class="suggestedBtn" onclick="useSuggested()">Use suggested ${item.suggestedWeight} ${item.unit}</button>
          <div style="height:10px"></div>
          <label>Notes</label>
          <textarea id="noteInput" placeholder="Optional">${notes}</textarea>
        </div>
      </section>`;
    setTimeout(()=>{
      $("weightInput").oninput = saveInputs;
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
function itemId(item, i){
  if(item.kind === "exercise") return `exercise-${item.idx}`;
  return `${item.kind}-${i}`;
}
function saveInputs(){
  const item = getItems(getDay())[itemIndex];
  const id = itemId(item,itemIndex);
  const s = getState();
  if($("weightInput")) s.weights[id] = $("weightInput").value;
  if($("noteInput")) s.notes[id] = $("noteInput").value;
  setState(s);
}
function useSuggested(){
  const item = getItems(getDay())[itemIndex];
  $("weightInput").value = item.suggestedWeight;
  saveInputs();
}
function adjustWeight(delta){
  const item = getItems(getDay())[itemIndex];
  const input = $("weightInput");
  const current = input.value === "" ? Number(item.suggestedWeight) : Number(input.value);
  if(Number.isNaN(current)) return;
  input.value = Math.max(0, current + delta);
  saveInputs();
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
    completedWeight: isExercise ? (state.weights[id] || "") : "",
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
    const timeout = setTimeout(() => cleanup(false), 12000);
    const cleanup = result => {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
      resolve(result);
    };
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
  saveInputs();
  const items = getItems(getDay());
  const item = items[itemIndex];
  const id = itemId(item,itemIndex);
  const s = getState();
  s.completed[id] = !s.completed[id];
  setState(s);
  saveLogRecord(makeLogRecord(item, id, !!s.completed[id]));
  if(s.completed[id] && itemIndex < items.length-1){ itemIndex++; }
  render();
  $("screen").focus({preventScroll:true});
}
function nextItem(){
  const items = getItems(getDay());
  itemIndex = Math.min(items.length-1, itemIndex+1);
  render();
  $("screen").focus({preventScroll:true});
}
function prevItem(){
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
