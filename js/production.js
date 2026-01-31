import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { confirmOwnerPassword } from "./confirmPassword.js";
import { logAudit } from "./audit.js";

import {
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const machineSelect = document.getElementById("machineSelect");
const workerSelect = document.getElementById("workerSelect");
const infoText = document.getElementById("infoText");
const loadBtn = document.getElementById("loadProductionBtn");
const dateInput = document.getElementById("productionDate");
const tableBody = document.getElementById("productionTableBody");

let factoryId = null;
let activeBeam = null;
const productionDateInput = document.getElementById("productionDate");

// Set default date = today
productionDateInput.value = new Date().toISOString().split("T")[0];

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

  loadMachines();
  loadWorkers();
});

/* ---------- LOAD MACHINES ---------- */
async function loadMachines() {
  const snap = await getDocs(
    collection(db, "factories", factoryId, "machines"),
  );

  machineSelect.innerHTML = `<option value="">Select Machine</option>`;

  snap.forEach((docSnap) => {
    const m = docSnap.data();
    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = `Machine ${m.machineNumber}`;
    option.dataset.machineNumber = m.machineNumber;
    machineSelect.appendChild(option);
  });
}

/* ---------- LOAD WORKERS ---------- */
async function loadWorkers() {
  const q = query(
    collection(db, "workers"),
    where("factoryId", "==", factoryId),
    where("isActive", "==", true),
  );

  const snap = await getDocs(q);
  workerSelect.innerHTML = `<option value="">Select Worker</option>`;

  snap.forEach((docSnap) => {
    const w = docSnap.data();
    const option = document.createElement("option");
    option.value = docSnap.id;
    option.textContent = w.name;
    option.dataset.workerName = w.name;
    workerSelect.appendChild(option);
  });
}

/* ---------- MACHINE CHANGE → FIND ACTIVE BEAM ---------- */
machineSelect.addEventListener("change", async () => {
  activeBeam = null;
  infoText.textContent = "";

  const machineId = machineSelect.value;
  if (!machineId) return;

  const q = query(
    collection(db, "beams"),
    where("factoryId", "==", factoryId),
    where("machineId", "==", machineId),
    where("isActive", "==", true),
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    infoText.textContent = "❌ No active beam on this machine";
  } else {
    activeBeam = snap.docs[0];
    const b = activeBeam.data();
    infoText.textContent = `✅ Active Beam: ${b.beamNo} | Total: ${b.totalMeters}m`;
  }
});

/* ---------- SAVE PRODUCTION ---------- */
document.getElementById("saveBtn").addEventListener("click", async () => {
  if (!activeBeam) {
    alert("No active beam selected");
    return;
  }

  const machineId = machineSelect.value;
  const workerId = workerSelect.value;
  const shift = document.getElementById("shiftSelect").value;
  const takaNo = document.getElementById("takaNo").value.trim();
  const meters = Number(document.getElementById("meters").value);

  if (!machineId || !workerId || !shift || !takaNo || meters <= 0) {
    alert("Please fill all fields correctly");
    return;
  }

  const machineNumber = machineSelect.selectedOptions[0].dataset.machineNumber;
  const workerName = workerSelect.selectedOptions[0].dataset.workerName;
  const selectedDate = productionDateInput.value;

  const productionDate = new Date(selectedDate + "T00:00:00");

  const b = activeBeam.data();

  await addDoc(collection(db, "production"), {
    factoryId,

    machineId,
    machineNumber: Number(machineNumber),

    beamId: activeBeam.id,
    beamNo: b.beamNo,

    workerId,
    workerName,

    shift,
    takaNo,
    meters,

    // 👇 IMPORTANT CHANGE
    createdAt: Timestamp.fromDate(productionDate),
  });

  alert("Production entry saved");

  document.getElementById("takaNo").value = "";
  document.getElementById("meters").value = "";
});


loadBtn.addEventListener("click", async () => {
  if (!dateInput.value) {
    alert("Select a date");
    return;
  }

  const start = new Date(dateInput.value + "T00:00:00");
  const end = new Date(dateInput.value + "T23:59:59");

  tableBody.innerHTML = `
    <tr><td colspan="6">Loading...</td></tr>
  `;

  const q = query(
    collection(db, "production"),
    where("factoryId", "==", factoryId),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<=", Timestamp.fromDate(end)),
  );

  const snap = await getDocs(q);

  tableBody.innerHTML = "";

  if (snap.empty) {
    tableBody.innerHTML = `
      <tr><td colspan="6">No production found</td></tr>
    `;
    return;
  }

  snap.forEach((docSnap) => {
    const d = docSnap.data();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>Machine ${d.machineNumber}</td>
      <td>${d.workerName}</td>
      <td>${d.takaNo}</td>
      <td>${d.meters}</td>
      <td>${d.shift}</td>
      <td>        
        <button onclick="deleteProduction('${docSnap.id}')">
          Delete
        </button>
      </td>
    `;

    tableBody.appendChild(tr);
  });
});

window.deleteProduction=async function deleteProduction(id) {
  const ok = await confirmOwnerPassword();
  if (!ok) return;

  await deleteDoc(doc(db, "production", id));

  await logAudit(
    factoryId,
    "DELETE_PRODUCTION",
    "production",
    id,
    "Deleted production entry",
  );

  alert("Entry deleted");
  loadBtn.click(); // reload same day
}