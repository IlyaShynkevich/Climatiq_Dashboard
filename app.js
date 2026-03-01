const EMISSION_FACTORS = {
  electricity: 0.4,
  gas: 5.3,
  travel: 0.28,
};

const scenarioDefinitions = [
  {
    id: "green-electricity",
    title: "Shift 20% to green energy",
    description: "Reduce purchased-grid electricity emissions by one fifth.",
    apply: (totals) => ({
      ...totals,
      electricity: totals.electricity * 0.8,
    }),
  },
  {
    id: "trim-travel",
    title: "Cut travel by 15%",
    description: "Swap some client trips for remote meetings and grouped visits.",
    apply: (totals) => ({
      ...totals,
      travel: totals.travel * 0.85,
    }),
  },
  {
    id: "efficiency-package",
    title: "Efficiency + heating tune-up",
    description: "Reduce electricity by 10% and gas by 12% through efficiency work.",
    apply: (totals) => ({
      ...totals,
      electricity: totals.electricity * 0.9,
      gas: totals.gas * 0.88,
    }),
  },
];

const defaultRows = [
  { month: "", electricity: 0, gas: 0, travel: 0 },
];

const state = {
  rows: [...defaultRows],
};

const rowTemplate = document.getElementById("rowTemplate");
const dataRows = document.getElementById("dataRows");
const scenarioGrid = document.getElementById("scenarioGrid");
const addMonthBtn = document.getElementById("addMonthBtn");
const clearDataBtn = document.getElementById("clearDataBtn");
const fileInput = document.getElementById("fileInput");
const importStatusEl = document.getElementById("importStatus");

const totalEl = document.getElementById("totalEmissions");
const averageEl = document.getElementById("averageMonthly");
const topCategoryEl = document.getElementById("topCategory");
const annualTotalEl = document.getElementById("annualTotal");
const bestMonthEl = document.getElementById("bestMonth");

const trendCanvas = document.getElementById("trendChart");
const categoryCanvas = document.getElementById("categoryChart");

function formatKg(value) {
  return `${Math.round(value).toLocaleString()} kg CO2e`;
}

function setImportStatus(message, type = "") {
  importStatusEl.textContent = message;
  importStatusEl.className = `import-status${type ? ` ${type}` : ""}`;
}

function formatMonth(raw, includeYear = true) {
  if (!raw) return "--";
  const [year, month] = raw.split("-");
  const options = includeYear
    ? { month: "short", year: "numeric" }
    : { month: "short" };

  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", options);
}

function shouldIncludeYearForAxis(rows, index) {
  if (index === 0) return true;
  const currentMonth = rows[index]?.month || "";
  const previousMonth = rows[index - 1]?.month || "";
  const currentYear = currentMonth.split("-")[0];
  const previousYear = previousMonth.split("-")[0];
  return currentYear !== previousYear;
}

function formatMonthShort(raw) {
  return formatMonth(raw, false);
}

function calculateRowEmissions(row) {
  return {
    electricity: Number(row.electricity || 0) * EMISSION_FACTORS.electricity,
    gas: Number(row.gas || 0) * EMISSION_FACTORS.gas,
    travel: Number(row.travel || 0) * EMISSION_FACTORS.travel,
  };
}

function normalizeImportedRow(row) {
  return {
    month: String(row.month || "").trim(),
    electricity: Number(row.electricity || 0),
    gas: Number(row.gas || 0),
    travel: Number(row.travel || 0),
  };
}

function createBlankRow(month = "") {
  return {
    month,
    electricity: 0,
    gas: 0,
    travel: 0,
  };
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("The CSV file is empty or only contains a header.");
  }

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const requiredHeaders = ["month", "electricity", "gas", "travel"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());
    const rawRow = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ""]));
    const row = normalizeImportedRow(rawRow);

    if (row.month && !/^\d{4}-\d{2}$/.test(row.month)) {
      throw new Error(`Invalid month format on row ${index + 2}. Use YYYY-MM.`);
    }

    ["electricity", "gas", "travel"].forEach((field) => {
      if (!Number.isFinite(row[field]) || row[field] < 0) {
        throw new Error(`Invalid ${field} value on row ${index + 2}.`);
      }
    });

    return row;
  });

  if (rows.length === 0) {
    throw new Error("No data rows were found in the CSV file.");
  }

  return rows;
}

function getComputedRows() {
  return state.rows.map((row) => {
    const breakdown = calculateRowEmissions(row);
    const total = breakdown.electricity + breakdown.gas + breakdown.travel;
    return { ...row, breakdown, total };
  });
}

function sumCategories(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.electricity += row.breakdown.electricity;
      acc.gas += row.breakdown.gas;
      acc.travel += row.breakdown.travel;
      return acc;
    },
    { electricity: 0, gas: 0, travel: 0 },
  );
}

function renderRows(computedRows = getComputedRows()) {
  dataRows.innerHTML = "";

  state.rows.forEach((row, index) => {
    const fragment = rowTemplate.content.cloneNode(true);
    const tr = fragment.querySelector("tr");
    const monthInput = fragment.querySelector(".month-input");
    const metricInputs = fragment.querySelectorAll(".metric-input");
    const totalCell = fragment.querySelector(".row-total");
    const removeButton = fragment.querySelector(".remove-row");

    monthInput.value = row.month;
    monthInput.addEventListener("input", (event) => {
      state.rows[index].month = event.target.value;
      updateDashboard();
    });

    metricInputs.forEach((input) => {
      const field = input.dataset.field;
      input.value = row[field];
      input.addEventListener("input", (event) => {
        state.rows[index][field] = Number(event.target.value) || 0;
        updateDashboard();
      });
    });

    totalCell.textContent = formatKg(computedRows[index].total);
    removeButton.disabled = state.rows.length === 1;
    removeButton.addEventListener("click", () => {
      if (state.rows.length === 1) return;
      state.rows.splice(index, 1);
      render();
    });

    dataRows.appendChild(tr);
  });
}

function updateRowTotals(computedRows) {
  const totalCells = dataRows.querySelectorAll(".row-total");
  totalCells.forEach((cell, index) => {
    cell.textContent = formatKg(computedRows[index]?.total || 0);
  });
}

function renderSummary(computedRows) {
  const totals = sumCategories(computedRows);
  const totalEmissions = totals.electricity + totals.gas + totals.travel;
  const average = computedRows.length ? totalEmissions / computedRows.length : 0;

  const categoryRanking = [
    ["Electricity", totals.electricity],
    ["Gas", totals.gas],
    ["Travel", totals.travel],
  ].sort((a, b) => b[1] - a[1]);

  const lowestMonth = totalEmissions > 0
    ? [...computedRows].sort((a, b) => a.total - b.total)[0]
    : null;

  totalEl.textContent = formatKg(totalEmissions);
  averageEl.textContent = formatKg(average);
  topCategoryEl.textContent = totalEmissions > 0 ? categoryRanking[0][0] : "--";
  annualTotalEl.textContent = formatKg(totalEmissions);
  bestMonthEl.textContent = lowestMonth
    ? `Lowest month: ${formatMonth(lowestMonth.month)} (${formatKg(lowestMonth.total)})`
    : "Lowest month: --";
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 320);
  const height = Math.max(rect.height, 260);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function drawAxes(ctx, width, height, padding) {
  ctx.strokeStyle = "rgba(41, 33, 27, 0.26)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
}

function drawTrendChart(computedRows) {
  const { ctx, width, height } = prepareCanvas(trendCanvas);
  const padding = {
    top: 26,
    right: 18,
    bottom: 92,
    left: 56,
  };
  ctx.clearRect(0, 0, width, height);

  const maxValue = Math.max(...computedRows.map((row) => row.total), 1);
  const yTicks = 4;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.strokeStyle = "rgba(41, 33, 27, 0.26)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();

  ctx.font = "13px Space Grotesk";
  ctx.fillStyle = "#4d4136";

  for (let tick = 0; tick <= yTicks; tick += 1) {
    const value = (maxValue / yTicks) * (yTicks - tick);
    const y = padding.top + (chartHeight / yTicks) * tick;
    ctx.strokeStyle = "rgba(41, 33, 27, 0.12)";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(value)} kg`, padding.left - 10, y + 4);
  }

  if (computedRows.every((row) => row.total === 0)) {
    ctx.fillStyle = "#6e6256";
    ctx.textAlign = "center";
    ctx.font = "15px Space Grotesk";
    ctx.fillText("Enter monthly data to see the emissions trend.", width / 2, height / 2);
    return;
  }

  const stepX = computedRows.length > 1 ? chartWidth / (computedRows.length - 1) : 0;

  ctx.strokeStyle = "#1e6b52";
  ctx.lineWidth = 4;
  ctx.beginPath();

  computedRows.forEach((row, index) => {
    const x = padding.left + stepX * index;
    const y = height - padding.bottom - (row.total / maxValue) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  computedRows.forEach((row, index) => {
    const x = padding.left + stepX * index;
    const y = height - padding.bottom - (row.total / maxValue) * chartHeight;
    ctx.fillStyle = "#fffaf3";
    ctx.strokeStyle = "#1e6b52";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#4d4136";
    ctx.font = "12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(formatMonthShort(row.month), x, height - 52);
  });

  const yearSegments = [];
  computedRows.forEach((row, index) => {
    const year = row.month ? row.month.split("-")[0] : "";
    if (!yearSegments.length || yearSegments[yearSegments.length - 1].year !== year) {
      yearSegments.push({ year, start: index, end: index });
    } else {
      yearSegments[yearSegments.length - 1].end = index;
    }
  });

  yearSegments.forEach((segment) => {
    const startX = padding.left + stepX * segment.start;
    const endX = padding.left + stepX * segment.end;
    const lineY = height - 28;
    const labelY = height - 8;

    ctx.strokeStyle = "rgba(41, 33, 27, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, lineY);
    ctx.lineTo(endX, lineY);
    ctx.stroke();

    ctx.fillStyle = "#4d4136";
    ctx.font = "12px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(segment.year || "--", (startX + endX) / 2, labelY);
  });
}

function drawCategoryChart(computedRows) {
  const { ctx, width, height } = prepareCanvas(categoryCanvas);
  const padding = 56;
  const totals = sumCategories(computedRows);
  const entries = [
    ["Electricity", totals.electricity, "#1e6b52"],
    ["Gas", totals.gas, "#d87d4d"],
    ["Travel", totals.travel, "#d4b15a"],
  ];
  const maxValue = Math.max(...entries.map((entry) => entry[1]), 1);

  ctx.clearRect(0, 0, width, height);
  drawAxes(ctx, width, height, padding);

  if (entries.every((entry) => entry[1] === 0)) {
    ctx.fillStyle = "#6e6256";
    ctx.textAlign = "center";
    ctx.font = "15px Space Grotesk";
    ctx.fillText("Category totals will appear once you enter data.", width / 2, height / 2);
    return;
  }

  const chartWidth = width - padding * 2;
  const slotWidth = chartWidth / entries.length;
  const barWidth = Math.min(110, Math.max(36, slotWidth * 0.62));

  entries.forEach(([label, value, color], index) => {
    const slotStart = padding + slotWidth * index;
    const x = slotStart + (slotWidth - barWidth) / 2;
    const barHeight = (value / maxValue) * (height - padding * 2);
    const y = height - padding - barHeight;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#29211b";
    ctx.font = "13px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText(label, x + barWidth / 2, height - 24);
    ctx.fillText(`${Math.round(value)} kg`, x + barWidth / 2, y - 10);
  });
}

function renderScenarios(computedRows) {
  const totals = sumCategories(computedRows);
  const baselineTotal = totals.electricity + totals.gas + totals.travel;
  scenarioGrid.innerHTML = "";

  scenarioDefinitions.forEach((scenario) => {
    const adjusted = scenario.apply(totals);
    const scenarioTotal = adjusted.electricity + adjusted.gas + adjusted.travel;
    const savings = baselineTotal - scenarioTotal;
    const card = document.createElement("article");
    card.className = "scenario-card";
    const scenarioLabel = scenario.id.split("-").join(" ");
    card.innerHTML = `
      <div class="scenario-copy">
        <p>${scenarioLabel}</p>
        <h3>${scenario.title}</h3>
        <p>${scenario.description}</p>
      </div>
      <div>
        <p class="scenario-metric">${Math.round(savings).toLocaleString()} kg</p>
        <p>${Math.round((savings / Math.max(baselineTotal, 1)) * 100)}% reduction vs baseline</p>
      </div>
      <button type="button">New total: ${Math.round(scenarioTotal).toLocaleString()} kg</button>
    `;
    scenarioGrid.appendChild(card);
  });
}

function updateDashboard() {
  const computedRows = getComputedRows();
  const sortedRows = [...computedRows].sort((a, b) => a.month.localeCompare(b.month));
  updateRowTotals(computedRows);
  renderSummary(sortedRows);
  drawTrendChart(sortedRows);
  drawCategoryChart(sortedRows);
  renderScenarios(sortedRows);
}

function render() {
  const computedRows = getComputedRows();
  renderRows(computedRows);
  updateDashboard();
}

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const text = await file.text();
    const importedRows = parseCsv(text);
    state.rows = importedRows;
    render();
    setImportStatus(`Loaded ${importedRows.length} month${importedRows.length === 1 ? "" : "s"} from ${file.name}.`, "success");
  } catch (error) {
    setImportStatus(error.message || "Could not load the CSV file.", "error");
  } finally {
    fileInput.value = "";
  }
});

addMonthBtn.addEventListener("click", () => {
  const latestMonth = state.rows[state.rows.length - 1]?.month || "2026-01";
  const date = new Date(`${latestMonth}-01T00:00:00`);
  date.setMonth(date.getMonth() + 1);
  state.rows.push(createBlankRow(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`));
  render();
});

clearDataBtn.addEventListener("click", () => {
  state.rows = [createBlankRow()];
  setImportStatus("Dashboard cleared. Load a CSV file or enter values manually.");
  render();
});

window.addEventListener("resize", updateDashboard);

setImportStatus("Load a CSV file or enter values manually.");
render();
