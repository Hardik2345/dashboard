const TodoistProject = require("../models/TodoistProject");

// Normalizes a raw Todoist project (REST/sync/webhook shapes vary) to our fields.
function normalizeProject(p = {}) {
  return {
    todoist_project_id: String(p.id || p.project_id || ""),
    name: String(p.name || ""),
    parent_id: String(p.parent_id || ""),
    color: String(p.color || ""),
    is_archived: Boolean(p.is_archived || p.is_deleted || p.archived),
  };
}

// Upsert a single project snapshot (used by webhooks). Marks it active/seen now.
async function upsertProjectSnapshot(p) {
  const fields = normalizeProject(p);
  if (!fields.todoist_project_id) return;
  await TodoistProject.updateOne(
    { todoist_project_id: fields.todoist_project_id },
    {
      $set: {
        ...fields,
        active: !fields.is_archived,
        synced_at: new Date(),
        raw: p,
      },
    },
    { upsert: true },
  );
}

// Soft-remove a project snapshot (used by project:deleted). Keeps history.
async function removeProjectSnapshot(projectId) {
  const id = String(projectId || "");
  if (!id) return;
  await TodoistProject.updateOne(
    { todoist_project_id: id },
    { $set: { active: false, is_archived: true, synced_at: new Date() } },
  );
}

// Full pull of all Todoist projects into the local cache. Retires any project
// no longer returned. Defensive: never throws into the reconcile loop.
async function syncAllProjects({ todoistClient } = {}) {
  if (!todoistClient || typeof todoistClient.listProjects !== "function") return 0;
  const runStart = new Date();
  let synced = 0;
  try {
    const projects = await todoistClient.listProjects();
    for (const p of Array.isArray(projects) ? projects : []) {
      await upsertProjectSnapshot(p);
      synced += 1;
    }
    // Retire projects not seen in this pull (deleted/inaccessible upstream).
    await TodoistProject.updateMany(
      { synced_at: { $lt: runStart }, active: true },
      { $set: { active: false } },
    );
  } catch (err) {
    console.error("[merchant-requests] project sync failed:", err?.message || err);
  }
  return synced;
}

// Active, non-archived projects for the manual-link dropdown, sorted by name.
async function listLocalProjects() {
  const docs = await TodoistProject.find({ active: true, is_archived: false })
    .sort({ name: 1 })
    .lean();
  return docs.map((d) => ({ id: d.todoist_project_id, name: d.name }));
}

module.exports = {
  normalizeProject,
  upsertProjectSnapshot,
  removeProjectSnapshot,
  syncAllProjects,
  listLocalProjects,
};
