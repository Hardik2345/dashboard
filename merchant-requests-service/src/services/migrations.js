const MerchantRequest = require("../models/MerchantRequest");
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
}

module.exports = {
  backfillMerchantRequestWorkflow,
};
