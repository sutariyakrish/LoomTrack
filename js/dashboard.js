import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { onAuthStateChanged } from
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const todayStatsDiv = document.getElementById("todayStats");
const monthStatsDiv = document.getElementById("monthStats");
const todayLabel = formatToday();
const todaydate=document.querySelector(".today-date");
todaydate.innerHTML = `${todayLabel}`;
const month = formatCurrentMonth();
const todaymonth=document.querySelector(".today-month");
todaymonth.innerHTML = `${month}`;
  
;

let factoryId = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  factoryId = sessionStorage.getItem("factoryId");
  if (!factoryId) {
    window.location.href = "factories.html";
    return;
  }

  loadTodayStats();
  loadMonthStats();
});

/* ---------------- TODAY STATS ---------------- */
async function loadTodayStats() {
  const today = new Date();
  const start = new Date(today.setHours(0, 0, 0, 0));
  const end = new Date(today.setHours(23, 59, 59, 999));

  const q = query(
    collection(db, "production"),
    where("factoryId", "==", factoryId),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<=", Timestamp.fromDate(end))
  );

  const snap = await getDocs(q);

  let total = 0;
  let day = 0;
  let night = 0;

  snap.forEach(d => {
    const data = d.data();
    total += data.meters;
    if (data.shift === "Day") day += data.meters;
    if (data.shift === "Night") night += data.meters;
  });

  todayStatsDiv.innerHTML = `
    ${card("Today Total", total)}
    ${card("Day Shift", day)}
    ${card("Night Shift", night)}
    ${card("Entries", snap.size)}
  `;
}

/* ---------------- MONTH STATS ---------------- */
async function loadMonthStats() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const q = query(
    collection(db, "production"),
    where("factoryId", "==", factoryId),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<=", Timestamp.fromDate(end))
  );

  const snap = await getDocs(q);

  let total = 0;
  const machineMap = {};
  const workerMap = {};

  snap.forEach(d => {
    const data = d.data();
    total += data.meters;

    const mKey = `Machine ${data.machineNumber}`;
    machineMap[mKey] = (machineMap[mKey] || 0) + data.meters;

    workerMap[data.workerName] =
      (workerMap[data.workerName] || 0) + data.meters;
  });

  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate();

  const bestMachine = Object.entries(machineMap)
    .sort((a, b) => b[1] - a[1])[0];

  const bestWorker = Object.entries(workerMap)
    .sort((a, b) => b[1] - a[1])[0];

  monthStatsDiv.innerHTML = `
    ${card("Month Total", total)}
    ${card("Avg / Day", Math.round(total / daysInMonth))}
    ${card("Top Machine", bestMachine ? bestMachine[0] : "-")}
    ${card("Top Worker", bestWorker ? bestWorker[0] : "-")}
  `;
}

/* ---------------- CARD HELPER ---------------- */
function card(title, value) {
  return `
    <div class="summary-card">
      <h4>${title}</h4>
      <p>${value}</p>
    </div>
  `;
}
function formatToday() {
  return new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatCurrentMonth() {
  return new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });
}

