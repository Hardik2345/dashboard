function defineDashboardLayoutModel(sequelize, DataTypes, Sequelize) {
  return sequelize.define(
    "dashboard_layouts",
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      // Gateway user ids are string subjects, so this must stay string-backed.
      user_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      page_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      layout_json: {
        type: DataTypes.JSON,
        allowNull: false,
      },
    },
    {
      tableName: "dashboard_layouts",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["user_id", "page_name"],
          name: "uniq_dashboard_layout_user_page",
        },
      ],
    },
  );
}

module.exports = { defineDashboardLayoutModel };
