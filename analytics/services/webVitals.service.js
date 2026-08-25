const { connectWebVitalsMongo } = require("../db/webVitals.mongo");

const METRICS = ["performance", "fcp", "lcp", "ttfb", "inp", "cls"];

// Standard Core Web Vitals thresholds for fcp/lcp/ttfb/inp/cls. The
// `performance` score uses its own 4-tier scale — see getPerformanceStatus.
const THRESHOLDS = {
  fcp: { good: 1.8, needsImprovement: 3, direction: "lower" },
  lcp: { good: 2.5, needsImprovement: 4, direction: "lower" },
  ttfb: { good: 0.8, needsImprovement: 1.8, direction: "lower" },
  inp: { good: 200, needsImprovement: 500, direction: "lower" },
  cls: { good: 0.1, needsImprovement: 0.25, direction: "lower" },
};

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Custom (non-Lighthouse) scale for the Performance score: good >59,
// needs attention 47-59, poor 40-46, critical <=39.
function getPerformanceStatus(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value > 59) return "good";
  if (value >= 47) return "needs_attention";
  if (value >= 40) return "poor";
  return "critical";
}

function getStatus(metric, value) {
  if (metric === "performance") return getPerformanceStatus(value);
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const t = THRESHOLDS[metric];
  if (!t) return null;
  if (t.direction === "higher") {
    if (value >= t.good) return "good";
    if (value >= t.needsImprovement) return "needs_improvement";
    return "poor";
  }
  if (value <= t.good) return "good";
  if (value <= t.needsImprovement) return "needs_improvement";
  return "poor";
}

function normalizeBrandKey(brandKey) {
  return (brandKey || "").toString().trim().toUpperCase();
}

function getPreviousIsoDate(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map((part) => Number(part));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return value;
  }
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() - 1);
  return utcDate.toISOString().slice(0, 10);
}

function buildMetricGroupStage(idExpr) {
  return {
    _id: idExpr,
    performance: { $avg: "$performance" },
    fcp: { $avg: "$fcp" },
    lcp: { $avg: "$lcp" },
    ttfb: { $avg: "$ttfb" },
    inp: { $avg: "$inp" },
    cls: { $avg: "$cls" },
    count: { $sum: 1 },
  };
}

function mapMetricRow(row) {
  return {
    performance: numberOrNull(row?.performance),
    fcp: numberOrNull(row?.fcp),
    lcp: numberOrNull(row?.lcp),
    ttfb: numberOrNull(row?.ttfb),
    inp: numberOrNull(row?.inp),
    cls: numberOrNull(row?.cls),
  };
}

async function averageMetricsForDate(collection, brandKey, date) {
  const rows = await collection
    .aggregate([
      { $match: { brand_key: brandKey, date } },
      { $group: buildMetricGroupStage(null) },
    ])
    .toArray();
  return rows[0] || null;
}

async function getSnapshot({ brandKey, date }) {
  const normalizedBrandKey = normalizeBrandKey(brandKey);
  const previousDate = getPreviousIsoDate(date);
  const collection = await connectWebVitalsMongo();

  const [currentAgg, previousAgg] = await Promise.all([
    averageMetricsForDate(collection, normalizedBrandKey, date),
    averageMetricsForDate(collection, normalizedBrandKey, previousDate),
  ]);

  const currentValues = mapMetricRow(currentAgg);
  const previousValues = mapMetricRow(previousAgg);

  const metrics = {};
  const previousMetrics = {};
  for (const metric of METRICS) {
    const currentValue = currentValues[metric];
    const previousValue = previousValues[metric];
    metrics[metric] = {
      value: currentValue,
      status: getStatus(metric, currentValue),
      deltaPct:
        currentValue !== null && previousValue !== null && previousValue !== 0
          ? ((currentValue - previousValue) / previousValue) * 100
          : null,
    };
    previousMetrics[metric] = { value: previousValue };
  }

  return {
    date,
    previousDate,
    sampleCount: currentAgg?.count || 0,
    previousSampleCount: previousAgg?.count || 0,
    metrics,
    previousMetrics,
  };
}

async function getTrend({ brandKey, start, end, granularity }) {
  const normalizedBrandKey = normalizeBrandKey(brandKey);
  const collection = await connectWebVitalsMongo();
  const isSingleDay = !!start && start === end;
  const effectiveGranularity = granularity === "hourly" && isSingleDay ? "hourly" : "daily";

  if (effectiveGranularity === "hourly") {
    const rows = await collection
      .aggregate([
        { $match: { brand_key: normalizedBrandKey, date: start } },
        {
          $addFields: {
            hour: {
              $toInt: { $arrayElemAt: [{ $split: [{ $ifNull: ["$time", "00:00:00"] }, ":"] }, 0] },
            },
          },
        },
        { $group: buildMetricGroupStage("$hour") },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return {
      granularity: "hourly",
      points: rows.map((row) => ({
        label: `${String(row._id).padStart(2, "0")}:00`,
        ...mapMetricRow(row),
      })),
    };
  }

  const rows = await collection
    .aggregate([
      { $match: { brand_key: normalizedBrandKey, date: { $gte: start, $lte: end } } },
      { $group: buildMetricGroupStage("$date") },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return {
    granularity: "daily",
    points: rows.map((row) => ({
      label: row._id,
      ...mapMetricRow(row),
    })),
  };
}

async function getPageBreakdown({ brandKey, date }) {
  const normalizedBrandKey = normalizeBrandKey(brandKey);
  const collection = await connectWebVitalsMongo();

  const rows = await collection
    .find({ brand_key: normalizedBrandKey, date })
    .sort({ sessions: -1, rank: 1 })
    .toArray();

  return rows.map((row) => {
    const performance = numberOrNull(row.performance);
    return {
      page_name: row.page_name || "",
      url: row.url || "",
      sessions: Number(row.sessions || 0),
      performance,
      performance_status: getStatus("performance", performance),
      fcp: numberOrNull(row.fcp),
      lcp: numberOrNull(row.lcp),
      ttfb: numberOrNull(row.ttfb),
      inp: numberOrNull(row.inp),
      cls: numberOrNull(row.cls),
      date: row.date || null,
      time: row.time || null,
    };
  });
}

async function getAllBrandsSnapshot({ date }) {
  const collection = await connectWebVitalsMongo();

  const rows = await collection
    .aggregate([
      { $match: { date } },
      {
        $group: {
          _id: "$brand_key",
          brand_name: { $first: "$brand_name" },
          performance: { $avg: "$performance" },
          fcp: { $avg: "$fcp" },
          lcp: { $avg: "$lcp" },
          ttfb: { $avg: "$ttfb" },
          inp: { $avg: "$inp" },
          cls: { $avg: "$cls" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return rows.map((row) => {
    const values = mapMetricRow(row);
    const metrics = {};
    for (const metric of METRICS) {
      const value = values[metric];
      metrics[metric] = { value, status: getStatus(metric, value) };
    }
    return {
      brand_key: row._id,
      brand_name: row.brand_name || row._id,
      sampleCount: row.count || 0,
      metrics,
    };
  });
}

module.exports = {
  getSnapshot,
  getTrend,
  getPageBreakdown,
  getAllBrandsSnapshot,
};
