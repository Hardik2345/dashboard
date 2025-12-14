const { Sequelize, DataTypes } = require("sequelize");
const mysql2 = require("mysql2");

function initSequelize() {
  return new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      dialect: "mysql",
      dialectModule: mysql2,
      timezone: "+00:00",
      pool: { max: 3, min: 1, idle: 30000 },
      logging: false,
    }
  );
}

function defineModels(sequelize) {
  // Important: use DATEONLY for a DATE column
  sequelize.define(
    "overall_summary",
    {
      date: { type: DataTypes.DATEONLY },
      total_sales: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      total_orders: { type: DataTypes.DECIMAL(43, 0), allowNull: false, defaultValue: 0 },
      total_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_atc_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      adjusted_total_sessions: { type: DataTypes.BIGINT, allowNull: true },
    },
    { tableName: "overall_summary", timestamps: false }
  );

  const User = sequelize.define('user', {
    email: { type: DataTypes.STRING },
    password_hash: { type: DataTypes.STRING },
    role: { type: DataTypes.STRING },
    is_active: { type: DataTypes.BOOLEAN }
  }, { tableName: 'users', timestamps: true });

  const SessionAdjustmentBucket = sequelize.define('session_adjustment_buckets', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    brand_key: { type: DataTypes.STRING(32), allowNull: false },
    lower_bound_sessions: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    upper_bound_sessions: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    offset_pct: { type: DataTypes.DECIMAL(5,2), allowNull: false },
    active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    effective_from: { type: DataTypes.DATEONLY, allowNull: true },
    effective_to: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  }, { tableName: 'session_adjustment_buckets', timestamps: false });

  const SessionAdjustmentAudit = sequelize.define('session_adjustment_audit', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    brand_key: { type: DataTypes.STRING(32), allowNull: false },
    bucket_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    action: { type: DataTypes.ENUM('CREATE','UPDATE','DEACTIVATE','DELETE'), allowNull: false },
    before_json: { type: DataTypes.JSON, allowNull: true },
    after_json: { type: DataTypes.JSON, allowNull: true },
    author_user_id: { type: DataTypes.BIGINT, allowNull: true },
    changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  }, { tableName: 'session_adjustment_audit', timestamps: false });

  sequelize.define('access_control_settings', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    mode: { type: DataTypes.ENUM('domain','whitelist'), allowNull: false, defaultValue: 'domain' },
    auto_provision_brand_user: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  }, { tableName: 'access_control_settings', timestamps: false });

  sequelize.define('access_whitelist_emails', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    brand_key: { type: DataTypes.STRING(32), allowNull: true },
    notes: { type: DataTypes.STRING(255), allowNull: true },
    added_by: { type: DataTypes.BIGINT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  }, { tableName: 'access_whitelist_emails', timestamps: false });

  sequelize.define('session_activity', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    brand_key: { type: DataTypes.STRING(32), allowNull: false },
    user_email: { type: DataTypes.STRING(255), allowNull: false },
    bucket_start: { type: DataTypes.DATE, allowNull: false },
    hit_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    first_seen: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    last_seen: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    user_agent: { type: DataTypes.STRING(255), allowNull: true },
    ip_hash: { type: DataTypes.CHAR(64), allowNull: true },
    meta_json: { type: DataTypes.JSON, allowNull: true }
  }, {
    tableName: 'session_activity',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['brand_key', 'user_email', 'bucket_start'], name: 'uq_brand_user_bucket' },
      { fields: ['brand_key', 'bucket_start'], name: 'idx_brand_bucket' },
      { fields: ['brand_key', 'last_seen'], name: 'idx_brand_last_seen' }
    ]
  });

  return { User, SessionAdjustmentBucket, SessionAdjustmentAudit };
}

module.exports = {
  initSequelize,
  defineModels,
};
