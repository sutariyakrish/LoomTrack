import { db, auth } from "./firebase.js";
import {
  writeBatch,
  doc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { cache } from "./cache.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { formatWorkerLabel } from "./workerLabel.js";

const workerSelect = document.getElementById("workerSelect");
const infoText = document.getElementById("infoText");
let factoryId = null;
const productionDateInput = document.getElementById("productionDate");
const shiftSelect = document.getElementById("shiftSelect");
workerSelect.addEventListener("change", tryLoadBulkTable);
productionDateInput.addEventListener("change", tryLoadBulkTable);
shiftSelect.addEventListener("change", tryLoadBulkTable);
const bulkTableBody = document.getElementById("bulkTableBody");
let isEditMode = false;

/* ---------- AUTH + FACTORY ---------- */
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

  await loadMachinesOnce();
  await loadAssignmentsOnce();
  await loadActiveBeamsOnce();
  loadWorkers();
});
async function loadMachinesOnce() {
  if (cache.machines.length) return;

  const snap = await getDocs(
    collection(db, "factories", factoryId, "machines"),
  );

  cache.machines = snap.docs.map((d) => Number(d.data().machineNumber));
}
async function loadAssignmentsOnce() {
  if (cache.assignments.length) return;

  const q = query(
    collection(db, "assignments"),
    where("factoryId", "==", factoryId),
    where("status", "==", "active"),
  );

  const snap = await getDocs(q);
  cache.assignments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cache.workerLabels = {}; // workerId → label

  cache.assignments.forEach((a) => {
    cache.workerLabels[a.workerId] = formatWorkerLabel(a.workerName, a.ranges);
  });
}
async function loadActiveBeamsOnce() {
  if (Object.keys(cache.activeBeams).length) return;

  const q = query(
    collection(db, "beams"),
    where("factoryId", "==", factoryId),
    where("isActive", "==", true),
  );

  const snap = await getDocs(q);

  snap.forEach((d) => {
    const b = d.data();
    cache.activeBeams[b.machineNumber] = {
      beamId: d.id,
      beamNo: b.beamNo,
    };
  });
}

function getEntryTimestamp(dateStr, shift) {
  if (shift === "Day") {
    return new Date(dateStr + "T12:00:00"); // Day = midday
  }
  if (shift === "Night") {
    return new Date(dateStr + "T23:00:00"); // Night = late
  }
  return new Date(dateStr + "T00:00:00");
}

async function getLastTakaForMachine(machineNumber, entryTime) {
  const q = query(
    collection(db, "production"),
    where("factoryId", "==", factoryId),
    where("machineNumber", "==", machineNumber),
    where("createdAt", "<", Timestamp.fromDate(entryTime)),
  );

  const snap = await getDocs(q);

  if (snap.empty) return "";

  let latest = null;

  snap.forEach((d) => {
    const data = d.data();
    if (!latest || data.createdAt.toMillis() > latest.createdAt.toMillis()) {
      latest = data;
    }
  });

  return latest?.takaNo || "";
}

async function tryLoadBulkTable() {
  const workerId = workerSelect.value;
  const date = productionDateInput.value;
  const shift = shiftSelect.value;

  bulkTableBody.innerHTML = "";
  infoText.textContent = "";

  if (!workerId || !date || !shift) return;

  await loadProductionForEditOrCreate(workerId, date, shift);
}

/* ---------- LOAD MACHINES ---------- */

/* ---------- SAVE PRODUCTION ---------- */

async function loadWorkers() {
  const q = query(
    collection(db, "workers"),
    where("factoryId", "==", factoryId),
    where("isActive", "==", true),
  );

  const snap = await getDocs(q);

  workerSelect.innerHTML = `<option value="">Select Worker</option>`;

  snap.forEach((d) => {
    const w = d.data();

    const opt = document.createElement("option");
    opt.value = d.id; // workerId

    // ✅ CORRECT LINE
    opt.textContent =
      cache.workerLabels[d.id] || w.name;

    opt.dataset.workerName = w.name;
    workerSelect.appendChild(opt);
  });
}

async function loadMachinesForWorker(workerId) {
  // 1️⃣ get active assignment
  const q = query(
    collection(db, "assignments"),
    where("workerId", "==", workerId),
    where("status", "==", "active"),
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    infoText.textContent = "❌ No active assignment for this worker";
    return;
  }

  const assignment = snap.docs[0].data();

  // 2️⃣ expand ranges → machine numbers
  const machines = [];

  assignment.ranges.forEach((r) => {
    for (let i = r.from; i <= r.to; i++) {
      machines.push(i);
    }
  });
  machines.sort((a, b) => a - b);

  await renderBulkRows(machines);
}
async function renderBulkRows(machineNumbers) {
  bulkTableBody.innerHTML = "";

  const date = productionDateInput.value;
  const shift = shiftSelect.value;
  const entryTime = getEntryTimestamp(date, shift);

  for (const machineNo of machineNumbers) {
    const beam = cache.activeBeams[machineNo];
    if (!beam) {
      infoText.textContent = `❌ Machine ${machineNo} has no active beam. Add beam first.`;
      bulkTableBody.innerHTML = "";
      return;
    }

    const lastTaka = await getLastTakaForMachine(machineNo, entryTime);

    const tr = document.createElement("tr");
    tr.dataset.machineNumber = machineNo;
    tr.dataset.beamId = beam.beamId;
    tr.dataset.beamNo = beam.beamNo;

    tr.innerHTML = `
      <td>Machine ${machineNo}</td>
      <td>${beam.beamNo}</td>
      <td>
        <input class="taka-input" value="${lastTaka}">
      </td>
      <td>
        <input class="meter-input" type="number" min="0">
      </td>
    `;

    bulkTableBody.appendChild(tr);
  }
}

setTimeout(() => {
  const firstMeter = document.querySelector(".meter-input");
  if (firstMeter) firstMeter.focus();
}, 0);

document.getElementById("saveBulkBtn").addEventListener("click", async () => {
  const rows = document.querySelectorAll("#bulkTableBody tr");
  if (!rows.length) return;

  const batch = writeBatch(db);

  const workerId = workerSelect.value;
  const workerName = workerSelect.selectedOptions[0].dataset.workerName;
  const shift = shiftSelect.value;
  const date = productionDateInput.value;

  const createdAt = Timestamp.fromDate(getEntryTimestamp(date, shift));

  for (const row of rows) {
    const taka = row.querySelector(".taka-input").value.trim();
    const metersRaw = row.querySelector(".meter-input").value.trim();

    if (metersRaw === "") {
      alert("⚠️ Fill all meter fields (0 allowed)");
      return;
    }

    const meters = Number(metersRaw);
    if (isNaN(meters) || meters < 0) {
      alert("⚠️ Invalid meters");
      return;
    }

    if (!taka) {
      alert("⚠️ Enter all Taka numbers");
      return;
    }

    const ref = row.dataset.productionId
      ? doc(db, "production", row.dataset.productionId)
      : doc(collection(db, "production"));

    batch.set(
      ref,
      {
        factoryId,
        machineNumber: Number(row.dataset.machineNumber),
        beamId: row.dataset.beamId,
        beamNo: row.dataset.beamNo,
        workerId,
        workerName,
        workerLabel: cache.workerLabels[workerId],
        takaNo: taka,
        meters,
        shift,
        createdAt,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  }

  await batch.commit();
  alert("Production saved successfully");
  bulkTableBody.innerHTML = "";
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  const inputs = Array.from(document.querySelectorAll(".meter-input"));
  const index = inputs.indexOf(document.activeElement);

  if (index !== -1 && inputs[index + 1]) {
    inputs[index + 1].focus();
    e.preventDefault();
  }
});
function getShiftWindow(dateStr, shift) {
  const day = new Date(dateStr + "T00:00:00");

  if (shift === "Day") {
    return {
      start: new Date(day.setHours(6, 0, 0)),
      end: new Date(day.setHours(17, 59, 59)),
    };
  }

  if (shift === "Night") {
    return {
      start: new Date(day.setHours(18, 0, 0)),
      end: new Date(day.setHours(23, 59, 59)),
    };
  }

  return null;
}

function renderBulkFromExisting(docs) {
  bulkTableBody.innerHTML = "";
  const sortedDocs = docs.sort(
    (a, b) => a.data().machineNumber - b.data().machineNumber,
  );

  sortedDocs.forEach((docSnap) => {
    const d = docSnap.data();

    const tr = document.createElement("tr");

    tr.dataset.productionId = docSnap.id; // 👈 EDIT MODE
    tr.dataset.machineNumber = d.machineNumber;
    tr.dataset.beamId = d.beamId;
    tr.dataset.beamNo = d.beamNo;

    tr.innerHTML = `
      <td>Machine ${d.machineNumber}</td>
      <td>${d.beamNo}</td>
      <td>
        <input type="text"
               class="taka-input"
               value="${d.takaNo}">
      </td>
      <td>
        <input type="number"
               class="meter-input"
               value="${d.meters}"
               min="0">
      </td>
    `;

    bulkTableBody.appendChild(tr);
  });
}
async function loadProductionForEditOrCreate(workerId, date, shift) {
  const entryTime = getEntryTimestamp(date, shift);

  const start = new Date(entryTime);
  start.setHours(0, 0, 0, 0);

  const end = new Date(entryTime);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "production"),
    where("factoryId", "==", factoryId),
    where("workerId", "==", workerId),
    where("shift", "==", shift),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<=", Timestamp.fromDate(end)),
  );

  const snap = await getDocs(q);

  if (!snap.empty) {
    renderBulkFromExisting(snap.docs);
  } else {
    await loadMachinesForWorker(workerId);
  }
}
