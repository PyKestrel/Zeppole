# Zeppole: no telemetry policy

Zeppole MUST NOT ship or enable:

- Google Forms, Google Sheets analytics APIs, or equivalent form endpoints used for product telemetry
- Third-party analytics or advertising SDKs in server, worker, web, or device bootstrap code
- Outbound requests that exfiltrate usage data except those explicitly configured by the operator (e.g. webhooks the operator registers, SMTP they configure, or artifact storage they provide)

CI enforces this via `scripts/check-no-telemetry.mjs` and dependency/network checks as described in `platform/docs/security.md`.
