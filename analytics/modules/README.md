# Analytics Module Boundaries

This service is intentionally scoped as an analytics-focused modular monolith.

## Retained in analytics

- `identity-edge`
  - trusted upstream principal validation
  - upstream role checks
- `machine-access`
  - API key validation
  - rate limiting for direct machine callers
  - API key administration endpoints
- `tenant-runtime`
  - tenant routing
  - tenant DB connection and brand context
- `analytics-core`
  - metrics, reports, product/page analytics, cache-backed query paths
- `integrations`
  - generic uploads
  - notifications topic subscription
  - Shopify upload flow
- `ops-diagnostics`
  - diagnostic endpoints that still read analytics data

## Removed from analytics

- browser/session authentication
- local login and logout
- Google OAuth
- author/admin identity lifecycle
- access-control whitelist and domain policy
- brand provisioning and Render deploy control-plane

## Upstream identity contract

Analytics trusts the upstream gateway to provide:

- `x-user-id`
- `x-brand-id` or `x-brand-key`
- `x-role`
- optional `x-email`
- `x-gw-ts`
- `x-gw-sig`

Downstream analytics handlers continue to receive:

- `req.user` for trusted upstream-authenticated principals
- `req.apiKey` for direct machine callers
- `req.brandKey`, `req.brandDb`, `req.tenantRoute` from tenant runtime
