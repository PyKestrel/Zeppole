# Migrating from the vendor bootstrap snapshot

The tree under `platform/device-pool/bootstrap-source` is a **point-in-time copy** of upstream Android-in-container tooling, stripped of analytics in Python (`cli/src/device/__init__.py`). Zeppole does **not** maintain a live git link to the upstream repository.

When updating emulator layers:

1. Import a new snapshot into a branch.
2. Re-apply Zeppole telemetry removals if upstream reintroduces calls.
3. Update `NOTICE` if licenses or attributions change.
4. Publish a new `zeppole-emulator` tag per `RELEASING.md`.
