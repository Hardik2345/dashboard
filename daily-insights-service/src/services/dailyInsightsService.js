const ensuredDbs = new Set();

async function ensureTable(brandDb) {
  if (ensuredDbs.has(brandDb.dbName)) return;
  await brandDb.query(`
    CREATE TABLE IF NOT EXISTS daily_insights (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      insight TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_daily_insights_date (date)
    )
  `);
  ensuredDbs.add(brandDb.dbName);
}

// Note: getInsight/listInsights deliberately do NOT call ensureTable — they
// may run against a read-only replica (see brandContext.js), and CREATE TABLE
// would fail there. Only upsertInsight (always on the write connection) does.
async function getInsight(brandDb, date) {
  const rows = await brandDb.query(
    "SELECT id, date, insight, updated_at FROM daily_insights WHERE date = ? LIMIT 1",
    { replacements: [date] },
  );
  return rows[0] || null;
}

async function upsertInsight(brandDb, date, insight) {
  await ensureTable(brandDb);
  await brandDb.query(
    `INSERT INTO daily_insights (date, insight)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE insight = VALUES(insight), updated_at = CURRENT_TIMESTAMP`,
    { replacements: [date, insight] },
  );
  return getInsight(brandDb, date);
}

async function listInsights(brandDb, { limit = 30, before } = {}) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 30, 100));
  if (before) {
    return brandDb.query(
      "SELECT date, updated_at FROM daily_insights WHERE date < ? ORDER BY date DESC LIMIT ?",
      { replacements: [before, cappedLimit] },
    );
  }
  return brandDb.query("SELECT date, updated_at FROM daily_insights ORDER BY date DESC LIMIT ?", {
    replacements: [cappedLimit],
  });
}

module.exports = { ensureTable, getInsight, upsertInsight, listInsights };
