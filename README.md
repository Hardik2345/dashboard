# SaaS Dashboard (Docker Compose)

## Quick start
```bash
docker compose up -d --build
docker compose logs -f api-gateway
docker compose down
```

## Configuration
- Copy `.env.example` to `.env` and update shared values as needed.
- Service-specific configs live in:
  - `api-gateway/.env` (auth-service settings)
  - `tenant-router/.env`
  - `alerts-service/.env`
  - `analytics/.env`
