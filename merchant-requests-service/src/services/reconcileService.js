const MerchantRequest = require("../models/MerchantRequest");
const TodoistSyncState = require("../models/TodoistSyncState");
const TodoistUser = require("../models/TodoistUser");
const { applyNoteEvent, applyTaskUpdate, importRequestFromTodoistTask } = require("./webhookService");
const { processDueJobs } = require("./syncJobs");
const { retryFailedProvisionings } = require("./brandProvisioning");
const { syncAllProjects } = require("./todoistProjects");

// Minimum gap between reconcile runs; rapid repeat calls (button spam) are
// throttled rather than executed.
const MIN_RECONCILE_INTERVAL_MS = 10000;

// Single-flight guard: only one reconcile runs at a time per process.
let _inFlight = null;
let _lastRunAt = 0;

async function _runReconcile({ todoistClient, config }) {
  // Kick off async retries for any brands that previously failed provisioning
  await retryFailedProvisionings({ todoistClient, config });

  // Refresh the local Todoist project cache (powers the manual-link dropdown)
  const projects_synced = await syncAllProjects({ todoistClient });

  const state =
    (await TodoistSyncState.findOne({ key: "todoist" })) ||
    (await TodoistSyncState.create({ key: "todoist", sync_token: "*" }));

  const result = {
    jobs_processed: await processDueJobs({ todoistClient, config }),
    projects_synced,
    tasks_processed: 0,
  };

  try {
    const sync = await todoistClient.sync(state.sync_token || "*");
    const items = sync.items || sync.tasks || [];
    for (const item of items) {
      const taskId = String(item.id || item.task_id || "");
      if (!taskId) continue;
      let imported = false;
      let request = await MerchantRequest.findOne({ todoist_task_id: taskId });
      if (!request) {
        request = await importRequestFromTodoistTask(item, { todoistClient, config });
        imported = !!request;
      }
      if (!request) continue;
      if (!imported) await applyTaskUpdate(request, item);
      result.tasks_processed += 1;
    }

    const collaborators = sync.collaborators || sync.users || [];
    for (const user of collaborators) {
      const id = String(user.id || user.user_id || user.uid || "");
      if (!id) continue;
      await TodoistUser.updateOne(
        { todoist_user_id: id },
        {
          $set: {
            name: user.full_name || user.name || "",
            email: user.email || "",
            active: user.is_deleted ? false : true,
            raw: user,
          },
        },
        { upsert: true },
      );
    }

    const notes = sync.notes || sync.comments || [];
    for (const note of notes) {
      const taskId = String(note.item_id || note.task_id || "");
      if (!taskId) continue;
      const request = await MerchantRequest.findOne({ todoist_task_id: taskId });
      if (!request) continue;
      await applyNoteEvent(request, note);
    }

    state.sync_token = sync.sync_token || state.sync_token || "*";
    state.last_success_at = new Date();
    state.last_error = "";
    await state.save();
  } catch (err) {
    state.last_error = err?.message || String(err);
    await state.save();
    throw err;
  }

  return result;
}

// Guarded entry point: coalesces concurrent calls into the in-flight run and
// throttles rapid repeats, so overlapping triggers (multiple authors, tabs, or
// the periodic interval) can't double-process or hammer the Todoist API.
async function reconcileTodoist(deps = {}) {
  if (_inFlight) return _inFlight;

  const sinceLast = Date.now() - _lastRunAt;
  if (sinceLast < MIN_RECONCILE_INTERVAL_MS) {
    return { skipped: true, reason: "throttled", retry_in_ms: MIN_RECONCILE_INTERVAL_MS - sinceLast };
  }

  _inFlight = _runReconcile(deps).finally(() => {
    _lastRunAt = Date.now();
    _inFlight = null;
  });
  return _inFlight;
}

module.exports = { reconcileTodoist };
