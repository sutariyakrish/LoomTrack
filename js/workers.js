import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { confirmOwnerPassword } from "./confirmPassword.js";
import { logAudit } from "./audit.js";

import {
  deleteDoc  
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const workerList = document.getElementById("workerList");
const msg = document.getElementById("msg");

let factoryId = null;

/* ---------- AUTH + FACTORY CHECK ---------- */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  factoryId = sessionStorage.getItem("factoryId");

  if (!factoryId) {
    window.location.href = "factories.html";
    return;
  }

  loadWorkers();
});

/* ---------- LOAD WORKERS ---------- */
const tableBody = document.getElementById("workerTableBody");

async function loadWorkers() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="4">Loading...</td>
    </tr>
  `;

  const q = query(
    collection(db, "workers"),
    where("factoryId", "==", factoryId),
    where("isActive", "==", true)
  );

  const snapshot = await getDocs(q);
  tableBody.innerHTML = "";

  if (snapshot.empty) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4">No workers added yet</td>
      </tr>
    `;
    return;
  }

  // 1️⃣ Collect workers
  const workers = [];
  snapshot.forEach(docSnap => {
    workers.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  // 2️⃣ Sort alphabetically (A → Z, case-insensitive)
  workers.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  // 3️⃣ Render sorted workers
  let index = 1;
  workers.forEach(worker => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${index++}</td>
      <td>${worker.name}</td>
      <td>${worker.phone || "-"}</td>
      <td>
        <button onclick="deleteWorker('${worker.id}')">Delete</button>
      </td>
    `;

    tableBody.appendChild(tr);
  });
}



/* ---------- ADD WORKER ---------- */
document.getElementById("addWorkerBtn").addEventListener("click", async () => {
  msg.textContent = "";

  const name = document.getElementById("workerName").value.trim();
  const phone = document.getElementById("workerPhone").value.trim();

  if (!name) {
    msg.textContent = "Worker name is required";
    return;
  }

  // Optional phone validation (basic)
  if (phone && !/^[0-9]{10}$/.test(phone)) {
    msg.textContent = "Phone number must be 10 digits";
    return;
  }

  await addDoc(collection(db, "workers"), {
    factoryId: factoryId,
    name: name,
    phone: phone || null,
    isActive: true,
    createdAt: serverTimestamp(),
  });

  document.getElementById("workerName").value = "";
  document.getElementById("workerPhone").value = "";

  msg.textContent = "Worker added successfully";
  loadWorkers();
});

/* ---------- SOFT DELETE ---------- */
async function deleteWorker(workerId) {
  const ok = await confirmOwnerPassword();
  if (!ok) return;

  await deleteDoc(doc(db, "workers", workerId));

  await logAudit(
    factoryId,
    "DELETE_WORKER",
    "worker",
    workerId,
    "Worker deleted"
  );

  alert("Worker deleted successfully");
  loadWorkers(); // refresh table
}


window.deleteWorker = deleteWorker;