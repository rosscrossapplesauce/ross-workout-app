let data;
let weekIndex = Number(localStorage.getItem("weekIndex") || 0);
let dayIndex = Number(localStorage.getItem("dayIndex") || 0);
let itemIndex = Number(localStorage.getItem("itemIndex") || 0);

const $ = id => document.getElementById(id);
const key = () => `rossWorkout.v1.w${weekIndex}.d${dayIndex}`;

async function init(){
  const res = await fetch("workouts.json");
  data = await res.json();
  buildSelectors();
  render();
}
function buildSelectors(){
  $("weekSelect").innerHTML = data.weeks.map((w,i)=>`<option value="${i}">Week ${w.week}</option>`).join("");
  $("daySelect").innerHTML = data.weeks[0].days.map((d,i)=>`<option value="${i}">${d.day}</option>`).join("");
  $("weekSelect").value = weekIndex;
  $("daySelect").value = dayIndex;
  $("weekSelect").onchange = e => { weekIndex=Number(e.target.value); itemIndex=0; saveNav(); render(); };
  $("daySelect").onchange = e => { dayIndex=Number(e.target.value); itemIndex=0; saveNav(); render(); };
  $("prevBtn").onclick = prevItem;
  $("nextBtn").onclick = nextItem;
  $("doneBtn").onclick = markDone;
  $("resetBtn").onclick = resetDay;
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
function previousWeekWeight(exName){
  if(weekIndex === 0) return null;
  const prevDay = data.weeks[weekIndex-1].days[dayIndex];
  const matchIndex = prevDay.exercises.findIndex(e => e.name === exName);
  if(matchIndex < 0) return null;
  const prevState = JSON.parse(localStorage.getItem(`rossWorkout.v1.w${weekIndex-1}.d${dayIndex}`) || '{"weights":{}}');
  return prevState.weights[`exercise-${matchIndex}`] || null;
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
  $("progressText").innerText = `${completedCount} of ${total} complete`;
  $("scoreText").innerText = total ? `${Math.round(completedCount/total*100)}%` : "";
  $("progressBar").style.width = total ? `${completedCount/total*100}%` : "0%";

  if(!items.length){ $("screen").innerHTML = `<div class="card rest"><div><div class="exerciseName">Rest Day</div><div class="hint">${day.recovery || "No workout today."}</div></div></div>`; return; }

  const item = items[itemIndex];
  const id = itemId(item, itemIndex);
  const done = !!state.completed[id];

  if(item.kind === "exercise"){
    const prev = previousWeekWeight(item.name);
    const completedWeight = state.weights[id] || "";
    const notes = state.notes[id] || "";
    $("screen").innerHTML = `
      <section class="card ${done ? "completed":""}">
        <div>
          <div class="kicker"><span>Exercise ${itemIndex+1} of ${total}</span><span class="doneBadge">${done ? "Done ✓" : ""}</span></div>
          <div class="exerciseName">${item.name}</div>
          <div class="prescription">${item.sets} × ${item.reps}</div>
          <div class="bigWeight">${item.suggestedWeight}<span class="unit"> ${item.unit}</span></div>
          ${prev ? `<div class="lastWeek">Last week completed: ${prev} ${item.unit}</div>` : ""}
        </div>
        <div>
          <label>Completed weight</label>
          <div class="inputRow">
            <input id="weightInput" type="number" inputmode="decimal" placeholder="${item.suggestedWeight}" value="${completedWeight}">
            <button onclick="useSuggested()">Use ${item.suggestedWeight}</button>
          </div>
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
function markDone(){
  saveInputs();
  const items = getItems(getDay());
  const item = items[itemIndex];
  const id = itemId(item,itemIndex);
  const s = getState();
  s.completed[id] = !s.completed[id];
  setState(s);
  if(s.completed[id] && itemIndex < items.length-1){ itemIndex++; }
  render();
}
function nextItem(){
  const items = getItems(getDay());
  itemIndex = Math.min(items.length-1, itemIndex+1);
  render();
}
function prevItem(){
  itemIndex = Math.max(0, itemIndex-1);
  render();
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
