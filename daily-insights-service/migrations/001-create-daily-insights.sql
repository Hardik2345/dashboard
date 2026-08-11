-- Migration: Create daily_insights table
-- Run this against each brand database (see analytics/scripts/migrations/001-*.sql
-- for the same convention: this repo has no centralized migration runner, so each
-- brand DB is migrated individually).
--
-- The service also creates this table idempotently at query time
-- (see src/services/dailyInsightsService.js ensureTable()), so this script is
-- for manual/CI-driven migrations and documentation of the schema.

CREATE TABLE IF NOT EXISTS daily_insights (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  insight TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_daily_insights_date (date)
);
