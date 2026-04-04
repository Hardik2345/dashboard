# Analytics Service — Migration Plan

> Locked: 2026-04-03
> Reference: .migration/LOCKED_STRUCTURE.md

---

## Ground Rules

- Every step is an atomic commit. If a step breaks, revert just that commit.
- No import path changes happen until the file physically moves.
- `scripts/` and `tests/` are NOT touched until Phase 8.
- Each phase lists the exact old path → new path, plus code edits.
- Run `node -e "require('./app')"` after every phase to verify cold start.

---

## Phase 0 — Scaffold Empty Directories

Create the skeleton so subsequent phases are just file moves.

```
mkdir -p analytics/_dead
mkdir -p analytics/modules/metrics
mkdir -p analytics/modules/product-conversion
mkdir -p analytics/modules/api-keys
mkdir -p analytics/modules/shopify
mkdir -p analytics/modules/uploads
mkdir -p analytics/modules/notifications
mkdir -p analytics/modules/external
mkdir -p analytics/modules/ranvir
mkdir -p analytics/shared/db/models
mkdir -p analytics/shared/middleware
mkdir -p analytics/shared/utils
```

Commit: `chore(analytics): scaffold modular monolith directories`

---

## Phase 1 — Quarantine Dead Code

No import changes. Just copy files to `_dead/` and leave originals in place
with a deprecation comment at the top.

| Action | From | To |
|--------|------|----|
| copy | `lib/kafka.js` | `_dead/kafka.js` |
| copy | `utils/brandHelpers.js` | `_dead/brandHelpers.js` |
| extract | `emitKafkaMessage` from `utils/socket.js` | `_dead/socket-emit.js` |
| extract | duplicate `/analytics/ranvir` mount from `app.js` | `_dead/ranvir-alias-route.js` (just a note file) |

### Code edit — `app.js`
Remove duplicate ranvir mount:
```diff
- app.use("/analytics/ranvir", buildRanvirRouter());
```

### Code edit — `utils/socket.js`
Remove export of `emitKafkaMessage`; keep `initSocket` and `getIO`.

### Code edit — `app.js` init()
Remove unused `emitKafkaMessage` import:
```diff
- const { initSocket, emitKafkaMessage } = require('./utils/socket');
+ const { initSocket } = require('./utils/socket');
```

Commit: `chore(analytics): quarantine dead code to _dead/`

---

## Phase 2 — Bug Fixes (pre-refactor)

Fix bugs before moving code so diffs are clean.

### 2a — `middlewares/brandContext.js`: missing `await`
```diff
  async function brandContext(req, res, next) {
-   authorizeBrandContext(req, res, next);
+   await authorizeBrandContext(req, res, next);
  }
```

### 2b — `routes/ranvir.js`: stack trace leak
```diff
  } catch (error) {
-   res.status(500).json({ error: error.message, stack: error.stack });
+   res.status(500).json({ error: error.message });
  }
```
Apply to all 4 catch blocks in ranvir.js.

### 2c — `utils/socket.js`: wildcard CORS
```diff
  io = new Server(server, {
    cors: {
-     origin: "*",
+     origin: (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean),
      methods: ["GET", "POST"]
    }
  });
```

Commit: `fix(analytics): await brandContext, remove stack leak, socket CORS`

---

## Phase 3 — Extract Shared Utilities (in-place)

Create new shared files. Update imports in consumers. Old files become
one-line re-exports for backward compat during migration.

### 3a — `shared/utils/date.js`
Merge contents of:
- `utils/dateUtils.js` (parseIsoDate, formatIsoDate, daysInclusive, shiftDays, previousWindow, prevDayStr)
- `services/metricsFoundation.js` date helpers (pad2, formatUtcDate, getNowIst, getTodayIst, isTodayUtc, getIstContext, IST_OFFSET_MIN, DAY_MS, secondsToTime, parseHourFromCutoff)

After merge, `utils/dateUtils.js` becomes:
```js
// DEPRECATED — import from shared/utils/date.js
module.exports = require('../shared/utils/date');
```

And `metricsFoundation.js` retains only the non-date exports (resolveCompareRange,
buildLiveCutoffContext, buildCompletedHourCutoffContext, buildCompletedHourOrderCutoffTime,
buildRowTwoComparisonCutoffs) and imports dates from `shared/utils/date.js`.

### 3b — `shared/utils/filters.js`
Extract from `utils/metricsUtils.js`:
- normalizeFilterValues
- buildUtmWhereClause
- appendUtmWhere
- buildDeviceTypeUserAgentClause
- hasUtmFilters
- extractUtmParam
- extractFilters

`utils/metricsUtils.js` becomes a re-export shim + retains:
- rawSum, computeReturnCounts, computePercentDelta

### 3c — `shared/utils/metricsUtils.js`
Move remaining functions (rawSum, computeReturnCounts, computePercentDelta)
plus the de-duped `appendProductFilter` (currently duplicated in
metricsAggregateService.js and metricsSnapshotService.js).

### 3d — `shared/utils/sql.js`
Copy `utils/sql.js` → `shared/utils/sql.js`. Old file re-exports.

### 3e — `shared/utils/logger.js`
Copy `utils/logger.js` → `shared/utils/logger.js`.
Remove all commented-out code (the noop, enabled flag, commented console overrides).

### 3f — `shared/utils/sessionUtils.js`
Copy `utils/sessionUtils.js` → `shared/utils/sessionUtils.js`. Old file re-exports.

### 3g — `shared/utils/duckdb.js`
Move `services/duckdbQueryService.js` → `shared/utils/duckdb.js`.
Old location re-exports.

Commit: `refactor(analytics): extract shared/utils layer`

---

## Phase 4 — Extract Shared DB Layer

### 4a — `shared/db/models/apiKey.js`
Extract the `sequelize.define("api_keys", ...)` block from `app.js` into a
standalone function:
```js
function defineApiKeyModel(sequelize, DataTypes) { ... }
module.exports = { defineApiKeyModel };
```

### 4b — `shared/db/mainSequelize.js`
Extract Sequelize instantiation from `app.js` into:
```js
const { defineApiKeyModel } = require('./models/apiKey');
// creates sequelize, defines model, exports { sequelize }
```

### 4c — Update `app.js`
```diff
- const { Sequelize, DataTypes } = require("sequelize");
- const sequelize = new Sequelize(...);
- sequelize.define("api_keys", ...);
+ const { sequelize } = require("./shared/db/mainSequelize");
```

### 4d — `shared/db/tenantConnection.js`
Move `lib/tenantConnection.js` → `shared/db/tenantConnection.js`.
Old file re-exports.

### 4e — `shared/db/tenantRouterClient.js`
Move `lib/tenantRouterClient.js` → `shared/db/tenantRouterClient.js`.
Old file re-exports.

### 4f — `shared/db/brandConnectionManager.js`
Move `lib/brandConnectionManager.js` → `shared/db/brandConnectionManager.js`.
Old file re-exports.

Commit: `refactor(analytics): extract shared/db layer`

---

## Phase 5 — Extract Shared Middleware

### 5a — `shared/middleware/identityEdge.js`
Move `middlewares/identityEdge.js` → `shared/middleware/identityEdge.js`.
Old file re-exports.

### 5b — `shared/middleware/brandContext.js`
Move `middlewares/brandContext.js` → `shared/middleware/brandContext.js`.
Old file re-exports.

### 5c — `shared/middleware/apiKeyAuth.js`
Move `middlewares/apiKeyAuth.js` → `shared/middleware/apiKeyAuth.js`.
Old file re-exports.

### 5d — `shared/middleware/responseTime.js`
Extract inline response-time closure from `routes/metrics.js` router.use()
into a standalone middleware file:
```js
function responseTime(req, res, next) {
  if (!req._reqStart) req._reqStart = Date.now();
  const start = req._reqStart;
  const origEnd = res.end;
  res.end = function patchedEnd(...args) { ... };
  next();
}
module.exports = { responseTime };
```

### 5e — `shared/middleware/authOrApiKey.js`
Extract inline `authOrApiKey` from `routes/metrics.js` into a factory:
```js
function createAuthOrApiKeyMiddleware(apiKeyAuth) {
  return (req, res, next) => { ... };
}
```

### 5f — `shared/middleware/requireAuthorOrPipeline.js`
Extract inline `requireAuthorOrPipeline` from `routes/apiKeys.js`:
```js
function requireAuthorOrPipeline(req, res, next) { ... }
```

Commit: `refactor(analytics): extract shared/middleware layer`

---

## Phase 6 — Move Services into Modules

Every move creates a re-export shim at the old path. No functional changes.

| Old Path | New Path |
|----------|----------|
| `services/metricsSnapshotService.js` | `modules/metrics/snapshotService.js` |
| `services/metricsReportService.js` | `modules/metrics/reportService.js` |
| `services/metricsAggregateService.js` | `modules/metrics/aggregateService.js` |
| `services/metricsCacheService.js` | `modules/metrics/cacheService.js` |
| `services/metricsPageService.js` | `modules/metrics/pageService.js` |
| `services/metricsFoundation.js` | `modules/metrics/foundation.js` |
| `services/metricsRequestNormalizer.js` | `modules/metrics/requestNormalizer.js` |
| `services/productConversionService.js` | `modules/product-conversion/service.js` |
| `services/apiKeyService.js` | `modules/api-keys/service.js` |
| `controllers/externalController.js` | `modules/external/controller.js` |
| `controllers/metricsControllerSupport.js` | (inlined into modules/metrics/ controllers) |

### Remove wrapper functions during move:
- `metricsReportService.js`: delete `formatIstDate` (direct-call `formatUtcDate`)
- `metricsReportService.js`: delete `buildIstCutoffContext` (direct-call `buildCompletedHourCutoffContext`)
- `metricsSnapshotService.js`: delete `buildCutoffContext` (direct-call `buildLiveCutoffContext`)
- `metricsSnapshotService.js`: delete `getUtmAggregateSource` (direct-call `resolveUtmAggregateSource`)
- `metricsSnapshotService.js`: delete `appendProductFilter` (import from `shared/utils/metricsUtils`)

### Extract `ajrs_module.js` into `modules/ranvir/dataService.js`
Move all exported functions. Delete the IST_OFFSET_MINUTES constant
(use IST_OFFSET_MIN from `shared/utils/date.js`).

Commit: `refactor(analytics): move services into feature modules`

---

## Phase 7 — Decompose metricsController + Build Module Routers

### 7a — Split `controllers/metricsController.js`

| Handler(s) | Target File |
|------------|-------------|
| `hourlyTrend`, `dailyTrend`, `monthlyTrend` | `modules/metrics/trendController.js` |
| `orderSplit`, `paymentSalesSplit`, `trafficSourceSplit` | `modules/metrics/splitController.js` |
| `dashboardSummary`, `summaryFilterOptions`, `diagnoseTotalOrders` | `modules/metrics/summaryController.js` |
| `topProductPages`, `topProducts`, `productKpis`, `productTypes`, `hourlyProductSessionsExport`, `hourlySalesSummary` | `modules/metrics/productController.js` |
| `productConversion`, `productConversionCsv` | `modules/product-conversion/controller.js` |
| `hourlySalesCompare` | `modules/metrics/splitController.js` (sales-compare is a split variant) |

### 7b — `modules/metrics/index.js` (router)
Replaces `routes/metrics.js`. Imports from sub-controllers + shared middleware.
Old `routes/metrics.js` becomes re-export shim.

### 7c — `modules/product-conversion/index.js` (router)
Mounts `/product-conversion` and `/product-conversion/export`.
These routes are currently on the metrics router; they move to their own module router
but are still mounted under `/metrics` in `app.js` for backward compat:
```js
app.use("/metrics", metricsRouter);
app.use("/metrics", productConversionRouter);
```

### 7d — Other module routers
| Module | Old | New |
|--------|-----|----|
| api-keys | `routes/apiKeys.js` | `modules/api-keys/index.js` |
| shopify | `routes/shopify.js` | `modules/shopify/index.js` |
| uploads | `routes/uploads.js` | `modules/uploads/index.js` |
| notifications | `routes/notifications.js` | `modules/notifications/index.js` |
| external | `routes/external.js` | `modules/external/index.js` |
| ranvir | `routes/ranvir.js` | `modules/ranvir/index.js` |

Old route files become re-export shims.

### 7e — Rewrite `app.js` imports
```js
const { sequelize } = require("./shared/db/mainSequelize");
const metricsRouter = require("./modules/metrics");
const productConversionRouter = require("./modules/product-conversion");
const apiKeysRouter = require("./modules/api-keys");
// ... etc
```

Commit: `refactor(analytics): decompose controllers, build module routers`

---

## Phase 8 — Standardize Error Handling + Request Normalization

### 8a — `shared/middleware/handleControllerError.js`
```js
function handleControllerError(res, error, fallbackMessage) {
  const status = error.status || 500;
  const message = error.status ? error.message : fallbackMessage;
  logger.error(`[${fallbackMessage}]`, error);
  return res.status(status).json({ error: message });
}
```

### 8b — Update all controller handlers
Replace the repetitive try/catch error responses
with `handleControllerError(res, e, "descriptive tag")`.

### 8c — Standardize request normalization
All handlers that manually call `parseRangeQuery` + `extractFilters` + `ensureBrandSequelize`
switch to using `normalizeMetricRequest` consistently.

Remove `metricsControllerSupport.js` entirely — `parseRangeQuery` and `ensureBrandSequelize`
move into `modules/metrics/requestNormalizer.js`.

Commit: `refactor(analytics): standardize error handling and request normalization`

---

## Phase 9 — Remove Re-export Shims + Old Directories

Remove all backward-compat shims created in phases 3–7.
Delete now-empty directories:

```
rm -rf analytics/controllers/
rm -rf analytics/routes/
rm -rf analytics/services/
rm -rf analytics/middlewares/
rm -rf analytics/utils/
rm -rf analytics/lib/
rm -rf analytics/modules/README.md
```

Update `server.js` imports if any still point to old paths.

Commit: `chore(analytics): remove legacy shims and empty directories`

---

## Phase 10 — Update Tests + Scripts

### 10a — Update all import paths in `tests/unit/**/*.js`
Bulk find-replace:
```
../controllers/  →  ../modules/metrics/ (or appropriate module)
../routes/       →  ../modules/*/
../services/     →  ../modules/*/
../middlewares/   →  ../shared/middleware/
../utils/        →  ../shared/utils/
../lib/          →  ../shared/db/
```

### 10b — Update `scripts/` imports
Scripts that import from `../services/` or `../lib/` need path updates.

### 10c — Verify
```bash
npm test
node -e "require('./app')"
```

Commit: `test(analytics): update imports for modular monolith`

---

## Phase 11 — Final Cleanup

- Delete `_dead/` directory after confirming no regressions in staging
- Remove hardcoded startup banner version date from `server.js`
- Strip `console.log` debug statements from `externalController`, `ajrs_module`, `kafka`, `redis`, `brands`
- Clean logger.js of dead commented-out code (if not already done)

Commit: `chore(analytics): final dead code removal and cleanup`

---

## Risk Checklist

| Risk | Mitigation |
|------|------------|
| Broken imports during move | Every move leaves a re-export shim; shims removed only in Phase 9 |
| Tests fail mid-migration | Shims ensure old paths keep working; tests updated last |
| Sequelize model reference breaks | `shared/db/mainSequelize.js` exports same instance; `models.api_keys` stays on it |
| Docker build breaks | `Dockerfile` only references `server.js`; no path changes there |
| `scripts/` breaks | Scripts updated in Phase 10; they run against shims until then |
| `_dead/` files accidentally re-imported | Files only exist in `_dead/`, never on any import path |
