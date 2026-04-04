// api_keys Sequelize model definition.
// Canonical location. Extracted from app.js.

function defineApiKeyModel(sequelize, DataTypes, Sequelize) {
  return sequelize.define(
    "api_keys",
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      brand_key: { type: DataTypes.STRING(32), allowNull: false },
      key_hash: { type: DataTypes.STRING(255), allowNull: false },
      sha256_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      permissions: { type: DataTypes.JSON, allowNull: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      last_used_at: { type: DataTypes.DATE, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      created_by_email: { type: DataTypes.STRING(255), allowNull: true },
    },
    {
      tableName: "api_keys",
      timestamps: false,
      indexes: [
        { fields: ["brand_key"], name: "idx_brand_key" },
        { fields: ["sha256_hash"], name: "idx_sha256_hash" },
        { fields: ["is_active"], name: "idx_is_active" },
      ],
    },
  );
}

module.exports = { defineApiKeyModel };
