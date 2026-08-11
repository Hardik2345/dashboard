const test = require("node:test");
const assert = require("node:assert/strict");

const dailyInsightsService = require("../src/services/dailyInsightsService");

function makeFakeBrandDb(dbName) {
  const rowsByDate = new Map();
  return {
    dbName,
    async query(sql, options = {}) {
      const [date, insight] = options.replacements || [];
      if (/^CREATE TABLE/.test(sql.trim())) return [];

      if (sql.startsWith("SELECT id, date, insight, updated_at")) {
        const row = rowsByDate.get(date);
        return row ? [row] : [];
      }

      if (sql.startsWith("INSERT INTO daily_insights")) {
        const existing = rowsByDate.get(date);
        rowsByDate.set(date, {
          id: existing?.id || rowsByDate.size + 1,
          date,
          insight,
          updated_at: new Date().toISOString(),
        });
        return [];
      }

      if (sql.startsWith("SELECT date, updated_at")) {
        return [...rowsByDate.values()]
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map(({ date: d, updated_at }) => ({ date: d, updated_at }));
      }

      throw new Error(`Unexpected SQL in fake brandDb: ${sql}`);
    },
    _rowsByDate: rowsByDate,
  };
}

test("upsertInsight inserts a new row for a new date", async () => {
  const brandDb = makeFakeBrandDb("brand_a");
  const row = await dailyInsightsService.upsertInsight(brandDb, "2026-08-10", "Great day");
  assert.equal(row.date, "2026-08-10");
  assert.equal(row.insight, "Great day");
});

test("upsertInsight updates content without changing the date", async () => {
  const brandDb = makeFakeBrandDb("brand_b");
  await dailyInsightsService.upsertInsight(brandDb, "2026-08-10", "First draft");
  const updated = await dailyInsightsService.upsertInsight(brandDb, "2026-08-10", "Revised draft");

  assert.equal(updated.date, "2026-08-10");
  assert.equal(updated.insight, "Revised draft");
  assert.equal(brandDb._rowsByDate.size, 1);
});

test("editing an older date keeps that date, not today's date", async () => {
  const brandDb = makeFakeBrandDb("brand_c");
  await dailyInsightsService.upsertInsight(brandDb, "2026-08-01", "Old insight");
  await dailyInsightsService.upsertInsight(brandDb, "2026-08-10", "Today's insight");

  const edited = await dailyInsightsService.upsertInsight(brandDb, "2026-08-01", "Edited old insight");
  assert.equal(edited.date, "2026-08-01");
  assert.equal(brandDb._rowsByDate.size, 2);

  const untouched = await dailyInsightsService.getInsight(brandDb, "2026-08-10");
  assert.equal(untouched.insight, "Today's insight");
});

test("getInsight returns null when no row exists for the date", async () => {
  const brandDb = makeFakeBrandDb("brand_d");
  const row = await dailyInsightsService.getInsight(brandDb, "2026-08-10");
  assert.equal(row, null);
});

test("listInsights returns rows ordered most-recent-first", async () => {
  const brandDb = makeFakeBrandDb("brand_e");
  await dailyInsightsService.upsertInsight(brandDb, "2026-08-01", "a");
  await dailyInsightsService.upsertInsight(brandDb, "2026-08-05", "b");
  const rows = await dailyInsightsService.listInsights(brandDb, {});
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-08-05", "2026-08-01"],
  );
});

test("two different brand databases never share rows (brand isolation)", async () => {
  const brandA = makeFakeBrandDb("brand_f_a");
  const brandB = makeFakeBrandDb("brand_f_b");
  await dailyInsightsService.upsertInsight(brandA, "2026-08-10", "Brand A insight");

  const rowInB = await dailyInsightsService.getInsight(brandB, "2026-08-10");
  assert.equal(rowInB, null);
});
