# Production readiness checklist

## Required configuration

1. **PostgreSQL**: Managed or self-hosted; apply migrations (`npx prisma migrate deploy` from `platform/control-plane/api`).
2. **JWT_SECRET**: At least 32 random characters; never commit real secrets. Blocked placeholders are rejected when `NODE_ENV=production` (see `src/lib/env.ts`).
3. **TLS**: Terminate HTTPS at your ingress/load balancer; set `TRUST_PROXY=true` on the API when `X-Forwarded-*` headers are trustworthy so rate limits use client IPs correctly.
4. **Secrets**: Store `DATABASE_URL`, `JWT_SECRET`, and webhook secrets in a secret manager or Kubernetes Secrets.

## Observability

- Health: `GET /health` (use for Docker/Kubernetes probes).
- Logs: Structured Fastify logs; ship to your aggregation stack.
- Webhooks: Outbound POST with `X-Zeppole-Signature: sha256=<hmac>` (see `platform/docs/security.md`).

## Docker Compose limitations

The bundled `docker-compose.yml` is suitable for labs. Change default passwords and JWT values before any shared environment.

## Workers

Run one worker process per registered device token (or scale horizontally with distinct tokens). Replace the stub in `platform/execution-workers/worker` with Appium + your pool.
