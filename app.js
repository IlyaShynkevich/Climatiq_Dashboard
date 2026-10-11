// Fixed activity-to-emissions factors used everywhere in the dashboard.
const EMISSION_FACTORS = {
  electricity: 0.4,
  gas: 5.3,
  travel: 0.28,
};

const defaultRows = [
  { month: "", electricity: 0, gas: 0, travel: 0 },
];

// Keep mutable dashboard data in one place so every render pass derives from the same source.
const state = {
  rows: [...defaultRows],
};

// Cache the DOM nodes once; the render functions update these references in place.
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
const bestMonthEl = document.getElementById("bestMonth");
const forecastModelEl = document.getElementById("forecastModel");
const forecastReasonEl = document.getElementById("forecastReason");
const forecastTotalEl = document.getElementById("forecastTotal");
const forecastConfidenceEl = document.getElementById("forecastConfidence");
const forecastTableBodyEl = document.getElementById("forecastTableBody");
const forecastNarrativeEl = document.getElementById("forecastNarrative");
const forecastListEl = document.getElementById("forecastList");
const forecastNoteEl = document.getElementById("forecastNote");

const trendCanvas = document.getElementById("trendChart");
const categoryCanvas = document.getElementById("categoryChart");

function formatKg(value) {
  return `${Math.round(value).toLocaleString()} kg CO2e`;
}

function formatKgOrPlaceholder(value) {
  return Number.isFinite(value) ? formatKg(value) : "--";
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

function monthToDate(rawMonth) {
  const [year, month] = rawMonth.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(rawMonth, offset) {
  const nextDate = monthToDate(rawMonth);
  nextDate.setMonth(nextDate.getMonth() + offset);
  return toMonthKey(nextDate);
}

function clampReduction(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

// CSV import stays strict so downstream calculations only run on predictable, validated rows.
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

function getAverageDelta(values) {
  if (values.length < 2) return 0;
  let deltaSum = 0;
  for (let index = 1; index < values.length; index += 1) {
    deltaSum += values[index] - values[index - 1];
  }
  return deltaSum / (values.length - 1);
}

function getPredictionInputs(rows, field) {
  const values = rows
    .map((row) => Number(row[field] || 0))
    .filter((value) => Number.isFinite(value));
  const recentValues = values.slice(-6);
  const latestValue = recentValues[recentValues.length - 1] || 0;
  const averageValue = recentValues.length
    ? recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length
    : 0;
  return {
    latestValue,
    averageValue,
    averageDelta: getAverageDelta(recentValues),
  };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

// Forecasting works on total emissions first, then reapportions the totals back to categories.
function applyScenarioToBreakdown(breakdown, scenario) {
  return {
    electricity: breakdown.electricity * (1 - clampReduction(scenario.electricityReduction) / 100),
    gas: breakdown.gas * (1 - clampReduction(scenario.gasReduction) / 100),
    travel: breakdown.travel * (1 - clampReduction(scenario.travelReduction) / 100),
  };
}

function buildScenarioForecast(forecastRows, scenario) {
  return forecastRows.map((row) => {
    const adjustedBreakdown = applyScenarioToBreakdown(row.breakdown, scenario);
    return {
      ...row,
      adjustedBreakdown,
      adjustedTotal: adjustedBreakdown.electricity + adjustedBreakdown.gas + adjustedBreakdown.travel,
    };
  });
}

function getCategoryShare(value, total) {
  return total > 0 ? value / total : 0;
}

function getMonthNumber(rawMonth) {
  return Number((rawMonth || "").split("-")[1]);
}

function formatMetric(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function calculateRmse(actuals, predictions) {
  if (!actuals.length || actuals.length !== predictions.length) return Number.NaN;
  const mse = actuals.reduce((sum, actual, index) => {
    const error = actual - predictions[index];
    return sum + error * error;
  }, 0) / actuals.length;
  return Math.sqrt(mse);
}

function calculateMae(actuals, predictions) {
  if (!actuals.length || actuals.length !== predictions.length) return Number.NaN;
  return actuals.reduce((sum, actual, index) => sum + Math.abs(actual - predictions[index]), 0) / actuals.length;
}

function calculateMape(actuals, predictions) {
  const safePairs = actuals.filter((actual) => Math.abs(actual) > 0.001);
  if (!safePairs.length || actuals.length !== predictions.length) return Number.NaN;
  const total = actuals.reduce((sum, actual, index) => {
    if (Math.abs(actual) <= 0.001) return sum;
    return sum + Math.abs((actual - predictions[index]) / actual);
  }, 0);
  return (total / safePairs.length) * 100;
}

function createMeanModel(trainValues) {
  const meanValue = average(trainValues);
  return {
    forecast(horizon) {
      return Array.from({ length: horizon }, () => meanValue);
    },
  };
}

function createNaiveModel(trainValues) {
  const lastValue = trainValues[trainValues.length - 1] || 0;
  return {
    forecast(horizon) {
      return Array.from({ length: horizon }, () => lastValue);
    },
  };
}

function createSeasonalNaiveModel(trainValues, seasonLength = 12) {
  return {
    forecast(horizon) {
      return Array.from({ length: horizon }, (_, index) => {
        const sourceIndex = trainValues.length - seasonLength + (index % seasonLength);
        return Math.max(0, trainValues[sourceIndex] || trainValues[trainValues.length - 1] || 0);
      });
    },
  };
}

// Estimate additive month-of-year effects by comparing each month against its season average.
function initializeSeasonals(values, seasonLength) {
  const seasonals = new Array(seasonLength).fill(0);
  const seasonCount = Math.floor(values.length / seasonLength);
  if (seasonCount < 2) return seasonals;
  const seasonAverages = Array.from({ length: seasonCount }, (_, seasonIndex) => {
    const start = seasonIndex * seasonLength;
    return average(values.slice(start, start + seasonLength));
  });

  for (let season = 0; season < seasonLength; season += 1) {
    let total = 0;
    let count = 0;
    for (let seasonIndex = 0; seasonIndex < seasonCount; seasonIndex += 1) {
      const value = values[seasonIndex * seasonLength + season];
      if (!Number.isFinite(value)) continue;
      total += value - seasonAverages[seasonIndex];
      count += 1;
    }
    seasonals[season] = count ? total / count : 0;
  }
  return seasonals;
}

function runHoltWinters(values, seasonLength, alpha, beta, gamma) {
  if (values.length < seasonLength * 2) return null;
  const seasonals = initializeSeasonals(values, seasonLength);
  let level = average(values.slice(0, seasonLength));
  let trend = (average(values.slice(seasonLength, seasonLength * 2)) - average(values.slice(0, seasonLength))) / seasonLength;
  let sse = 0;

  for (let index = seasonLength; index < values.length; index += 1) {
    const seasonalIndex = index % seasonLength;
    const actual = values[index];
    const prediction = level + trend + seasonals[seasonalIndex];
    const previousLevel = level;
    sse += (actual - prediction) * (actual - prediction);
    level = alpha * (actual - seasonals[seasonalIndex]) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasonals[seasonalIndex] = gamma * (actual - level) + (1 - gamma) * seasonals[seasonalIndex];
  }

  return { level, trend, seasonals, sse };
}

function createHoltWintersModel(trainValues, seasonLength = 12) {
  const parameterGrid = [0.2, 0.4, 0.6, 0.8];
  let bestFit = null;

  parameterGrid.forEach((alpha) => {
    parameterGrid.forEach((beta) => {
      parameterGrid.forEach((gamma) => {
        const fit = runHoltWinters(trainValues, seasonLength, alpha, beta, gamma);
        if (!fit) return;
        if (!bestFit || fit.sse < bestFit.sse) {
          bestFit = { ...fit, alpha, beta, gamma };
        }
      });
    });
  });

  if (!bestFit) return null;

  return {
    forecast(horizon) {
      return Array.from({ length: horizon }, (_, index) => {
        const step = index + 1;
        const seasonal = bestFit.seasonals[(trainValues.length + index) % seasonLength] || 0;
        return Math.max(0, bestFit.level + bestFit.trend * step + seasonal);
      });
    },
  };
}

function createProphetStyleModel(trainValues, trainMonths, seasonLength = 12) {
  if (trainValues.length < seasonLength) return null;
  const indices = trainValues.map((_, index) => index);
  const xMean = average(indices);
  const yMean = average(trainValues);
  const numerator = trainValues.reduce((sum, value, index) => sum + (index - xMean) * (value - yMean), 0);
  const denominator = trainValues.reduce((sum, _, index) => sum + (index - xMean) ** 2, 0);
  const slope = denominator ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;
  const residualsByMonth = Array.from({ length: seasonLength }, () => []);

  trainValues.forEach((value, index) => {
    const trendValue = intercept + slope * index;
    const monthIndex = (getMonthNumber(trainMonths[index]) || 1) - 1;
    residualsByMonth[monthIndex].push(value - trendValue);
  });

  const seasonalAdjustments = residualsByMonth.map((values) => average(values));

  return {
    forecast(horizon, forecastMonths = []) {
      return Array.from({ length: horizon }, (_, index) => {
        const overallIndex = trainValues.length + index;
        const fallbackMonthIndex = overallIndex % seasonLength;
        const monthIndex = forecastMonths[index] ? (getMonthNumber(forecastMonths[index]) || 1) - 1 : fallbackMonthIndex;
        return Math.max(0, intercept + slope * overallIndex + (seasonalAdjustments[monthIndex] || 0));
      });
    },
  };
}

function getForecastMonthKeys(lastMonth, horizon) {
  return Array.from({ length: horizon }, (_, index) => addMonths(lastMonth, index + 1));
}

function getRecentCategoryShares(computedRows) {
  const recentRows = computedRows.filter((row) => row.month).slice(-6);
  const totals = sumCategories(recentRows);
  const total = totals.electricity + totals.gas + totals.travel;
  if (total <= 0) {
    return { electricity: 1 / 3, gas: 1 / 3, travel: 1 / 3 };
  }
  return {
    electricity: totals.electricity / total,
    gas: totals.gas / total,
    travel: totals.travel / total,
  };
}

function buildForecastRowsFromTotals(computedRows, forecastTotals, forecastMonths) {
  const shares = getRecentCategoryShares(computedRows);
  return forecastTotals.map((total, index) => {
    const safeTotal = Math.max(0, total);
    const breakdown = {
      electricity: safeTotal * shares.electricity,
      gas: safeTotal * shares.gas,
      travel: safeTotal * shares.travel,
    };
    return {
      month: forecastMonths[index],
      breakdown,
      total: safeTotal,
    };
  });
}

function getModelDefinitions() {
  return [
    {
      key: "mean",
      label: "Mean",
      minimumLength: 2,
      build: (trainValues) => createMeanModel(trainValues),
    },
    {
      key: "naive",
      label: "Naive",
      minimumLength: 2,
      build: (trainValues) => createNaiveModel(trainValues),
    },
    {
      key: "seasonal-naive",
      label: "Seasonal naive",
      minimumLength: 12,
      build: (trainValues) => createSeasonalNaiveModel(trainValues, 12),
    },
    {
      key: "holt-winters",
      label: "Holt-Winters",
      minimumLength: 24,
      build: (trainValues) => createHoltWintersModel(trainValues, 12),
    },
    {
      key: "prophet-style",
      label: "Prophet-style",
      minimumLength: 12,
      build: (trainValues, trainMonths) => createProphetStyleModel(trainValues, trainMonths, 12),
    },
  ];
}

// Backtest one step ahead at each point in history so model selection mirrors real usage.
function evaluateModelWithRollingOrigin(definition, values, months) {
  const predictions = [];
  const actuals = [];

  for (let targetIndex = definition.minimumLength; targetIndex < values.length; targetIndex += 1) {
    const trainValues = values.slice(0, targetIndex);
    const trainMonths = months.slice(0, targetIndex);
    const targetMonth = months[targetIndex];
    const model = definition.build(trainValues, trainMonths);
    if (!model) continue;
    const prediction = model.forecast(1, [targetMonth])[0];
    if (!Number.isFinite(prediction)) continue;
    predictions.push(prediction);
    actuals.push(values[targetIndex]);
  }

  if (predictions.length === 0) {
    return {
      key: definition.key,
      label: definition.label,
      available: false,
      rmse: Number.NaN,
      mae: Number.NaN,
      mape: Number.NaN,
      evaluationPoints: 0,
      reason: `Needs more than ${definition.minimumLength} total months for backtesting.`,
    };
  }

  return {
    key: definition.key,
    label: definition.label,
    available: true,
    rmse: calculateRmse(actuals, predictions),
    mae: calculateMae(actuals, predictions),
    mape: calculateMape(actuals, predictions),
    evaluationPoints: predictions.length,
    predictions,
  };
}

function evaluateForecastModels(computedRows) {
  const datedRows = computedRows.filter((row) => row.month).sort((a, b) => a.month.localeCompare(b.month));
  const values = datedRows.map((row) => row.total);
  const months = datedRows.map((row) => row.month);

  // Forecasts stay locked until there is enough history to support either seasonality or benchmarking.
  if (datedRows.length < 12) {
    return {
      holdoutLength: 0,
      rows: getModelDefinitions().map((definition) => ({
        key: definition.key,
        label: definition.label,
        available: false,
        rmse: Number.NaN,
        mae: Number.NaN,
        mape: Number.NaN,
        evaluationPoints: 0,
        reason: "Need at least 12 total months before a useful forecast can be produced.",
      })),
      selected: null,
      forecastRows: [],
      forecastTotals: [],
      forecastMonths: [],
      availableCount: 0,
      totalMonths: datedRows.length,
      evaluationWindowLabel: "",
    };
  }

  if (datedRows.length < 24) {
    // With one full year available, repeat the prior season rather than pretending we can benchmark reliably.
    const forecastMonths = getForecastMonthKeys(months[months.length - 1], 3);
    const fallbackModel = createSeasonalNaiveModel(values, 12);
    const forecastTotals = fallbackModel.forecast(3, forecastMonths);
    const forecastRows = buildForecastRowsFromTotals(datedRows, forecastTotals, forecastMonths);
    return {
      holdoutLength: 0,
      rows: getModelDefinitions().map((definition) => ({
        key: definition.key,
        label: definition.label,
        available: false,
        rmse: Number.NaN,
        mae: Number.NaN,
        mape: Number.NaN,
        evaluationPoints: 0,
        reason: definition.key === "seasonal-naive"
          ? "Using seasonal naive as a short-history fallback because one full year is available."
          : "Benchmark locked until 24 months are available.",
      })),
      selected: {
        key: "seasonal-naive",
        label: "Seasonal naive",
        fallback: true,
      },
      forecastRows,
      forecastTotals,
      forecastMonths,
      availableCount: 0,
      totalMonths: datedRows.length,
      evaluationWindowLabel: "Short-history fallback",
    };
  }

  const modelRows = getModelDefinitions().map((definition) => evaluateModelWithRollingOrigin(definition, values, months));

  const availableRows = modelRows.filter((row) => row.available && Number.isFinite(row.rmse));
  const selected = [...availableRows].sort((a, b) => {
    if (a.rmse !== b.rmse) return a.rmse - b.rmse;
    if (a.mae !== b.mae) return a.mae - b.mae;
    return a.label.localeCompare(b.label);
  })[0] || null;

  if (!selected) {
    return {
      holdoutLength: 0,
      rows: modelRows,
      selected: null,
      forecastRows: [],
      forecastTotals: [],
      forecastMonths: [],
      availableCount: availableRows.length,
      totalMonths: datedRows.length,
      evaluationWindowLabel: "",
    };
  }

  const fullValues = values;
  const fullMonths = months;
  const fullModelDefinition = getModelDefinitions().find((model) => model.key === selected.key);
  const fullModel = fullModelDefinition?.build(fullValues, fullMonths);
  const forecastMonths = getForecastMonthKeys(months[months.length - 1], 3);
  const forecastTotals = fullModel ? fullModel.forecast(3, forecastMonths) : [];
  const forecastRows = buildForecastRowsFromTotals(datedRows, forecastTotals, forecastMonths);
  const evaluationWindowLabel = selected.evaluationPoints === 1
    ? "1 rolling validation month"
    : `${selected.evaluationPoints} rolling validation months`;

  return {
    holdoutLength: selected.evaluationPoints,
    rows: modelRows,
    selected,
    forecastRows,
    forecastTotals,
    forecastMonths,
    availableCount: availableRows.length,
    totalMonths: datedRows.length,
    evaluationWindowLabel,
  };
}

function describeSelectedModel(modelKey) {
  if (modelKey === "mean") return "The simple average won, which suggests the series is fairly stable and more complex structure did not add value.";
  if (modelKey === "naive") return "The last observed value won, which suggests the most recent month is the strongest guide for the next period.";
  if (modelKey === "seasonal-naive") return "Seasonal naive won, which suggests repeating the same month from the prior year is the clearest signal in the data.";
  if (modelKey === "holt-winters") return "Holt-Winters won, which suggests both trend and recurring seasonal movement matter in this dataset.";
  if (modelKey === "prophet-style") return "The Prophet-style model won, which suggests a decomposed trend plus month-of-year seasonality fits best.";
  return "No model could be selected from the current dataset.";
}

function buildNarrativeSentences(evaluation) {
  if (!evaluation.selected) {
    return [
      "The dashboard needs at least 12 dated months before it can produce a useful forecast.",
      "With less than a year of history, seasonality cannot be inferred in a defensible way.",
      "That means neither baseline nor seasonal models can be judged properly.",
      "Any number shown earlier would be weak evidence for an operational forecast.",
      "Load at least 12 dated months to unlock a short-history forecast, or 24 months for the full benchmark.",
    ];
  }

  if (evaluation.selected.fallback) {
    return [
      "The dataset spans one year, so the dashboard uses a short-history fallback instead of a fully benchmarked winner.",
      "Seasonal naive was chosen as the fallback because it repeats the same months from the most recent year.",
      "That usually gives more realistic month-to-month variation than mean or naive on a 12-month dataset.",
      "RMSE, MAE, and MAPE stay locked until at least 24 months are available for a fair rolling comparison.",
      "Load a second year of data to unlock the full benchmark and validate the selected model properly.",
    ];
  }

  const holdoutText = evaluation.holdoutLength === 12
    ? "We compared each model over 12 rolling validation months."
    : `We compared each model over ${evaluation.holdoutLength} rolling validation month${evaluation.holdoutLength === 1 ? "" : "s"}.`;
  const bestRmse = formatMetric(evaluation.selected.rmse);
  const bestMae = formatMetric(evaluation.selected.mae);
  const mapeText = Number.isFinite(evaluation.selected.mape) ? `${formatMetric(evaluation.selected.mape)}%` : "not reliable because some actual months are near zero";
  return [
    holdoutText,
    "The benchmark starts with mean, naive, and seasonal naive so complex models must beat simple baselines to be justified.",
    `The selected model is ${evaluation.selected.label} because it achieved the lowest RMSE (${bestRmse}) and a low MAE (${bestMae}) across the rolling validation window.`,
    `Its MAPE is ${mapeText}.`,
    describeSelectedModel(evaluation.selected.key),
  ];
}

// Recommendations are heuristic-based: summarize the footprint, then look for dominance, growth, and winter effects.
function analyzeDataset(computedRows) {
  const datedRows = computedRows.filter((row) => row.month).sort((a, b) => a.month.localeCompare(b.month));
  const totals = sumCategories(datedRows);
  const totalEmissions = totals.electricity + totals.gas + totals.travel;
  const entries = [
    { key: "electricity", label: "Electricity", value: totals.electricity },
    { key: "gas", label: "Gas", value: totals.gas },
    { key: "travel", label: "Travel", value: totals.travel },
  ].sort((a, b) => b.value - a.value);

  const rowCount = datedRows.length;
  const midpoint = Math.max(1, Math.floor(rowCount / 2));
  const firstHalf = datedRows.slice(0, midpoint);
  const secondHalf = datedRows.slice(midpoint);
  const firstHalfTravel = average(firstHalf.map((row) => row.breakdown.travel));
  const secondHalfTravel = average(secondHalf.map((row) => row.breakdown.travel));
  const firstHalfElectricity = average(firstHalf.map((row) => row.breakdown.electricity));
  const secondHalfElectricity = average(secondHalf.map((row) => row.breakdown.electricity));

  const winterRows = datedRows.filter((row) => ["12", "01", "02"].includes((row.month || "").split("-")[1]));
  const nonWinterRows = datedRows.filter((row) => !["12", "01", "02"].includes((row.month || "").split("-")[1]));
  const winterGas = average(winterRows.map((row) => row.breakdown.gas));
  const nonWinterGas = average(nonWinterRows.map((row) => row.breakdown.gas));

  return {
    rowCount,
    totals,
    totalEmissions,
    dominant: entries[0] || { key: "", label: "", value: 0 },
    secondLargest: entries[1] || { key: "", label: "", value: 0 },
    electricityShare: getCategoryShare(totals.electricity, totalEmissions),
    gasShare: getCategoryShare(totals.gas, totalEmissions),
    travelShare: getCategoryShare(totals.travel, totalEmissions),
    travelGrowthRatio: firstHalfTravel > 0 ? secondHalfTravel / firstHalfTravel : 1,
    electricityGrowthRatio: firstHalfElectricity > 0 ? secondHalfElectricity / firstHalfElectricity : 1,
    winterGasRatio: nonWinterGas > 0 ? winterGas / nonWinterGas : 1,
  };
}

function createRecommendedScenarios(computedRows) {
  const analysis = analyzeDataset(computedRows);
  const recommendations = [];

  if (analysis.rowCount < 2 || analysis.totalEmissions === 0) {
    return recommendations;
  }

  if (analysis.electricityShare >= 0.38 || analysis.dominant.key === "electricity") {
    recommendations.push({
      id: "recommended-electricity",
      name: "Electricity procurement shift",
      note: "Power is a leading driver in this dataset, so procurement and efficiency changes are the fastest lever.",
      reasonTitle: "Why this fits this dataset",
      reason: `Electricity contributes ${Math.round(analysis.electricityShare * 100)}% of total emissions, making it the largest opportunity.`,
      score: "High fit",
      electricityReduction: analysis.electricityShare >= 0.5 ? 18 : 12,
      gasReduction: 0,
      travelReduction: 0,
    });
  }

  if (analysis.winterGasRatio >= 1.25 || analysis.dominant.key === "gas") {
    recommendations.push({
      id: "recommended-gas",
      name: "Heating and controls tune-up",
      note: "Gas emissions rise materially in colder months, so seasonal efficiency work should pay back here.",
      reasonTitle: "Why this fits this dataset",
      reason: `Winter gas emissions are about ${Math.round((analysis.winterGasRatio - 1) * 100)}% higher than non-winter levels.`,
      score: "Seasonal fit",
      electricityReduction: 6,
      gasReduction: analysis.gasShare >= 0.4 ? 15 : 10,
      travelReduction: 0,
    });
  }

  if (analysis.travelShare >= 0.28 || analysis.travelGrowthRatio >= 1.15) {
    recommendations.push({
      id: "recommended-travel",
      name: "Travel policy optimization",
      note: "Travel is either growing or already material, so trip consolidation should reduce forecast pressure.",
      reasonTitle: "Why this fits this dataset",
      reason: analysis.travelGrowthRatio >= 1.15
        ? `Travel emissions in the later period are about ${Math.round((analysis.travelGrowthRatio - 1) * 100)}% higher than the earlier period.`
        : `Travel contributes ${Math.round(analysis.travelShare * 100)}% of total emissions, which is large enough to target directly.`,
      score: "Growth fit",
      electricityReduction: 0,
      gasReduction: 0,
      travelReduction: analysis.travelGrowthRatio >= 1.25 ? 18 : 12,
    });
  }

  if (recommendations.length < 3) {
    recommendations.push({
      id: "recommended-mixed",
      name: "Balanced operating efficiency",
      note: "No single category fully dominates, so a blended plan spreads the reduction effort across operations.",
      reasonTitle: "Why this fits this dataset",
      reason: `${analysis.dominant.label} leads, but the footprint is still distributed enough to justify a mixed intervention package.`,
      score: "Balanced fit",
      electricityReduction: 8,
      gasReduction: 8,
      travelReduction: 8,
    });
  }

  return recommendations.slice(0, 3);
}

function describeForecastConfidence(rowCount) {
  if (rowCount >= 24) return "The winner was validated over a rolling window and then refit on the full history. Confidence: medium.";
  if (rowCount >= 12) return "Using a short-history seasonal fallback because only one full year is available. Confidence: low-medium.";
  if (rowCount >= 1) return "Forecast unavailable until at least 12 months are available. Confidence: insufficient data.";
  return "Add at least 12 dated months to forecast.";
}

// Rendering stays fully derived from state; computed totals never get written back into the source rows.
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
      input.addEventListener("focus", (event) => {
        if (Number(event.target.value) === 0) {
          event.target.value = "";
        }
      });
      input.addEventListener("input", (event) => {
        state.rows[index][field] = Number(event.target.value) || 0;
        updateDashboard();
      });
      input.addEventListener("blur", (event) => {
        if (event.target.value === "") {
          event.target.value = "0";
          state.rows[index][field] = 0;
          updateDashboard();
        }
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
  bestMonthEl.textContent = lowestMonth ? formatMonth(lowestMonth.month) : "--";
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(rect.width, 320);
  const height = Math.max(rect.height, 120);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

// Read theme colors from CSS so the canvas charts follow light/dark mode.
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const get = (name) => css.getPropertyValue(name).trim();
  return {
    text: get("--text"),
    muted: get("--muted"),
    grid: get("--grid"),
    surface: get("--surface"),
    accent: get("--chart"),
    c1: get("--c-electricity"),
    c2: get("--c-gas"),
    c3: get("--c-travel"),
  };
}

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif';
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 36, 60, 120];
let trendHoverIndex = -1;
let trendRowsCache = [];

// Pick which x-axis ticks to draw so labels never overlap, whatever the dataset length.
function buildTrendTicks(ctx, rows, stepX) {
  const labelFor = (row, withYear) => {
    const [year, month] = row.month.split("-");
    const name = formatMonthShort(row.month);
    return withYear ? `${name} ${year}` : name;
  };
  const widest = Math.max(
    ...rows.map((row) => (row.month ? ctx.measureText(labelFor(row, true)).width : 0)),
    30,
  );
  const minGap = widest + 14;
  const step = MONTH_STEPS.find((candidate) => candidate * stepX >= minGap) || MONTH_STEPS[MONTH_STEPS.length - 1];
  const firstYear = Number((rows[0].month || "0-").split("-")[0]);

  const ticks = [];
  rows.forEach((row, index) => {
    if (!row.month) return;
    const [year, month] = row.month.split("-").map(Number);
    let show;
    let label;
    if (step < 12) {
      show = index === 0 || (month - 1) % step === 0;
      label = month === 1 || index === 0 ? labelFor(row, true) : labelFor(row, false);
    } else {
      show = month === 1 && (year - firstYear) % (step / 12) === 0;
      label = String(year);
    }
    if (show) ticks.push({ index, label });
  });

  // Drop the first tick if it sits too close to the next one.
  if (ticks.length > 1 && (ticks[1].index - ticks[0].index) * stepX < minGap * 0.75) ticks.shift();
  return ticks;
}

function drawTrendChart(computedRows) {
  const { ctx, width, height } = prepareCanvas(trendCanvas);
  const colors = themeColors();
  const padding = { top: 16, right: 16, bottom: 34, left: 56 };
  ctx.clearRect(0, 0, width, height);

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const baseY = height - padding.bottom;
  const hasData = computedRows.some((row) => row.total > 0);

  const rawMax = Math.max(...computedRows.map((row) => row.total), 1);
  const yTicks = 4;
  const roughStep = rawMax / yTicks;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const niceStep = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= roughStep);
  const niceMax = niceStep * yTicks;

  ctx.font = `500 12px ${FONT}`;
  ctx.textAlign = "right";
  for (let tick = 0; tick <= yTicks; tick += 1) {
    const value = (niceMax / yTicks) * tick;
    const y = baseY - (chartHeight / yTicks) * tick;
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y + 0.5);
    ctx.lineTo(width - padding.right, y + 0.5);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(Math.round(value).toLocaleString(), padding.left - 10, y + 4);
  }

  if (!hasData) {
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText("Enter monthly data to see the emissions trend.", width / 2, height / 2);
    return;
  }

  const count = computedRows.length;
  const stepX = count > 1 ? chartWidth / (count - 1) : 0;
  const xAt = (index) => (count > 1 ? padding.left + stepX * index : padding.left + chartWidth / 2);
  const yAt = (value) => baseY - (value / niceMax) * chartHeight;

  // Soft area under the line.
  const fill = ctx.createLinearGradient(0, padding.top, 0, baseY);
  fill.addColorStop(0, colors.accent + "33");
  fill.addColorStop(1, colors.accent + "00");
  ctx.beginPath();
  computedRows.forEach((row, index) => {
    if (index === 0) ctx.moveTo(xAt(index), yAt(row.total));
    else ctx.lineTo(xAt(index), yAt(row.total));
  });
  ctx.lineTo(xAt(count - 1), baseY);
  ctx.lineTo(xAt(0), baseY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  computedRows.forEach((row, index) => {
    if (index === 0) ctx.moveTo(xAt(index), yAt(row.total));
    else ctx.lineTo(xAt(index), yAt(row.total));
  });
  ctx.stroke();

  // Dots only when there is room; with long histories the line speaks for itself.
  if (stepX >= 18 || count === 1) {
    computedRows.forEach((row, index) => {
      ctx.fillStyle = colors.surface;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xAt(index), yAt(row.total), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  // X axis: thinned labels so dates never collide.
  ctx.font = `500 12px ${FONT}`;
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "center";
  buildTrendTicks(ctx, computedRows, stepX || chartWidth).forEach((tick) => {
    const x = xAt(tick.index);
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, baseY);
    ctx.lineTo(x + 0.5, baseY + 5);
    ctx.stroke();
    const half = ctx.measureText(tick.label).width / 2;
    const clampedX = Math.min(Math.max(x, padding.left - 20 + half), width - half - 2);
    ctx.fillText(tick.label, clampedX, baseY + 21);
  });

  // Hover read-out.
  if (trendHoverIndex >= 0 && trendHoverIndex < count) {
    const row = computedRows[trendHoverIndex];
    const x = xAt(trendHoverIndex);
    const y = yAt(row.total);
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, padding.top);
    ctx.lineTo(x + 0.5, baseY);
    ctx.stroke();
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    const title = formatMonth(row.month);
    const value = `${Math.round(row.total).toLocaleString()} kg CO2e`;
    ctx.font = `600 12px ${FONT}`;
    const boxW = Math.max(ctx.measureText(title).width, ctx.measureText(value).width) + 20;
    const boxH = 44;
    const boxX = Math.min(Math.max(x - boxW / 2, padding.left), width - padding.right - boxW);
    const boxY = Math.max(y - boxH - 12, 2);
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.fillStyle = colors.surface;
    ctx.textAlign = "left";
    ctx.font = `500 11px ${FONT}`;
    ctx.fillText(title, boxX + 10, boxY + 17);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText(value, boxX + 10, boxY + 33);
  }
}

function drawCategoryChart(computedRows) {
  const { ctx, width, height } = prepareCanvas(categoryCanvas);
  const colors = themeColors();
  const totals = sumCategories(computedRows);
  const entries = [
    ["Electricity", totals.electricity, colors.c1],
    ["Gas", totals.gas, colors.c2],
    ["Travel", totals.travel, colors.c3],
  ];
  const grand = entries.reduce((sum, entry) => sum + entry[1], 0);

  ctx.clearRect(0, 0, width, height);

  if (grand === 0) {
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText("Category totals will appear once you enter data.", width / 2, height / 2);
    return;
  }

  // Horizontal bars: one row per category, label left, value right.
  const labelW = 90;
  const valueW = 130;
  const rowH = 44;
  const barH = 10;
  const top = Math.max((height - rowH * entries.length) / 2, 8);
  const trackW = Math.max(width - labelW - valueW - 16, 40);
  const maxValue = Math.max(...entries.map((entry) => entry[1]), 1);

  entries.forEach(([label, value, color], index) => {
    const y = top + rowH * index + rowH / 2;
    ctx.font = `500 14px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = colors.text;
    ctx.fillText(label, 0, y + 5);

    ctx.fillStyle = colors.grid;
    ctx.beginPath();
    ctx.roundRect(labelW, y - barH / 2, trackW, barH, barH / 2);
    ctx.fill();

    const w = Math.max((value / maxValue) * trackW, value > 0 ? barH : 0);
    if (w > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(labelW, y - barH / 2, w, barH, barH / 2);
      ctx.fill();
    }

    ctx.textAlign = "right";
    ctx.fillStyle = colors.text;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(`${Math.round(value).toLocaleString()} kg`, width, y + 5);
    ctx.fillStyle = colors.muted;
    ctx.font = `500 12px ${FONT}`;
    ctx.fillText(`${Math.round((value / grand) * 100)}%`, width - 82, y + 5);
  });
}

// Scenario cards compare current savings now and projected savings against the selected forecast baseline.
function renderScenarios(computedRows, forecastRows = []) {
  const totals = sumCategories(computedRows);
  const baselineTotal = totals.electricity + totals.gas + totals.travel;
  const hasForecast = forecastRows.length > 0;
  const baselineForecastTotal = forecastRows.reduce((sum, row) => sum + row.total, 0);
  const recommendedScenarios = createRecommendedScenarios(computedRows);
  scenarioGrid.innerHTML = "";

  if (recommendedScenarios.length === 0) {
    const emptyState = document.createElement("article");
    emptyState.className = "scenario-empty";
    emptyState.textContent = "Load at least two dated months with real emissions activity to generate dataset-specific recommendations.";
    scenarioGrid.appendChild(emptyState);
    return;
  }

  recommendedScenarios.forEach((scenario, index) => {
    const adjustedCurrent = applyScenarioToBreakdown(totals, scenario);
    const currentScenarioTotal = adjustedCurrent.electricity + adjustedCurrent.gas + adjustedCurrent.travel;
    const currentSavings = baselineTotal - currentScenarioTotal;
    const scenarioForecastRows = buildScenarioForecast(forecastRows, scenario);
    const scenarioForecastTotal = scenarioForecastRows.reduce((sum, row) => sum + row.adjustedTotal, 0);
    const forecastSavings = baselineForecastTotal - scenarioForecastTotal;
    const scenarioMonths = scenarioForecastRows
      .map((row) => `
        <div class="scenario-forecast-row">
          <span>${formatMonth(row.month)}</span>
          <strong>${Math.round(row.adjustedTotal).toLocaleString()} kg</strong>
        </div>
      `)
      .join("");
    const card = document.createElement("article");
    card.className = "scenario-card";
    card.innerHTML = `
      <div class="scenario-copy">
        <p class="scenario-kicker">Recommendation ${index + 1}</p>
        <h3>${scenario.name}</h3>
        <p>${scenario.note}</p>
      </div>
      <div class="scenario-score">${scenario.score}</div>
      <div class="scenario-why">
        <strong>${scenario.reasonTitle}</strong>
        <p>${scenario.reason}</p>
      </div>
      <div>
        <p class="scenario-metric">${Math.round(currentSavings).toLocaleString()} kg</p>
        <p>${Math.round((currentSavings / Math.max(baselineTotal, 1)) * 100)}% reduction vs current baseline</p>
      </div>
      <p class="scenario-case-study">${hasForecast
        ? `Projected quarter impact: ${Math.round(forecastSavings).toLocaleString()} kg below the baseline forecast.`
        : "Projected quarter impact: unavailable until the forecast benchmark is unlocked."}</p>
      <div class="scenario-meta">
        <span class="scenario-total">Current total: ${Math.round(currentScenarioTotal).toLocaleString()} kg</span>
        <span class="scenario-total">${hasForecast
          ? `Projected 3-month total: ${Math.round(scenarioForecastTotal).toLocaleString()} kg`
          : "Projected 3-month total: --"}</span>
      </div>
      <ul class="scenario-points">
        <li>Electricity cut: ${scenario.electricityReduction}%</li>
        <li>Gas cut: ${scenario.gasReduction}%</li>
        <li>Travel cut: ${scenario.travelReduction}%</li>
      </ul>
      <div class="scenario-forecast-list">${scenarioMonths || '<div class="scenario-forecast-row"><span>No forecast yet</span><strong>--</strong></div>'}</div>
    `;
    scenarioGrid.appendChild(card);
  });
}

// One evaluation pass powers the model table, narrative copy, confidence text, and forecast cards.
function renderForecast(computedRows) {
  const evaluation = evaluateForecastModels(computedRows);
  const narrativeSentences = buildNarrativeSentences(evaluation);
  const forecastTotal = evaluation.forecastRows.length
    ? evaluation.forecastRows.reduce((sum, row) => sum + row.total, 0)
    : Number.NaN;

  forecastModelEl.textContent = evaluation.selected?.label || "--";
  forecastReasonEl.textContent = evaluation.selected
    ? evaluation.selected.fallback
      ? "Using the last full year as a seasonal fallback because there is not enough history for a full benchmark."
      : describeSelectedModel(evaluation.selected.key)
    : "At least 12 dated months are required before the dashboard can forecast.";
  forecastTotalEl.textContent = formatKgOrPlaceholder(forecastTotal);
  forecastConfidenceEl.textContent = describeForecastConfidence(evaluation.totalMonths);
  forecastTableBodyEl.innerHTML = "";
  forecastNarrativeEl.innerHTML = narrativeSentences.map((sentence) => `<p>${sentence}</p>`).join("");
  forecastListEl.innerHTML = "";
  forecastNoteEl.textContent = evaluation.holdoutLength === 12
    ? "Validation window: 12 rolling one-step forecasts. MAPE is shown for reference and becomes less reliable when actual emissions are near zero."
    : evaluation.holdoutLength > 0
      ? `Validation window: ${evaluation.holdoutLength} rolling one-step forecast${evaluation.holdoutLength === 1 ? "" : "s"}. If only mean and naive are available, flat next-quarter values are expected because both models produce constant forecasts by design.`
      : evaluation.selected?.fallback
        ? `Current history: ${evaluation.totalMonths} months. Forecast is produced with a seasonal fallback. Load at least 24 dated months to unlock the full benchmark and error table.`
        : evaluation.totalMonths >= 1
          ? `Current history: ${evaluation.totalMonths} month${evaluation.totalMonths === 1 ? "" : "s"}. Load at least 12 dated months to forecast, or 24 months to unlock the full benchmark.`
          : "Load at least 12 dated months to forecast.";

  if (evaluation.rows.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `
      <td>--</td>
      <td>--</td>
      <td>--</td>
      <td>--</td>
      <td><span class="forecast-status is-unavailable">Waiting</span></td>
    `;
    forecastTableBodyEl.appendChild(emptyRow);
  } else {
    evaluation.rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (evaluation.selected && row.key === evaluation.selected.key) {
        tr.className = "is-selected";
      }
      const isFallbackSelected = evaluation.selected?.fallback && row.key === evaluation.selected.key;
      const statusClass = !row.available
        ? (isFallbackSelected ? "forecast-status is-selected" : "forecast-status is-unavailable")
        : evaluation.selected && row.key === evaluation.selected.key
          ? "forecast-status is-selected"
          : "forecast-status";
      const statusLabel = !row.available
        ? isFallbackSelected ? "Fallback" : "Waiting"
        : evaluation.selected && row.key === evaluation.selected.key ? "Selected" : "Compared";
      tr.innerHTML = `
        <td>${row.label}</td>
        <td>${formatMetric(row.rmse)}</td>
        <td>${formatMetric(row.mae)}</td>
        <td>${Number.isFinite(row.mape) ? `${formatMetric(row.mape)}%` : "--"}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
      `;
      forecastTableBodyEl.appendChild(tr);
    });
  }

  if (evaluation.forecastRows.length === 0) {
    const emptyCard = document.createElement("article");
    emptyCard.className = "forecast-card";
    emptyCard.innerHTML = `
      <p>Forecast unavailable</p>
      <strong>--</strong>
      <span>Enter at least 12 dated months to project the next quarter.</span>
    `;
    forecastListEl.appendChild(emptyCard);
    return [];
  }

  evaluation.forecastRows.forEach((row) => {
    const card = document.createElement("article");
    card.className = "forecast-card";
    card.innerHTML = `
      <p>${formatMonth(row.month)}</p>
      <strong>${Math.round(row.total).toLocaleString()} kg</strong>
      <span>Electricity ${Math.round(row.breakdown.electricity)} kg, gas ${Math.round(row.breakdown.gas)} kg, travel ${Math.round(row.breakdown.travel)} kg.</span>
    `;
    forecastListEl.appendChild(card);
  });

  return evaluation.forecastRows;
}

// Recompute the full dashboard after any state change so every panel stays synchronized.
function updateDashboard() {
  const computedRows = getComputedRows();
  const sortedRows = [...computedRows].sort((a, b) => a.month.localeCompare(b.month));
  updateRowTotals(computedRows);
  renderSummary(sortedRows);
  trendRowsCache = sortedRows;
  drawTrendChart(sortedRows);
  drawCategoryChart(sortedRows);
  const forecastRows = renderForecast(sortedRows);
  renderScenarios(sortedRows, forecastRows);
}

function render() {
  const computedRows = getComputedRows();
  renderRows(computedRows);
  updateDashboard();
}

// Wire up the UI after all helpers are defined so startup order stays obvious.
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
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateDashboard);

trendCanvas.addEventListener("mousemove", (event) => {
  const rows = trendRowsCache;
  if (rows.length < 1) return;
  const rect = trendCanvas.getBoundingClientRect();
  const left = 56;
  const chartWidth = rect.width - left - 16;
  const ratio = (event.clientX - rect.left - left) / chartWidth;
  const index = Math.round(ratio * (rows.length - 1));
  const next = Math.min(Math.max(index, 0), rows.length - 1);
  if (next !== trendHoverIndex) {
    trendHoverIndex = next;
    drawTrendChart(rows);
  }
});
trendCanvas.addEventListener("mouseleave", () => {
  trendHoverIndex = -1;
  drawTrendChart(trendRowsCache);
});

setImportStatus("Load a CSV file or enter values manually.");
render();
