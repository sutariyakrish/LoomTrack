import { db, auth } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { formatWorkerLabel } from "./workerLabel.js";

/* ---------------- ELEMENTS ---------------- */
const dateMode = document.getElementById("dateMode");
const singleDay = document.getElementById("singleDay");
const fromDate = document.getElementById("fromDate");
const toDate = document.getElementById("toDate");
const monthSelect = document.getElementById("monthSelect");
const tableType = document.getElementById("tableType");
let cachedData = [];
const beamStatusFilter = document.getElementById("beamStatusFilter");
const exportBtn = document.getElementById("exportBtn");

const loadBtn = document.getElementById("loadReportBtn");

const reportHead = document.getElementById("reportHead");
const reportBody = document.getElementById("reportBody");

let factoryId = null;

/* ---------------- AUTH & FACTORY ---------------- */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  factoryId = sessionStorage.getItem("factoryId");
  if (!factoryId) {
    window.location.href = "factories.html";
  }
});

/* ---------------- DATE MODE HANDLING ---------------- */
dateMode.addEventListener("change", () => {
  singleDay.style.display = "none";
  fromDate.style.display = "none";
  toDate.style.display = "none";
  monthSelect.style.display = "none";

  if (dateMode.value === "day") singleDay.style.display = "block";
  if (dateMode.value === "range") {
    fromDate.style.display = "block";
    toDate.style.display = "block";
  }
  if (dateMode.value === "month") monthSelect.style.display = "block";
});

/* ---------------- RESOLVE DATE RANGE ---------------- */
function resolveDates() {
  let start, end;

  if (dateMode.value === "day" && singleDay.value) {
    start = new Date(singleDay.value + "T00:00:00");
    end = new Date(singleDay.value + "T23:59:59");
  }

  if (dateMode.value === "range" && fromDate.value && toDate.value) {
    start = new Date(fromDate.value + "T00:00:00");
    end = new Date(toDate.value + "T23:59:59");
  }

  if (dateMode.value === "month" && monthSelect.value) {
    const [year, month] = monthSelect.value.split("-");
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0, 23, 59, 59);
  }

  return { start, end };
}

/* ---------------- LOAD REPORTS ---------------- */
loadBtn.addEventListener("click", async () => {
  const { start, end } = resolveDates();

  if (!start || !end) {
    alert("Please select a valid time period");
    return;
  }

  reportHead.innerHTML = "";
  reportBody.innerHTML = `
    <tr><td colspan="2">Loading...</td></tr>
  `;

  try {
    const q = query(
      collection(db, "production"),
      where("factoryId", "==", factoryId),
      where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<=", Timestamp.fromDate(end)),
    );

    const snap = await getDocs(q);
    const data = snap.docs.map((d) => d.data());

    if (data.length === 0) {
      reportBody.innerHTML = `
        <tr><td colspan="2">No production data found</td></tr>
      `;

      return;
    }

    cachedData = data;
    renderTable();
  } catch (err) {
    console.error(err);
    alert("Failed to load report. Check index or network.");
  }
});
tableType.addEventListener("change", () => {
  if (cachedData.length) {
    renderTable();
  }
});
tableType.addEventListener("change", () => {
  if (tableType.value === "beam") {
    beamStatusFilter.style.display = "inline-block";
  } else {
    beamStatusFilter.style.display = "none";
  }

  if (cachedData.length) renderTable();
});

beamStatusFilter.addEventListener("change", () => {
  if (cachedData.length) renderTable();
});

exportBtn.addEventListener("click", () => {
  if (!cachedData.length) {
    alert("Load a report first");
    return;
  }

  const type = tableType.value;

  if (type === "worker") exportWorkerReport(cachedData);
  if (type === "machine") exportMachineReport(cachedData);
  if (type === "shift") exportShiftReport(cachedData);
  if (type === "beam") exportBeamReport(cachedData);
});

/* ---------------- WORKER REPORT TABLE ---------------- */
function renderWorkerReport(data) {
  reportHead.innerHTML = `
    <tr>
      <th>Worker</th>
      <th>Total Meters</th>
    </tr>
  `;

  const map = {};
  data.forEach(d => {
  if (!d.countInWorker) return;
  const label = d.workerLabel || d.workerName;
  map[label] = (map[label] || 0) + d.meters;
});


  reportBody.innerHTML = "";

  Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0])) // 👈 SORT BY NAME (A → Z)
    .forEach(([name, meters]) => {
      reportBody.innerHTML += `
        <tr>
          <td>${name}</td>
          <td>${meters}</td>
        </tr>
      `;
    });
}

function renderTable() {
  const type = tableType.value;
  if (type === "worker") renderWorkerReport(cachedData);
  if (type === "machine") renderMachineReport(cachedData);
  if (type === "shift") renderShiftReport(cachedData);
  if (type === "beam") renderBeamReport(cachedData);
  if (type === "taka") renderTakaReport(cachedData);
}
function renderMachineReport(data) {
  reportHead.innerHTML = `
    <tr>
      <th>Machine</th>
      <th>Total Meters</th>
    </tr>
  `;

  const map = {};

  data.forEach((d) => {
    const key = `Machine ${d.machineNumber}`;
    map[key] = (map[key] || 0) + d.meters;
    if (!d.countInWorker) return;

  });

  reportBody.innerHTML = "";

  Object.entries(map)
    .sort((a, b) => {
      const numA = parseInt(a[0].replace("Machine ", ""), 10);
      const numB = parseInt(b[0].replace("Machine ", ""), 10);
      return numA - numB; // 👈 sort by machine number (ascending)
    })
    .forEach(([machine, meters]) => {
      reportBody.innerHTML += `
        <tr>
          <td>${machine}</td>
          <td>${meters}</td>
        </tr>
      `;
    });
}

function renderShiftReport(data) {
  reportHead.innerHTML = `
    <tr>
      <th>Shift</th>
      <th>Total Meters</th>
    </tr>
  `;

  const map = {};

  data.forEach((d) => {
    map[d.shift] = (map[d.shift] || 0) + d.meters;
    if (!d.countInWorker) return;

  });

  reportBody.innerHTML = "";

  Object.entries(map).forEach(([shift, meters]) => {
    reportBody.innerHTML += `
      <tr>
        <td>${shift}</td>
        <td>${meters}</td>
      </tr>
    `;
  });
}
async function renderBeamReport(data) {
  reportHead.innerHTML = `
    <tr>
      <th>Beam No</th>
      <th>Machine</th>
      <th>Total</th>
      <th>Produced</th>
      <th>Bhidan</th>
      <th>Shortage %</th>
      <th>Status</th>
    </tr>
  `;

  reportBody.innerHTML = `
    <tr><td colspan="7">Loading beams...</td></tr>
  `;

  const showActive = beamStatusFilter.value === "active";

  // 1️⃣ Fetch beams by status
  const beamQuery = query(
    collection(db, "beams"),
    where("factoryId", "==", factoryId),
    where("isActive", "==", showActive),
  );

  const beamSnap = await getDocs(beamQuery);

  // 2️⃣ Produced meters per beam (from production data already loaded)
  const producedMap = {};
  data.forEach((d) => {
    producedMap[d.beamId] = (producedMap[d.beamId] || 0) + d.meters;
  });

  // 3️⃣ Sort beams by Beam No (ascending)
  const beams = beamSnap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }))
    .sort((a, b) =>
      a.beamNo.localeCompare(b.beamNo, undefined, { numeric: true }),
    );

  reportBody.innerHTML = "";

  if (beams.length === 0) {
    reportBody.innerHTML = `
      <tr><td colspan="7">No beams found</td></tr>
    `;
    return;
  }

  beams.forEach((beam) => {
    const produced = producedMap[beam.id] || 0;
    const bhidan = Math.max(beam.totalMeters - produced, 0);
    const shortage =
      beam.totalMeters > 0
        ? ((bhidan / beam.totalMeters) * 100).toFixed(2)
        : "0.00";

    const status =
      bhidan > 0
        ? "<span style='color:green'>OK</span>"
        : "<span style='color:red'>SHORT</span>";

    reportBody.innerHTML += `
      <tr>
        <td data-label="Beam No">${beam.beamNo}</td>
        <td>Machine ${beam.machineNumber}</td>
        <td>${beam.totalMeters}</td>
        <td>${produced}</td>
        <td>${bhidan}</td>
        <td>${shortage} %</td>
        <td>${status}</td>
      </tr>
    `;
  });
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
function exportWorkerReport(data) {
  const map = {};

  data.forEach((d) => {
    map[d.workerName] = (map[d.workerName] || 0) + d.meters;
  });

  const rows = [["Worker", "Total Meters"]];

  Object.entries(map).forEach(([name, meters]) => {
    rows.push([name, meters]);
  });

  downloadCSV("worker_report.csv", rows);
}
function exportMachineReport(data) {
  const map = {};

  data.forEach((d) => {
    const key = `Machine ${d.machineNumber}`;
    map[key] = (map[key] || 0) + d.meters;
  });

  const rows = [["Machine", "Total Meters"]];

  Object.entries(map).forEach(([machine, meters]) => {
    rows.push([machine, meters]);
  });

  downloadCSV("machine_report.csv", rows);
}
function exportShiftReport(data) {
  const map = {};

  data.forEach((d) => {
    map[d.shift] = (map[d.shift] || 0) + d.meters;
  });

  const rows = [["Shift", "Total Meters"]];

  Object.entries(map).forEach(([shift, meters]) => {
    rows.push([shift, meters]);
  });

  downloadCSV("shift_report.csv", rows);
}
async function exportBeamReport(data) {
  const showActive = beamStatusFilter.value === "active";

  const beamSnap = await getDocs(
    query(
      collection(db, "beams"),
      where("factoryId", "==", factoryId),
      where("isActive", "==", showActive),
    ),
  );

  const producedMap = {};
  data.forEach((d) => {
    producedMap[d.beamId] = (producedMap[d.beamId] || 0) + d.meters;
  });

  const rows = [
    ["Beam No", "Machine", "Total Meters", "Produced", "Bhidan", "Shortage %"],
  ];

  const beams = beamSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      a.beamNo.localeCompare(b.beamNo, undefined, { numeric: true }),
    );

  beams.forEach((b) => {
    const produced = producedMap[b.id] || 0;
    const bhidan = Math.max(b.totalMeters - produced, 0);
    const shortage =
      b.totalMeters > 0 ? ((bhidan / b.totalMeters) * 100).toFixed(2) : "0.00";

    rows.push([
      b.beamNo,
      `Machine ${b.machineNumber}`,
      b.totalMeters,
      produced,
      bhidan,
      shortage,
    ]);
  });

  downloadCSV("beam_report.csv", rows);
}
function renderTakaReport(data) {
  reportHead.innerHTML = `
    <tr>
      <th>Taka No</th>
      <th>Total Meters</th>
    </tr>
  `;

  const map = {};

  data.forEach((d) => {
    const taka = d.takaNo;
    map[taka] = (map[taka] || 0) + d.meters;
    if (!d.countInWorker) return;

  });

  reportBody.innerHTML = "";

  Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .forEach(([taka, meters]) => {
      reportBody.innerHTML += `
        <tr>
          <td>${taka}</td>
          <td>${meters}</td>
        </tr>
      `;
    });
}
