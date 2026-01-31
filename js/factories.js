import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
  doc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const factoryList = document.getElementById("factoryList");
const proceedBtn = document.querySelector(".proceedBtn");
const msg = document.getElementById("msg");

let allFactories = [];

/* ---------------- AUTH CHECK ---------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  await loadFactories(user.uid);
});

/* ---------------- LOAD FACTORIES ---------------- */
async function loadFactories(uid) {
  try {
    factoryList.innerHTML = "Loading...";

    const q = query(
      collection(db, "factories"),
      where("createdBy", "==", uid),
      where("isActive", "==", true),
    );

    const snapshot = await getDocs(q);

    allFactories = [];
    snapshot.forEach((docSnap) => {
      allFactories.push({
        id: docSnap.id,
        ...docSnap.data(),
      });
    });

    renderFactories(allFactories);
  } catch (err) {
    console.error("Load factories failed:", err);
    msg.innerText = "Failed to load factories";
  }
}

/* ---------------- RENDER FACTORIES ---------------- */
function renderFactories(factories) {
  factoryList.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.textContent = factories.length
    ? "Choose a factory..."
    : "No factories found";
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;

  factoryList.appendChild(placeholder);

  factories.forEach((factory) => {
    const option = document.createElement("option");
    option.value = factory.id;
    option.textContent = factory.name;
    factoryList.appendChild(option);
  });
}

/* ---------------- PROCEED BUTTON ---------------- */
proceedBtn.addEventListener("click", () => {
  const factoryId = factoryList.value;

  if (!factoryId) {
    msg.innerText = "Please select a factory";
    return;
  }

  const factory = allFactories.find((f) => f.id === factoryId);

  if (!factory) {
    msg.innerText = "Invalid factory selection";
    return;
  }

  sessionStorage.setItem("factoryId", factory.id);
  sessionStorage.setItem("factoryName", factory.name);

  window.location.href = "dashboard.html";
});

/* ---------------- CREATE FACTORY ---------------- */
document
  .getElementById("createFactoryBtn")
  .addEventListener("click", async () => {
    msg.innerText = "";

    const name = document.getElementById("factoryName").value.trim();
    const machineCount = Number(document.getElementById("machineCount").value);
    const user = auth.currentUser;

    if (!user) {
      msg.innerText = "Not authenticated";
      return;
    }

    if (!name || machineCount <= 0) {
      msg.innerText = "Invalid input";
      return;
    }

    try {
      const factoryRef = await addDoc(collection(db, "factories"), {
        name,
        machineCount,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        isActive: true,
      });

      const batch = writeBatch(db);

      for (let i = 1; i <= machineCount; i++) {
        const machineRef = doc(
          db,
          "factories",
          factoryRef.id,
          "machines",
          `machine_${i}`,
        );

        batch.set(machineRef, {
          machineNumber: i,
          status: "idle",
          isActive: true,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      msg.innerText = "Factory created successfully";
      msg.style.color = "green";

      document.getElementById("factoryName").value = "";
      document.getElementById("machineCount").value = "";

      await loadFactories(user.uid);
    } catch (err) {
      console.error("Create factory failed:", err);
      msg.innerText = "Error creating factory";
    }
  });
