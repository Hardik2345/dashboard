# Dashboard Platform

Multi-service dashboard platform with gateway-authenticated APIs, analytics workloads, alerts management, tenant routing, and a React frontend.

## Services

- `api-gateway`: OpenResty gateway and auth service code
- `analytics`: Metrics APIs, uploads, API key management, and pipeline helpers
- `alerts-service`: Alert configuration, tracking ingestion, and push workflows
- `sessions-service`: Session ingestion service
- `tenant-router`: Tenant resolution and pipeline credentials APIs
- `client/dashboard`: React + Vite frontend

## Quick Start

```bash
docker compose up -d --build
docker compose logs -f api-gateway
docker compose down
```

Gateway URL in local compose:

```text
http://localhost:8081
```

## Documentation

- Full docs index: [docs/README.md](docs/README.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- API reference: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- OpenAPI spec: [docs/openapi.yaml](docs/openapi.yaml)
- Environment variable matrix: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)

## Configuration

Repository uses shared and service-level env files.

- Root shared env: `.env`
- Service env files:
  - `api-gateway/.env`
  - `tenant-router/.env`
  - `alerts-service/.env`
  - `analytics/.env`
  - `sessions-service/.env`

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for variable names discovered from source code.
