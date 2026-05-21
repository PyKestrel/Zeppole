# Device pool (Android emulators)

Zeppole expects Android targets reachable from workers (ADB / Appium). This directory holds:

- **`bootstrap-source/`** — vendor snapshot used as the basis for building `zeppole-emulator` images. Telemetry in the Python bootstrap has been removed; see `bootstrap-source/documentations/ZEPPOLE_SNAPSHOT.md`.
- **`emulator-bridge/`** — optional sidecar used by the control plane **Emulators** UI to start/stop docker-android containers on a Docker host. See `emulator-bridge/README.md`.

## Building `zeppole-emulator` (official Google system images)

Google does not publish a Docker image with noVNC + Appium. Zeppole builds **`zeppole-emulator`** from `bootstrap-source/docker/emulator`, which installs **official SDK packages** (`google_apis` / optional Play Store variant) via `sdkmanager`, on the docker-android runtime (noVNC **6080**, Appium **4723**).

```bash
npm run zeppole:build-emulator              # Android 14 / API 34, google_apis
npm run zeppole:build-emulator -- --android 13.0
```

See [docs/google-system-images.md](./docs/google-system-images.md). Set `ZEPPOLE_EMULATOR_IMAGE` or the Emulators UI **Image** field to your built tag.

Prebuilt shortcut (no local build): **`budtmo/docker-android:emulator_14.0`** (default in compose).

## Hardware

Emulators require KVM/nested virtualization on Linux hosts. Plan CPU and RAM per concurrent emulator (see root `README.md` deployment notes).
