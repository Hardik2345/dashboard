const mongoose = require("mongoose");
const { STATUSES } = require("../config");

const assigneeSchema = new mongoose.Schema(
  {
    todoist_user_id: { type: String, default: "" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    unmapped: { type: Boolean, default: false },
  },
  { _id: false },
);

const requesterSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true },
    email: { type: String, default: "" },
    name: { type: String, default: "" },
  },
  { _id: false },
);

const syncSchema = new mongoose.Schema(
  {
    todoist_task_status: {
      type: String,
      enum: ["pending", "synced", "failed"],
      default: "pending",
    },
    todoist_assignment_status: {
      type: String,
      enum: ["idle", "pending", "synced", "failed"],
      default: "idle",
    },
    todoist_status_status: {
      type: String,
      enum: ["idle", "pending", "synced", "failed"],
      default: "idle",
    },
    todoist_comment_status: {
      type: String,
      enum: ["idle", "pending", "synced", "failed"],
      default: "idle",
    },
    todoist_due_date_status: {
      type: String,
      enum: ["idle", "pending", "synced", "failed"],
      default: "idle",
    },
    last_todoist_error: { type: String, default: "" },
    last_synced_at: { type: Date, default: null },
    pending_assignment_user_id: { type: String, default: "" },
    pending_status: { type: String, default: "" },
    pending_due_date: { type: String, default: "" },
  },
  { _id: false },
);

const merchantRequestSchema = new mongoose.Schema(
  {
    brand_key: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    requester: { type: requesterSchema, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, default: "" },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    due_date: { type: String, default: "" },
    status: {
      type: String,
      enum: STATUSES,
      default: "submitted",
      index: true,
    },
    assignee: { type: assigneeSchema, default: () => ({}) },
    todoist_task_id: { type: String, default: "", index: true },
    todoist_url: { type: String, default: "" },
    todoist_section_id: { type: String, default: "" },
    todoist_labels: { type: [String], default: [] },
    sync: { type: syncSchema, default: () => ({}) },
    closed_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

merchantRequestSchema.index({ brand_key: 1, status: 1, updated_at: -1 });

module.exports = mongoose.model("MerchantRequest", merchantRequestSchema);
