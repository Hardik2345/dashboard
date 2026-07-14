# Datum Health Monitor Success Semantics

## Health Contract
- The monitor now supports two success modes per endpoint:
  - `expectedStatus` for exact-code matching
  - `successStatusFamily` for family matching, currently `2xx`
- Precedence is exact first:
  - if `expectedStatus` is set, the response must match that code
  - otherwise, the monitor evaluates `successStatusFamily`
  - if older data has neither field, the monitor treats the endpoint as `2xx`

## Service API Inventory

### `sessions-service`
- `POST /sessions`
  - `201` on successful session creation
  - `200` when a duplicate session inside the ignore window is intentionally accepted
  - monitor guidance: probe-only, do not directly monitor this mutating route
- `GET /health`
  - `200`
  - monitor guidance: direct health route, `2xx`

### `tenant-router`
- `POST /tenant/create`
  - `201`
  - monitor guidance: probe-only
- `POST /tenant/pipeline/...` create-style flows
  - `201` in create cases, `200` in list/update cases
  - monitor guidance: probe-only
- `DELETE /tenant/cds/mappings/:brand_id`
  - `204`
  - monitor guidance: probe-only
- `GET /health`
  - `200`
  - monitor guidance: direct health route, `2xx`

### `alerts-service`
- Business routes include successful `201` and `202` responses
  - monitor guidance: probe-only for business workflows
- `GET /health`
  - `200` in healthy mode
  - monitor guidance: direct health route, `2xx`

### `merchant-requests-service`
- Create routes return `201`
  - monitor guidance: probe-only

### `api-gateway`
- `GET /health`
  - `200`
  - monitor guidance: direct health route, `2xx`
- authenticated business APIs return mixed `200/201`
  - monitor guidance: probe-only

### `analytics`
- read/process routes observed returning `200`
  - monitor guidance: direct monitoring only through health/probe routes unless a specific read-only endpoint is intentionally registered

## Monitoring Guidance
- Safe direct monitor candidates:
  - `/health`
  - dedicated `/health/monitor` probe routes
  - explicitly approved idempotent read endpoints with stable success semantics
- Probe-only business flows:
  - create/update/delete APIs
  - authenticated APIs
  - routes with real side effects or cleanup requirements

## Defaults
- Health and probe routes should register with `successStatusFamily: "2xx"` unless they truly require an exact code.
- Business endpoints should only use `expectedStatus` when they are intentionally and safely monitored directly.
