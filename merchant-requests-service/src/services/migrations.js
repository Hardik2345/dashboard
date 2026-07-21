const MerchantRequest = require("../models/MerchantRequest");
const TodoistSyncState = require("../models/TodoistSyncState");
const { CATEGORIES } = require("../config");

async function backfillMerchantRequestWorkflow() {
  await MerchantRequest.updateMany(
    { status: { $in: ["triaged"] } },
    { $set: { status: "submitted" } },
  );
  await MerchantRequest.updateMany(
    { status: { $in: ["in_progress", "waiting_on_merchant"] } },
    { $set: { status: "assigned" } },
  );
  await MerchantRequest.updateMany(
    { status: { $in: ["resolved", "closed", "cancelled"] } },
    { $set: { status: "done" } },
  );
  await MerchantRequest.updateMany(
    { $or: [{ category: { $exists: false } }, { category: "" }, { category: { $nin: CATEGORIES } }] },
    { $set: { category: "Feature Request" } },
  );

  const deadlineBackfill = await MerchantRequest.updateMany(
    { deadline_date: { $exists: false } },
    { $set: { deadline_date: "" } },
  );
  await MerchantRequest.updateMany(
    { "sync.todoist_deadline_status": { $exists: false } },
    {
      $set: {
        "sync.todoist_deadline_status": "idle",
        "sync.pending_deadline_date": "",
      },
    },
  );
  if (deadlineBackfill.modifiedCount > 0) {
    await TodoistSyncState.updateOne(
      { key: "todoist" },
      { $set: { sync_token: "*" } },
      { upsert: true },
    );
  }
}

module.exports = {
  backfillMerchantRequestWorkflow,
};
