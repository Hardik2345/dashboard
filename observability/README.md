# Production Observability

This directory contains the repo-side configuration for the alerting rollout.

## Required SaaS Setup

Create these outside the repo:

- Sentry Cloud projects: `dashboard-frontend`, `api-gateway-auth`, `analytics-service`, `alerts-service`, `tenant-router`, `sessions-service`.
- Grafana Cloud stack with Prometheus remote-write and Loki credentials.
- Grafana Cloud email contact point: `prod-critical-email`.
- Optional Slack channels: `#prod-alerts-critical`, `#prod-alerts-warning`, `#prod-observability`.

## Required Environment Variables

Use the tracked placeholder files as the source of truth:

- Root Docker/Alloy values: `/.env.example`
- Auth service: `/api-gateway/.env.example`
- Analytics service: `/analytics/.env.example`
- Alerts service: `/alerts-service/.env.example`
- Tenant-router: `/tenant-router/.env.example`
- Sessions service: `/sessions-service/.env.example`
- Frontend: `/client/dashboard/.env.local.example`

Set per service:

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT=production`
- `SENTRY_RELEASE`
- `METRICS_ENABLED=true`
- `METRICS_AUTH_TOKEN`

Values:

- `SENTRY_DSN`: project DSN from that service's Sentry project.
- `SENTRY_ENVIRONMENT`: use `production` for production deploys.
- `SENTRY_RELEASE`: use the git SHA, Docker image tag, or deployment version.
- `SENTRY_TRACES_SAMPLE_RATE`: keep `0` initially; raise later only if tracing is needed.
- `METRICS_ENABLED`: set `true` in production to expose `/metrics`.
- `METRICS_AUTH_TOKEN`: one long random shared secret, identical in every backend service and Alloy.

Set for the Alloy collector:

- `GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL`
- `GRAFANA_CLOUD_PROMETHEUS_USERNAME`
- `GRAFANA_CLOUD_API_TOKEN`
- `GRAFANA_CLOUD_LOKI_URL`
- `GRAFANA_CLOUD_LOKI_USERNAME`
- `METRICS_AUTH_TOKEN`

Set for Grafana alert rule provisioning:

- `GRAFANA_STACK_URL`
- `GRAFANA_SERVICE_ACCOUNT_TOKEN`
- `GRAFANA_PROMETHEUS_DATASOURCE_UID` (optional if the stack has one Prometheus data source)
- `GRAFANA_ORG_ID=1`
- `GRAFANA_ALERT_FOLDER_UID`
- `GRAFANA_ALERT_FOLDER_TITLE`
- `GRAFANA_INCLUDE_WARNING_ALERTS=false`

Values:

- `GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL`: Grafana Cloud Prometheus remote-write endpoint.
- `GRAFANA_CLOUD_PROMETHEUS_USERNAME`: Grafana Cloud Prometheus instance/user id.
- `GRAFANA_CLOUD_API_TOKEN`: Grafana Cloud token with metrics publish and logs publish permissions.
- `GRAFANA_CLOUD_LOKI_URL`: Grafana Cloud Loki push endpoint.
- `GRAFANA_CLOUD_LOKI_USERNAME`: Grafana Cloud Loki instance/user id.
- `METRICS_AUTH_TOKEN`: same token used by app services.
- `GRAFANA_STACK_URL`: your stack URL, for example `https://your-stack.grafana.net`.
- `GRAFANA_SERVICE_ACCOUNT_TOKEN`: Grafana service account token with alerting provisioning permissions.
- `GRAFANA_PROMETHEUS_DATASOURCE_UID`: Prometheus data source UID; leave blank only if the script can auto-detect it.
- `GRAFANA_ORG_ID`: usually `1` in Grafana Cloud.
- `GRAFANA_INCLUDE_WARNING_ALERTS`: keep `false` until warning alerts have a non-email route.

Set for the frontend build:

- `VITE_SENTRY_DSN`
- `VITE_SENTRY_ENVIRONMENT=production`
- `VITE_SENTRY_RELEASE`

Values:

- `VITE_SENTRY_DSN`: DSN from the `dashboard-frontend` Sentry project.
- `VITE_SENTRY_ENVIRONMENT`: use `production` for production builds.
- `VITE_SENTRY_RELEASE`: same release identifier used by backend deploys when possible.
- `VITE_SENTRY_TRACES_SAMPLE_RATE`: keep `0` initially.

## Manual Setup Checklist

### Sentry Cloud

1. Create projects:
   - `dashboard-frontend`
   - `api-gateway-auth`
   - `analytics-service`
   - `alerts-service`
   - `tenant-router`
   - `sessions-service`
2. Copy each project DSN into the matching service env file.
3. Confirm events are grouped by `environment=production` and `release`.
4. Add alerting in Sentry for new high-priority issues if desired, but keep paging in Grafana/PagerDuty.

### Grafana Cloud

1. Create or open your Grafana Cloud stack.
2. Create a Cloud Access Policy token that can publish metrics and logs.
3. Copy Prometheus remote-write URL, Prometheus username, Loki URL, and Loki username into the root `.env`.
4. Create the `prod-critical-email` contact point.
5. Create a notification policy route:
   - `severity=critical` -> `prod-critical-email`
6. Leave warning alerts unrouted unless a non-email route exists.
7. Create a Grafana service account token for alert rule provisioning.
8. Apply the converted Grafana-managed rules:

```sh
node observability/grafana/apply-alert-rules.mjs --dry-run
node observability/grafana/apply-alert-rules.mjs
```

### Slack

1. Create channels:
   - `#prod-alerts-critical`
   - `#prod-alerts-warning`
   - `#prod-observability`
2. Connect Slack to Grafana contact points.
3. Send a test notification from Grafana to each channel.

### Deployment

1. Add the real env vars to the real ignored `.env` files.
2. Rebuild app images so new Sentry/Prometheus dependencies are included.
3. Start app stack.
4. Start observability stack with:

```sh
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

5. In Grafana Explore, verify metrics arrive:
   - `up`
   - `http_requests_total`
   - `fcm_send_total`
   - `tenant_route_resolve_total`
6. Trigger one safe test request to verify request metrics increase.

## Collector

Start the app stack first, then start the collector:

```sh
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

Alloy scrapes protected `/metrics` endpoints, node-exporter, and cAdvisor, then remote-writes metrics to Grafana Cloud and ships Docker logs to Loki.

## Alerts

`grafana/prometheus-alert-rules.yml` defines the Prometheus-style source alert set.
`grafana/grafana-managed-alert-rules.json` is the converted Grafana-managed source consumed by `grafana/apply-alert-rules.mjs`.

By default, the apply script provisions only critical alerts. This avoids warning email floods while the root notification policy still has an email fallback. Set `GRAFANA_INCLUDE_WARNING_ALERTS=true` only after warnings have a quiet route.

- `severity=critical`: `prod-critical-email`
- `severity=warning`: Grafana UI only for now, or optional Slack later

## Uptime Checks

Configure Grafana Synthetic Monitoring or Uptime Kuma for:

- Gateway: `/health`
- Auth: `/auth/health` if routed through gateway, or direct auth `/health`
- Analytics: `/analytics/health` if routed through gateway, or direct analytics `/health`
- Alerts: direct alerts `/health`
- Tenant-router: direct tenant-router `/health`
- Sessions: direct sessions `/health`
