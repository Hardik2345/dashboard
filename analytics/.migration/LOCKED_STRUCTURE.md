# Locked Directory Structure — Analytics Service

> Locked on: 2026-04-03
> Status: APPROVED — do not modify without re-approval

```
analytics/
├── app.js
├── server.js
│
├── _dead/
│   ├── kafka.js
│   ├── socket-emit.js
│   ├── brandHelpers.js
│   └── ranvir-alias-route.js
│
├── modules/
│   ├── metrics/
│   │   ├── index.js
│   │   ├── trendController.js
│   │   ├── splitController.js
│   │   ├── summaryController.js
│   │   ├── productController.js
│   │   ├── snapshotService.js
│   │   ├── reportService.js
│   │   ├── aggregateService.js
│   │   ├── cacheService.js
│   │   ├── pageService.js
│   │   ├── foundation.js
│   │   └── requestNormalizer.js
│   ├── product-conversion/
│   │   ├── index.js
│   │   ├── controller.js
│   │   └── service.js
│   ├── api-keys/
│   │   ├── index.js
│   │   └── service.js
│   ├── shopify/
│   │   ├── index.js
│   │   └── uploadService.js
│   ├── uploads/
│   │   ├── index.js
│   │   └── s3Service.js
│   ├── notifications/
│   │   └── index.js
│   ├── external/
│   │   ├── index.js
│   │   └── controller.js
│   └── ranvir/
│       ├── index.js
│       └── dataService.js
│
├── shared/
│   ├── db/
│   │   ├── mainSequelize.js
│   │   ├── tenantConnection.js
│   │   ├── tenantRouterClient.js
│   │   ├── brandConnectionManager.js
│   │   └── models/
│   │       └── apiKey.js
│   ├── middleware/
│   │   ├── identityEdge.js
│   │   ├── brandContext.js
│   │   ├── apiKeyAuth.js
│   │   ├── responseTime.js
│   │   ├── authOrApiKey.js
│   │   └── requireAuthorOrPipeline.js
│   └── utils/
│       ├── date.js
│       ├── sql.js
│       ├── filters.js
│       ├── metricsUtils.js
│       ├── sessionUtils.js
│       ├── logger.js
│       └── duckdb.js
│
├── config/
│   └── brands.js
│
├── validation/
│   └── schemas.js
│
├── scripts/               (untouched — operational scripts)
│   └── ...
│
└── tests/                 (untouched — update imports at the end)
    └── unit/
        └── ...
```
