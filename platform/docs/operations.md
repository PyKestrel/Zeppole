# Operations

## Backups

- **PostgreSQL**: use your platform’s volume snapshots or `pg_dump` against the `zeppole` database on your chosen schedule.
- **Artifacts**: wire object storage (S3-compatible) in your worker implementation and store URLs on `TestResult.artifactUrls`.

## Migrations

Apply with the API package:

```bash
cd platform/control-plane/api
npx prisma migrate deploy
```

Docker Compose runs `prisma migrate deploy` before `node dist/server.js`.

## Health checks

- API: `GET /health` → `{ "status": "ok", "service": "zeppole-api" }`
- Worker: logs heartbeat failures; devices show `lastHeartbeat` in the UI.

## Upgrades

1. Build and push new `zeppole-*` image tags.
2. Run database migrations before or during rollout (compat per release notes).
3. Rolling restart API → web → workers.

See `RELEASING.md` for versioning conventions.
