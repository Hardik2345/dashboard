import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DESKTOP_KPI_ORDER,
  deriveRenderedDesktopKpiOrder,
  normalizeDesktopKpiLayout,
  paginateKpiIds,
  reorderDesktopKpiLayout,
} from "./kpiLayout.js";

test("normalizeDesktopKpiLayout appends defaults and sanitizes pinned ids", () => {
  const normalized = normalizeDesktopKpiLayout({
    order: ["orders", "revenue", "orders", "custom_metric"],
    pinned: ["revenue", "missing_metric", "orders", "aov", "sessions"],
  });

  assert.deepEqual(normalized.order, [
    "orders",
    "revenue",
    "custom_metric",
    ...DEFAULT_DESKTOP_KPI_ORDER.filter(
      (id) => !["orders", "revenue"].includes(id),
    ),
  ]);
  assert.deepEqual(normalized.pinned, ["revenue", "orders", "aov"]);
});

test("deriveRenderedDesktopKpiOrder places pinned cards first without mutating base order", () => {
  const rendered = deriveRenderedDesktopKpiOrder({
    order: ["orders", "revenue", "sessions", "aov"],
    pinned: ["sessions", "orders"],
  });

  assert.deepEqual(rendered.slice(0, 4), [
    "orders",
    "sessions",
    "revenue",
    "aov",
  ]);
});

test("paginateKpiIds chunks cards into fixed pages", () => {
  const pages = paginateKpiIds(["a", "b", "c", "d", "e"], 2);
  assert.deepEqual(pages, [["a", "b"], ["c", "d"], ["e"]]);
});

test("default KPI order paginates into two desktop pages", () => {
  const pages = paginateKpiIds(DEFAULT_DESKTOP_KPI_ORDER);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0], DEFAULT_DESKTOP_KPI_ORDER.slice(0, 8));
  assert.deepEqual(pages[1], DEFAULT_DESKTOP_KPI_ORDER.slice(8));
});

test("reorderDesktopKpiLayout reorders only within the same pinned partition", () => {
  const base = {
    order: ["orders", "revenue", "sessions", "aov"],
    pinned: ["sessions", "orders"],
  };

  const pinnedMove = reorderDesktopKpiLayout(base, "sessions", "orders");
  assert.deepEqual(
    pinnedMove.order.filter((id) => pinnedMove.pinned.includes(id)),
    ["sessions", "orders"],
  );

  const blockedCrossPartition = reorderDesktopKpiLayout(base, "aov", "orders");
  assert.deepEqual(blockedCrossPartition, normalizeDesktopKpiLayout(base));
});
