# Releasing Zeppole

## Version tags

- Git tags use semantic versioning with a `v` prefix: `v1.2.3`.
- Container images published to your registry use the same version **without** the `v` prefix: `1.2.3` (Helm `image.tag`).

## Release checklist

1. Update changelog (human-readable summary of fixes and features).
2. Run `npm run test` and `npm run check:telemetry` at repository root.
3. Tag: `git tag -a v1.2.3 -m "Release v1.2.3"`.
4. Build and push images: `zeppole-api`, `zeppole-web`, `zeppole-worker`, `zeppole-emulator` (see `docker-compose.yml` and `platform/device-pool/Dockerfile`).

## Database migrations

From `platform/control-plane/api`:

```bash
npx prisma migrate deploy
```
