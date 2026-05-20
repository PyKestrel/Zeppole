# Helm chart (starter)

This chart demonstrates labels and image naming for **Zeppole**. Before production use:

1. Point `DATABASE_URL` at your managed Postgres (the template assumes an in-cluster service `zeppole-postgresql`).
2. Align `zeppole-web` nginx upstream with your API `Service` DNS name (rebuild the web image if not `zeppole-api:4000`).
3. Add an Ingress or Gateway resource per your platform.

The chart does **not** ship a full Postgres subchart by default; integrate Bitnami/RDS/etc. per environment.
