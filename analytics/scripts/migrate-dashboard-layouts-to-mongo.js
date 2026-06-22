/* eslint-disable no-console */

const { sequelize } = require("../shared/db/mainSequelize");
const DashboardLayout = require("../shared/db/models/DashboardLayout.mongo");
const { connectMongo, disconnectMongo } = require("../shared/db/mongo");

async function migrate() {
  await sequelize.authenticate();
  await connectMongo();

  const rows = await sequelize.models.dashboard_layouts.findAll({
    raw: true,
  });

  let migrated = 0;

  for (const row of rows) {
    await DashboardLayout.findOneAndUpdate(
      {
        userId: String(row.user_id),
        pageName: row.page_name || "dashboard",
      },
      {
        $set: {
          layoutJson: row.layout_json,
          updatedAt: row.updated_at || new Date(),
        },
        $setOnInsert: {
          createdAt: row.created_at || new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    migrated += 1;
  }

  console.log(`Migrated ${migrated} dashboard layout rows to MongoDB.`);
}

migrate()
  .then(async () => {
    await disconnectMongo();
    await sequelize.close();
  })
  .catch(async (error) => {
    console.error("Dashboard layout migration failed:", error);
    try {
      await disconnectMongo();
    } catch (_error) {}
    try {
      await sequelize.close();
    } catch (_error) {}
    process.exitCode = 1;
  });
