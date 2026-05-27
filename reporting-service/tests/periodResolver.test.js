const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePeriod } = require("../src/modules/generation/periodResolver");

test("resolves weekly period from Monday through Sunday with previous comparison", () => {
  const period = resolvePeriod({ type: "week", timezone: "Asia/Kolkata" }, new Date("2026-05-22T10:00:00Z"));
  assert.equal(period.start_at.toISOString(), "2026-05-18T00:00:00.000Z");
  assert.equal(period.end_at.toISOString(), "2026-05-24T23:59:59.999Z");
  assert.equal(period.comparison_start_at.toISOString(), "2026-05-11T00:00:00.000Z");
  assert.equal(period.comparison_end_at.toISOString(), "2026-05-17T23:59:59.999Z");
});

test("resolves calendar month", () => {
  const period = resolvePeriod({ type: "month" }, new Date("2026-05-22T10:00:00Z"));
  assert.equal(period.start_at.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(period.end_at.toISOString(), "2026-05-31T23:59:59.999Z");
});

test("resolves calendar quarter", () => {
  const period = resolvePeriod({ type: "quarter" }, new Date("2026-05-22T10:00:00Z"));
  assert.equal(period.start_at.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(period.end_at.toISOString(), "2026-06-30T23:59:59.999Z");
});
