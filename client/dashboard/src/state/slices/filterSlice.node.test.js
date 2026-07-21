import test from "node:test";
import assert from "node:assert/strict";
import filterReducer, {
  setTrendMetricSelection,
} from "./filterSlice.js";
import {
  DEFAULT_TREND_METRIC,
  sanitizeTrendMetricSelection,
  toggleTrendMetricSelection,
} from "../../lib/trendSelection.js";

test("filter state initializes with one active trend metric and no multi-selected radios", () => {
  const state = filterReducer(undefined, { type: "@@INIT" });

  assert.deepEqual(state.selectedMetrics, []);
  assert.equal(state.activeMetric, DEFAULT_TREND_METRIC);
});

test("toggleTrendMetricSelection preserves order and drops the oldest fourth metric", () => {
  let selection = sanitizeTrendMetricSelection(["sales"], "sales");

  selection = toggleTrendMetricSelection(
    selection.selectedMetrics,
    selection.activeMetric,
    "orders",
  );
  selection = toggleTrendMetricSelection(
    selection.selectedMetrics,
    selection.activeMetric,
    "sessions",
  );
  selection = toggleTrendMetricSelection(
    selection.selectedMetrics,
    selection.activeMetric,
    "cvr",
  );

  assert.deepEqual(selection.selectedMetrics, ["orders", "sessions", "cvr"]);
  assert.equal(selection.activeMetric, "cvr");
});

test("toggleTrendMetricSelection replaces mode-swapped KPI keys in place", () => {
  const selection = toggleTrendMetricSelection(
    ["sales", "atc_rate", "cvr"],
    "atc_rate",
    "atc",
    { replaceMetricKey: "atc_rate" },
  );

  assert.deepEqual(selection.selectedMetrics, ["sales", "atc", "cvr"]);
  assert.equal(selection.activeMetric, "atc");
});

test("setTrendMetricSelection reducer sanitizes duplicate and invalid metric payloads", () => {
  const initialState = filterReducer(undefined, { type: "@@INIT" });
  const nextState = filterReducer(
    initialState,
    setTrendMetricSelection({
      selectedMetrics: ["sales", "orders", "orders", "invalid", "sessions"],
      activeMetric: "sessions",
    }),
  );

  assert.deepEqual(nextState.selectedMetrics, ["sales", "orders", "sessions"]);
  assert.equal(nextState.activeMetric, "sessions");
});

test("single-card selection can keep only an active metric with no radio selections", () => {
  const initialState = filterReducer(undefined, { type: "@@INIT" });
  const nextState = filterReducer(
    initialState,
    setTrendMetricSelection({
      selectedMetrics: [],
      activeMetric: "orders",
    }),
  );

  assert.deepEqual(nextState.selectedMetrics, []);
  assert.equal(nextState.activeMetric, "orders");
});

test("performance is accepted as a valid trend metric selection", () => {
  const initialState = filterReducer(undefined, { type: "@@INIT" });
  const nextState = filterReducer(
    initialState,
    setTrendMetricSelection({
      selectedMetrics: ["sales", "performance"],
      activeMetric: "performance",
    }),
  );

  assert.deepEqual(nextState.selectedMetrics, ["sales", "performance"]);
  assert.equal(nextState.activeMetric, "performance");
});

test("payment split trend metrics are accepted as valid selections", () => {
  const initialState = filterReducer(undefined, { type: "@@INIT" });
  const nextState = filterReducer(
    initialState,
    setTrendMetricSelection({
      selectedMetrics: ["payment_orders", "payment_sales"],
      activeMetric: "payment_sales",
    }),
  );

  assert.deepEqual(nextState.selectedMetrics, ["payment_orders", "payment_sales"]);
  assert.equal(nextState.activeMetric, "payment_sales");
});

test("split revenue trend metrics are accepted as distinct selections", () => {
  const initialState = filterReducer(undefined, { type: "@@INIT" });
  const nextState = filterReducer(
    initialState,
    setTrendMetricSelection({
      selectedMetrics: ["gross_revenue", "net_revenue"],
      activeMetric: "net_revenue",
    }),
  );

  assert.deepEqual(nextState.selectedMetrics, ["gross_revenue", "net_revenue"]);
  assert.equal(nextState.activeMetric, "net_revenue");
});

test("ATC sessions is accepted as a valid split KPI trend metric", () => {
  const initialState = filterReducer(undefined, { type: "@@INIT" });
  const nextState = filterReducer(
    initialState,
    setTrendMetricSelection({
      selectedMetrics: ["atc_sessions", "atc_rate"],
      activeMetric: "atc_sessions",
    }),
  );

  assert.deepEqual(nextState.selectedMetrics, ["atc_sessions", "atc_rate"]);
  assert.equal(nextState.activeMetric, "atc_sessions");
});
