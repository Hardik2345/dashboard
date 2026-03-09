-- Migration: Create hourly_product_sessions table
-- Run this against each brand database.
-- The pipeline's ensureTablesForBrand() also creates this table idempotently,
-- so this script is for manual or CI-driven migrations.

CREATE TABLE IF NOT EXISTS `hourly_product_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `hour` TINYINT UNSIGNED NOT NULL,
  `landing_page_type` VARCHAR(100) DEFAULT NULL,
  `landing_page_path` VARCHAR(500) NOT NULL,
  `product_id` VARCHAR(50) DEFAULT NULL,
  `product_title` VARCHAR(255) DEFAULT NULL,
  `utm_source` VARCHAR(255) DEFAULT NULL,
  `utm_medium` VARCHAR(255) DEFAULT NULL,
  `utm_campaign` VARCHAR(255) DEFAULT NULL,
  `utm_content` VARCHAR(255) DEFAULT NULL,
  `utm_term` VARCHAR(255) DEFAULT NULL,
  `referrer_name` VARCHAR(255) DEFAULT NULL,
  `sessions` INT NOT NULL DEFAULT 0,
  `sessions_with_cart_additions` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_date_hour` (`date`, `hour`),
  KEY `idx_product_date` (`product_id`, `date`),
  KEY `idx_date_campaign` (`date`, `utm_campaign`(150)),
  KEY `idx_date_path` (`date`, `landing_page_path`(200))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
