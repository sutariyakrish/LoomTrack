import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { confirmOwnerPassword } from "./confirmPassword.js";
import { logAudit } from "./audit.js";
import { formatWorkerLabel } from "./workerLabel.js";
const cache = {
  assignments: [],
  workerLabels: {},
};

const msg = document.getElementById("msg");
const tableBody = document.getElementById("workerTableBody");
let factoryMachines = [];
const fromInput = document.getElementById("fromMachine");
const toInput = document.getElementById("toMachine");
const rangeError = document.getElementById("rangeError");

let factoryId = null;
let selectedWorkerId = null;
let selectedWorkerName = null;
let tempRanges = [];
/* ---------- AUTH ---------- */
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

  await loadFactoryMachines();
  await loadWorkerLabels(); // 🔥 REQUIRED
  loadWorkers();
});

async function loadFactoryMachines() {
  const snap = await getDocs(
    collection(db, "factories", factoryId, "machines"),
  );

  factoryMachines = snap.docs.map((d) => Number(d.data().machineNumber));
}

/* ---------- LOAD WORKERS ---------- */
async function loadWorkers() {
  tableBody.innerHTML = `
    <tr><td colspan="3">Loading...</td></tr>
  `;

  const q = query(
    collection(db, "workers"),
    where("factoryId", "==", factoryId),
    where("isActive", "==", true),
  );

  const snap = await getDocs(q);
  tableBody.innerHTML = "";

  if (snap.empty) {
    tableBody.innerHTML = `<tr><td colspan="3">No workers yet</td></tr>`;
    return;
  }

  const workers = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  workers.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  let i = 1;
  workers.forEach((w) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i++}</td>
      <td>${cache.workerLabels[w.id] || w.name}</td>
      <td>
        <button onclick="openAssign('${w.id}','${w.name}')">Assign</button>
        <button onclick="removeWorker('${w.id}')">Delete</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

/* ---------- ADD WORKER ---------- */
document.getElementById("addWorkerBtn").addEventListener("click", async () => {
  msg.textContent = "";

  const name = document.getElementById("workerName").value.trim();
  if (!name) {
    msg.textContent = "Worker name required";
    return;
  }

  await addDoc(collection(db, "workers"), {
    factoryId,
    name,
    isActive: true,
    createdAt: serverTimestamp(),
  });

  document.getElementById("workerName").value = "";
  msg.textContent = "Worker added";

  loadWorkers();
});

/* ---------- DELETE WORKER ---------- */

/* ---------- ASSIGN RANGES ---------- */
window.openAssign = async (workerId, workerName) => {
  selectedWorkerId = workerId;
  selectedWorkerName = workerName;

  document.getElementById("assignSection").style.display = "block";
  document.getElementById("assignWorkerName").innerText = workerName;

  await loadActiveAssignment(workerId);

  const q = query(
    collection(db, "assignments"),
    where("factoryId", "==", factoryId),
    where("status", "==", "active"),
  );

  const snap = await getDocs(q);

  cache.assignments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cache.workerLabels = {};

  cache.assignments.forEach((a) => {
    cache.workerLabels[a.workerId] = formatWorkerLabel(a.workerName, a.ranges);
  });

  // 🔥 refresh table so labels appear
  loadWorkers();
};

document.getElementById("saveRangeBtn").addEventListener("click", () => {
  // reset UI
  rangeError.textContent = "";
  fromInput.classList.remove("input-error");
  toInput.classList.remove("input-error");

  const from = Number(fromInput.value);
  const to = Number(toInput.value);

  // basic validation
  if (!from || !to || from > to) {
    rangeError.textContent = "Invalid machine range";
    fromInput.classList.add("input-error");
    toInput.classList.add("input-error");
    return;
  }

  // machine existence validation
  for (let i = from; i <= to; i++) {
    if (!factoryMachines.includes(i)) {
      rangeError.textContent = `Machine ${i} does not exist`;
      if (i === from) fromInput.classList.add("input-error");
      if (i === to) toInput.classList.add("input-error");
      return;
    }
  }

  // overlap validation
  for (const r of tempRanges) {
    if (from <= r.to && to >= r.from) {
      rangeError.textContent = "This range overlaps with an existing range";
      fromInput.classList.add("input-error");
      toInput.classList.add("input-error");
      return;
    }
  }

  // ✅ valid range
  tempRanges.push({ from, to });

  fromInput.value = "";
  toInput.value = "";

  renderTempRanges();
});

window.removeWorker = async (workerId) => {
  const ok = await confirmOwnerPassword();
  if (!ok) return;

  await deleteDoc(doc(db, "workers", workerId));

  await logAudit(
    factoryId,
    "DELETE_WORKER",
    "worker",
    workerId,
    "Worker deleted",
  );

  loadWorkers();
};

function renderTempRanges() {
  const list = document.getElementById("rangeList");
  list.innerHTML = "";

  tempRanges.forEach((r, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${r.from} - ${r.to}
      <button onclick="removeTempRange(${index})">X</button>
    `;
    list.appendChild(li);
  });
}
window.removeTempRange = (index) => {
  tempRanges.splice(index, 1);
  renderTempRanges();
};
document
  .getElementById("saveAssignmentBtn")
  .addEventListener("click", async () => {
    if (!selectedWorkerId || tempRanges.length === 0) {
      alert("Add at least one machine range");
      return;
    }

    // 1️⃣ Find existing active assignment
    const q = query(
      collection(db, "assignments"),
      where("factoryId", "==", factoryId),
      where("workerId", "==", selectedWorkerId),
      where("status", "==", "active"),
    );

    const snap = await getDocs(q);

    // 2️⃣ Close old assignment (if exists)
    for (const d of snap.docs) {
      await updateDoc(doc(db, "assignments", d.id), {
        status: "inactive",
        validTo: serverTimestamp(),
        isActive: false,
        deletedAt: serverTimestamp(),
      });
    }

    // 3️⃣ Create new assignment
    await addDoc(collection(db, "assignments"), {
      factoryId, // 👈 ADD THIS
      workerId: selectedWorkerId,
      workerName: selectedWorkerName,
      ranges: tempRanges,
      status: "active",
      validFrom: serverTimestamp(),
      validTo: null,
      createdAt: serverTimestamp(),
    });

    tempRanges = [];
    renderTempRanges();

    document.getElementById("assignSection").style.display = "none";

    alert("Assignment saved successfully");
    await loadWorkerLabels();
    loadWorkers();
  });

async function loadActiveAssignment(workerId) {
  const q = query(
    collection(db, "assignments"),
    where("factoryId", "==", factoryId),
    where("workerId", "==", workerId),
    where("status", "==", "active"),
  );

  const snap = await getDocs(q);

  if (!snap.empty) {
    tempRanges = [...snap.docs[0].data().ranges];
  } else {
    tempRanges = [];
  }

  renderTempRanges();
}
async function loadWorkerLabels() {
  cache.workerLabels = {};

  const q = query(
    collection(db, "assignments"),
    where("factoryId", "==", factoryId),
    where("status", "==", "active"),
  );

  const snap = await getDocs(q);

  snap.docs.forEach((d) => {
    const a = d.data();
    cache.workerLabels[a.workerId] = formatWorkerLabel(a.workerName, a.ranges);
  });
}
