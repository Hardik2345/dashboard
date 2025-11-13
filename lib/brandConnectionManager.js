const { Sequelize, DataTypes } = require('sequelize');
const LRU_MAX = Number(process.env.BRAND_CONN_MAX || 5);

const cache = new Map(); // brandKey -> { sequelize, models, lastUsed }

function defineModels(sequelize) {
  const OverallSummary = sequelize.define(
    'overall_summary',
    {
      date: { type: DataTypes.DATEONLY },
      total_sales: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
      total_orders: { type: DataTypes.DECIMAL(43,0), allowNull: false, defaultValue: 0 },
      total_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_atc_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      cod_orders: { type: DataTypes.INTEGER, allowNull: true },
      prepaid_orders: { type: DataTypes.INTEGER, allowNull: true },
    },
    { tableName: 'overall_summary', timestamps: false }
  );
  const PipelineMetadata = sequelize.define(
    'pipeline_metadata',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      key_name: { type: DataTypes.STRING },
      key_value: { type: DataTypes.STRING },
    },
    { tableName: 'pipeline_metadata', timestamps: false }
  );
  const User = sequelize.define('user', {
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: 'users', timestamps: true });

  return { OverallSummary, PipelineMetadata, User };
}

async function createConnection(cfg) {
  const sequelize = new Sequelize(cfg.dbName, cfg.dbUser, cfg.dbPass, {
    host: cfg.dbHost,
    port: cfg.dbPort,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    pool: { max: 5, min: 0, idle: 10000 },
    logging: false,
    timezone: '+00:00'
  });
  await sequelize.authenticate();
  const models = defineModels(sequelize);
  return { sequelize, models };
}

function evictIfNeeded() {
  if (cache.size <= LRU_MAX) return;
  // Evict least recently used
  let oldestKey = null; let oldestTime = Infinity;
  for (const [k,v] of cache.entries()) {
    if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
  }
  if (oldestKey) {
    const entry = cache.get(oldestKey);
    cache.delete(oldestKey);
    entry.sequelize.close().catch(()=>{});
  }
}

async function getBrandConnection(brandCfg) {
  const key = brandCfg.key;
  const now = Date.now();
  if (cache.has(key)) {
    const entry = cache.get(key);
    entry.lastUsed = now;
    // Ensure backward compatibility if models previously lacked User
    if (!entry.models.User) {
      const models = defineModels(entry.sequelize);
      entry.models = { ...entry.models, ...models };
    }
    return entry;
  }
  const created = await createConnection(brandCfg);
  const entry = { ...created, lastUsed: now };
  cache.set(key, entry);
  evictIfNeeded();
  return entry;
}

module.exports = { getBrandConnection };
