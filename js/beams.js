import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  serverTimestamp,
  doc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { loadMachinesOnce } from "./loadMachines.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const machineInput = document.getElementById("machineNumberInput");

const beamInfo = document.getElementById("beamInfo");
const addBeamSection = document.getElementById("addBeamSection");
const addBeamBtn = document.getElementById("addBeamBtn");

let factoryId = null;
let selectedMachine = null;

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

  // ✅ add listener ONLY AFTER factoryId is ready
  machineInput.addEventListener("change", handleMachineInput);
});

/* ---------- LOAD MACHINES ---------- */

async function handleMachineInput() {
  if (!factoryId) return; // 🛡️ safety net

  const machineNo = Number(machineInput.value);
  if (!machineNo) return;

  const machines = await loadMachinesOnce(factoryId);

  const machine = machines.find((m) => m.machineNumber === machineNo);

  if (!machine) {
    alert("Invalid machine number");
    selectedMachine = null;
    return;
  }

  selectedMachine = {
    id: machine.id,
    number: Number(machine.machineNumber),
  };
  if (!selectedMachine?.id) {
    alert("Machine loaded but ID missing. Reload page.");
    return;
  }

  checkActiveBeam();
}

/* ---------- CHECK ACTIVE BEAM ---------- */
async function checkActiveBeam() {
  if (!selectedMachine) return;

  const q = query(
    collection(db, "beams"),
    where("factoryId", "==", factoryId),
    where("machineId", "==", selectedMachine.id),
    where("isActive", "==", true),
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    beamInfo.textContent = `No active beam on Machine ${selectedMachine.number}`;
    addBeamSection.style.display = "block";
    return;
  }

  const beamDoc = snap.docs[0];
  const beam = beamDoc.data();

  beamInfo.innerHTML = "Calculating beam stats...";

  const stats = await calculateBeamStats(beamDoc.id, beam.totalMeters);

  beamInfo.innerHTML = `
    <strong>Machine Number:</strong> ${beam.machineNumber}<br>
    <strong>Active Beam:</strong> ${beam.beamNo}<br>
    <strong>Total Meters:</strong> ${beam.totalMeters} m<br>
    <strong>Produced:</strong> ${stats.produced} m<br>
    <strong>Bhidan:</strong> ${stats.bhidan} m<br>
    <strong>Shortage %:</strong> ${stats.shortagePercent} %
  `;

  addBeamSection.style.display = "block";
}

/* ---------- ADD NEW BEAM ---------- */
addBeamBtn.addEventListener("click", async () => {
  if (!selectedMachine) {
    alert("Enter a valid machine number first");
    return;
  }

  const beamNo = document.getElementById("beamNo").value.trim();
  const meters = Number(document.getElementById("beamMeters").value);

  if (!beamNo || meters <= 0) {
    alert("Enter valid beam details");
    return;
  }

  // Close old active beam
  const q = query(
    collection(db, "beams"),
    where("factoryId", "==", factoryId),
    where("machineId", "==", selectedMachine.id),
    where("isActive", "==", true),
  );

  const snap = await getDocs(q);

  for (const b of snap.docs) {
    await updateDoc(doc(db, "beams", b.id), {
      isActive: false,
      endDate: serverTimestamp(),
    });
  }

  // ✅ ADD NEW BEAM (ONLY FROM selectedMachine)
  await addDoc(collection(db, "beams"), {
    factoryId,
    machineId: selectedMachine.id,
    machineNumber: Number(selectedMachine.number),
    beamNo,
    totalMeters: meters,
    isActive: true,
    startDate: serverTimestamp(),
    endDate: null,
    createdAt: serverTimestamp(),
  });

  alert("Beam added successfully");

  document.getElementById("beamNo").value = "";
  document.getElementById("beamMeters").value = "";

  checkActiveBeam();
});

async function calculateBeamStats(beamId, totalMeters) {
  const q = query(collection(db, "production"), where("beamId", "==", beamId));

  const snap = await getDocs(q);

  let produced = 0;
  snap.forEach((d) => {
    produced += d.data().meters;
  });

  const bhidan = Math.max(totalMeters - produced, 0);
  const shortagePercent =
    totalMeters > 0 ? ((bhidan / totalMeters) * 100).toFixed(2) : 0;

  return {
    produced,
    bhidan,
    shortagePercent,
  };
}
