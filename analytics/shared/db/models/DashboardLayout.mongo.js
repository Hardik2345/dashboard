const { mongoose } = require("../mongo");

const dashboardLayoutSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    pageName: {
      type: String,
      required: true,
      default: "dashboard",
    },
    layoutJson: {
      type: Object,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "dashboard_layouts",
  },
);

dashboardLayoutSchema.index(
  { userId: 1, pageName: 1 },
  { unique: true, name: "uniq_dashboard_layout_user_page" },
);

module.exports = mongoose.models.DashboardLayout
  || mongoose.model("DashboardLayout", dashboardLayoutSchema);
