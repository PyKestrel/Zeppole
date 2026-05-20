# Device pool (Android emulators)

Zeppole expects Android targets reachable from workers (ADB / Appium). This directory holds:

- **`bootstrap-source/`** — vendor snapshot used as the basis for building `zeppole-emulator` images. Telemetry in the Python bootstrap has been removed; see `bootstrap-source/documentations/ZEPPOLE_SNAPSHOT.md`.
- **`emulator-bridge/`** — optional sidecar used by the control plane **Emulators** UI to start/stop docker-android containers on a Docker host. See `emulator-bridge/README.md`.

## Building `zeppole-emulator`

Upstream publishes maintained Docker layers for many API levels. For Zeppole you should:

1. Choose the Android API level you need from the snapshot’s release documentation.
2. Build and tag **`zeppole-emulator:<version>`** in your registry (do not publish under the upstream image name).
3. Reference that image from your execution environment (Proxmox VM + Docker, Kubernetes device DaemonSets, etc.).

The exact Dockerfile paths vary by upstream release layout; pin a release tag when importing new sources.

## Hardware

Emulators require KVM/nested virtualization on Linux hosts. Plan CPU and RAM per concurrent emulator (see root `README.md` deployment notes).
