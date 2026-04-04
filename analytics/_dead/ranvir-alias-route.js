// DEAD CODE — quarantined 2026-04-03
// Original: app.use("/analytics/ranvir", buildRanvirRouter()) in app.js
// Reason: Duplicate mount. The canonical path is /ranvir. The /analytics/ranvir
//         alias was mounted a second time in app.js with no documented reason.
//         Removed from app.js in Phase 1. If any client depends on this path,
//         restore by re-adding the mount to app.js or modules/ranvir/index.js.
// Action: Confirm no clients use /analytics/ranvir, then delete this file.
