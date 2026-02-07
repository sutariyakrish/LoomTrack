// loadMachines.js
import { db } from "./firebase.js";
import { collection, getDocs } from
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

let cached = {};

export async function loadMachinesOnce(factoryId) {
  if (cached[factoryId]) return cached[factoryId];

  const snap = await getDocs(
    collection(db, "factories", factoryId, "machines")
  );

  const machines = snap.docs.map(d => ({
    id: d.id,                              // ✅ REQUIRED
    machineNumber: Number(d.data().machineNumber) // ✅ REQUIRED
  }));

  cached[factoryId] = machines;
  return machines;
}
