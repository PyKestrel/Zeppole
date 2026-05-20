# Security

## Authentication

- **Users**: JWT issued by `/api/v1/auth/login` or `/api/v1/auth/bootstrap`. Store `JWT_SECRET` in a secret manager.
- **Devices**: opaque Bearer tokens (`tokenLookup` + secret); only a bcrypt hash is stored server-side.

## RBAC

Roles (high → low): `ADMIN`, `QA_LEAD`, `AUTOMATION`, `VIEWER`. Enforcement is in route handlers (`platform/control-plane/api/src/lib/roles.ts`).

## Telemetry policy

Zeppole ships **without** product telemetry. CI runs `scripts/check-no-telemetry.mjs` to block known patterns (e.g. Google Forms endpoints, legacy analytics symbols). Operators may still configure **their own** outbound integrations (SMTP, webhooks, artifact storage).

## Network

For strict environments, restrict worker egress and allow only your artifact store and device/Appium endpoints.

## Webhooks

Operators register HTTPS URLs in the control plane. On terminal run states, Zeppole POSTs JSON with header `X-Zeppole-Signature: sha256=<hex>` where the hex is `HMAC-SHA256(webhook_secret, raw_body)`. Subscribe to events `run.finished` or `run.completed` (both are accepted). Verify the signature using your stored secret before trusting the payload.
