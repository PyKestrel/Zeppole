# Zeppole

Zeppole is a self-hosted **Android UI testing control plane**: projects, test cases, test cycles, multi-device runs, worker execution, and reporting—**no product telemetry** (see `POLICY-NO-TELEMETRY.md`).

## Repository layout

| Path | Purpose |
|------|---------|
| `platform/control-plane/api` | Fastify REST API (`/api/v1`), OpenAPI UI at `/api/docs` |
| `platform/control-plane/web` | React management console |
| `platform/execution-workers/worker` | Poll-based worker that claims jobs and publishes results |
| `platform/device-pool/bootstrap-source` | One-time vendor snapshot used for Android emulator images (telemetry stripped in Python bootstrap) |
| `platform/docs` | Architecture, deployment, operations, security |
| `deploy/helm/zeppole` | Helm chart (optional) |
| `scripts/check-no-telemetry.mjs` | CI guard against telemetry patterns |

## Quick start (development)

Prerequisites: Node.js 20+, PostgreSQL 16+.

```bash
cd platform/control-plane/api
cp .env.example .env
# edit DATABASE_URL + JWT_SECRET

npm install
npx prisma migrate deploy
npm run dev
```

In another shell:

```bash
cd platform/control-plane/web
npm install
npm run dev
```

1. Open `http://localhost:5173` — Vite proxies `/api` to `http://127.0.0.1:4000`.
2. Create the admin user via **Create admin** when prompted, or call `POST /api/v1/auth/bootstrap`.
3. Create a project, test cases, a cycle (attach cases), register a **device** token, then run **docker compose** worker or run `npm run dev` in `platform/execution-workers/worker` with `ZEPPOLE_DEVICE_TOKEN`.

## One-command autopilot (recommended for labs)

Prerequisites: **Docker** with Compose v2.20+ and (for Android emulators on Linux) **KVM**.

From the repository root:

```bash
npm install
npm run zeppole:up
```

This will:

1. Create `zeppole.autopilot.env` (once) with **JWT**, **emulator-bridge token**, and a random **admin password** — and print the sign-in line to your terminal.
2. Start Postgres, API, Web, **emulator-bridge** (Docker socket), **worker-bootstrap** (creates admin + automation device + writes token to a shared volume), and the **worker** (reads the token from that volume — no copy/paste).
3. Wire the API to the bridge so the **Emulators** page can start containers from the UI.

- Web UI: `http://localhost:8080` — sign in as **`admin@zeppole.local`** (password shown once when the env file is created, and stored as `ZEPPOLE_ADMIN_PASSWORD` in `zeppole.autopilot.env`).
- noVNC / Appium links use `ZEPPOLE_PUBLIC_HOST` (default `localhost`); change it in the env file if you browse from another machine.

Full wipe and recreate:

```bash
npm run zeppole:up -- --reset
```

If `worker-bootstrap` exits with code 1, inspect logs:

```bash
docker logs zeppole-worker-bootstrap-1
```

Typical causes: empty `ZEPPOLE_ADMIN_PASSWORD` (fixed by loading `zeppole.autopilot.env` into the container), or an old Postgres volume with a different admin password than your current env file — use `npm run zeppole:up -- --reset` for a full wipe.

Re-issue only the worker device token (keep DB):

```bash
npm run zeppole:up -- --reset-runtime
npm run zeppole:up
```

## Docker Compose (manual / CI)

```bash
docker compose up --build
```

- UI + API proxy: `http://localhost:8080` (nginx → API `/api/`)
- API direct: `http://localhost:4000`

Start the worker after registering a device:

```bash
export ZEPPOLE_DEVICE_TOKEN='<paste token from UI>'
docker compose --profile with-worker up --build
```

## Branding

Product identifiers follow `zeppole`, image names `zeppole-<component>`, env prefix `ZEPPOLE_`. See `RELEASING.md`.

## Production

See [PRODUCTION.md](PRODUCTION.md) for TLS, secrets, `TRUST_PROXY`, and JWT requirements.

## License

Zeppole-authored code is licensed under Apache 2.0 (`LICENSE`). Third-party materials are described in `NOTICE`. The device bootstrap snapshot retains upstream copyright notices in its tree; analytics code paths were removed for Zeppole.
