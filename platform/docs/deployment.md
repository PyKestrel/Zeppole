# Deployment

## Docker Compose (recommended for labs)

From the repository root:

```bash
docker compose up --build
```

- Postgres data volume: `zeppole-pg`
- Web on port **8080** proxies `/api/` to the API container (`zeppole-web` nginx uses upstream hostname `api`, matching the compose service name).

Start the worker **after** creating a device and copying its token:

```bash
export ZEPPOLE_DEVICE_TOKEN='...'
docker compose --profile with-worker up -d
```

## Kubernetes / Helm

See `deploy/helm/zeppole`. The chart is a **starting point**: wire your Postgres endpoint (managed RDS, Cloud SQL, or an in-cluster chart), image registry (`ghcr.io/<org>/zeppole-*`), and ingress. The bundled `zeppole-web` image expects an nginx upstream name matching your API `Service` (`zeppole-api:4000`); rebuild the web image with an appropriate `nginx.conf` if your service name differs.

## Environment variables (API)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Strong secret for user JWTs |
| `PORT` / `HOST` | Listen address (default `4000` / `0.0.0.0`) |
| `ZEPPOLE_PUBLIC_DOCS_URL` | Optional URL for `User-Agent` suffix metadata |

## Environment variables (worker)

| Variable | Description |
|----------|-------------|
| `ZEPPOLE_API_URL` | Base URL including `/api/v1` |
| `ZEPPOLE_DEVICE_TOKEN` | Token shown once at device registration |
