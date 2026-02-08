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
cache.beams = cache.beams || [];


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
  await loadBeamsOnce();

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
async function loadBeamsOnce() {
  if (cache.beams?.length) return;

  const q = query(
    collection(db, "beams"),
    where("factoryId", "==", factoryId)
  );

  const snap = await getDocs(q);

  cache.beams = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
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
    const entryDate = new Date(date + "T00:00:00");
    const beam = resolveBeamForDate(machineNo, entryDate);

    if (!beam) {
      infoText.textContent =
        `❌ No beam found for Machine ${machineNo} on selected date`;
      bulkTableBody.innerHTML = "";
      return;
    }

    const lastTaka = await getLastTakaForMachine(machineNo, entryTime);

    const tr = createRow(machineNo, beam, lastTaka);
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
    const entryType = row.querySelector(".entry-type").value;

const countInWorker = entryType === "normal";
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

  workerId: countInWorker ? workerId : null,
  workerName: countInWorker ? workerName : "SYSTEM",
  workerLabel: countInWorker ? cache.workerLabels[workerId] : "Adjustment",

  takaNo: taka,
  meters,

  shift,
  createdAt,

  entryType,
  countInWorker,

  updatedAt: Timestamp.now()
      },
      { merge: true },
    );
  }

  await batch.commit();
  alert("Production saved successfully");
  bulkTableBody.innerHTML = "";
});

document.addEventListener("keydown", (e) => {
  const active = document.activeElement;

  if (!active) return;

  // ENTER → move forward
  if (e.key === "Enter") {
    e.preventDefault();

    // From taka → meters
    if (active.classList.contains("taka-input")) {
      active.closest("tr")
        .querySelector(".meter-input")
        .focus();
      return;
    }

    // From meters → next row taka
    if (active.classList.contains("meter-input")) {
      const row = active.closest("tr");
      const next = row.nextElementSibling;

      if (next) {
        next.querySelector(".taka-input")?.focus();
      }
      return;
    }
  }

  // + → add new taka for same machine
  if (e.key === "+" || e.key === "=") {
    const row = active.closest("tr");
    if (!row) return;

    const machineNo = row.dataset.machineNumber;
    const beam = {
      id: row.dataset.beamId,
      beamNo: row.dataset.beamNo
    };

    const newRow = createRow(machineNo, beam);
    row.after(newRow);

    newRow.querySelector(".taka-input").focus();
  }

  // CTRL + ENTER → Save
  if (e.key === "Enter" && e.ctrlKey) {
    document.getElementById("saveBulkBtn").click();
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

  docs
    .sort((a, b) => a.data().machineNumber - b.data().machineNumber)
    .forEach((docSnap) => {
      const d = docSnap.data();

      const tr = createRow(
        d.machineNumber,
        { id: d.beamId, beamNo: d.beamNo },
        d.takaNo
      );

      tr.dataset.productionId = docSnap.id;

      tr.querySelector(".meter-input").value = d.meters;
      tr.querySelector(".entry-type").value =
        d.entryType || "normal";
        const entryType = d.entryType || "normal";

if (entryType === "adjustment") {
  tr.classList.add("adjustment");
}


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
function resolveBeamForDate(machineNumber, entryDate) {
  

  const beams = cache.beams
    .filter(b => b.machineNumber === machineNumber)
    .filter(b => {
      if (!b.startDate) return false;
      const start = b.startDate.toDate();
      

      const end = b.endDate ? b.endDate.toDate() : null;
      return start <= entryDate && (!end || entryDate < end);
    })
    .sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());

  return beams[0] || null;
}
bulkTableBody.addEventListener("click", (e) => {
  if (!e.target.classList.contains("add-taka-btn")) return;

  const row = e.target.closest("tr");

  const machineNo = row.dataset.machineNumber;
  const beam = {
    id: row.dataset.beamId,
    beamNo: row.dataset.beamNo
  };

  const newRow = createRow(machineNo, beam);
  row.after(newRow);
});
function createRow(machineNo, beam, lastTaka = "") {
  const tr = document.createElement("tr");

  tr.dataset.machineNumber = machineNo;
  tr.dataset.beamId = beam.id;
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

    <td>
      <select class="entry-type">
        <option value="normal">Normal</option>
        <option value="adjustment">Adjustment</option>
      </select>
    </td>

    <td>
      <button type="button" class="add-taka-btn">+</button>
    </td>
  `;

  return tr;
}
bulkTableBody.addEventListener("change", (e) => {
  if (!e.target.classList.contains("entry-type")) return;

  const row = e.target.closest("tr");

  if (e.target.value === "adjustment") {
    row.classList.add("adjustment");
  } else {
    row.classList.remove("adjustment");
  }
});
