# Google system images with noVNC and Appium

Google does **not** ship an official Docker image that bundles the Android Emulator, noVNC, and Appium the way `budtmo/docker-android` does.

What Google **does** provide (and what Zeppole uses when you build `zeppole-emulator`):

- **SDK packages** installed with `sdkmanager`, for example:
  - `system-images;android-34;google_apis;x86_64` — Google APIs (no Play Store)
  - `system-images;android-34;google_apis_playstore;x86_64` — Google Play system image (when available for that API level)
- **Command-line emulator** from the Android SDK (`emulator`, `avdmanager`)

The vendored build in `platform/device-pool/bootstrap-source/docker/emulator` layers **official `google_apis` system images** onto the docker-android runtime, which already includes **noVNC (6080)** and **Appium (4723)** when you run with `WEB_VNC=true` and `APPIUM=true`.

## Options in Zeppole

| Approach | Latest Android | noVNC | Appium | Notes |
|----------|----------------|-------|--------|--------|
| **Prebuilt `budtmo/docker-android:emulator_14.0`** | API 34 (Android 14) | Yes | Yes | Easiest; set in UI or `ZEPPOLE_EMULATOR_IMAGE` |
| **Build `zeppole-emulator`** | Choose API at build time | Yes | Yes | Uses Google SDK packages via `sdkmanager`; see below |
| **Register URLs** | Any | Your host | Your host | Emulator runs outside Zeppole (Proxmox, bare metal, etc.) |
| **Emulator images UI** | Catalog API levels | Yes (6080) | Yes (4723) | Builds via [android-emulator-container-scripts](https://github.com/google/android-emulator-container-scripts); deploy on **Emulators** with runtime **Google aemu** |

## Emulator images (UI builder)

When `npm run zeppole:up` is used (or Compose with `--profile emulators --profile builders`), the **Emulator images** page lets you:

1. Pick **API level**, **system image** (`google_apis`, `google_apis_playstore`, `aosp`), **ABI**, emulator **channel**, and optional **16 KB page size**.
2. Enable **browser display** (HTTP refresh on port 6080) and **Appium** (4723).
3. Start a build; the `google-emulator-builder` service runs `emu-docker create` and layers the Zeppole overlay.
4. On **Emulators**, choose a succeeded build (or set runtime **Google aemu** and your `dockerTag`).

Requirements: Linux Docker host with **KVM**, and matching `ZEPPOLE_IMAGE_BUILDER_TOKEN` on API and builder (autopilot sets this to the bridge token).

**Disk:** Google Play / API 35 images download ~1.5GB+ and Docker exports multi‑GB layers. Keep **at least 40GB free** under `/var/lib/docker` on the host (not just inside the builder container). If a build fails with `no space left on device`, on the host run:

```bash
df -h
docker system df
docker system prune -a   # removes unused images/containers — confirm before running
```

Then rebuild `google-emulator-builder` and start a new image build.

Failed builds automatically run **cleanup**: partial workspace under `/work/builds/<id>/bld`, intermediate tags (`zeppole-google-base:<id>`, `sys-*` from the log), and dangling images are removed. The build log is kept for the UI.

## Build `zeppole-emulator` (Google APIs, your registry)

On a Linux machine with Docker and KVM:

```bash
# From repo root — builds with official google_apis system image for API 34 (Android 14)
npm run zeppole:build-emulator

# Android 13 / API 33
npm run zeppole:build-emulator -- --android 13.0

# Google Play system image (when sdkmanager offers it for that API)
npm run zeppole:build-emulator -- --android 14.0 --variant google_apis_playstore
```

Then in the Emulators UI, set **Image (optional)** to `zeppole-emulator:14.0-google_apis` (or your registry prefix), or set in `zeppole.autopilot.env`:

```env
ZEPPOLE_EMULATOR_IMAGE=zeppole-emulator:14.0-google_apis
```

Redeploy the stack so `emulator-bridge` picks up the default.

## Newer API levels (Android 15+)

SDK availability changes over time. To try a newer API level:

```bash
npm run zeppole:build-emulator -- --api 35 --android 15.0
```

If `sdkmanager` cannot download that system image, the build fails — use the highest API level Google lists in `sdkmanager --list` on your build host.

## Runtime requirements

Same as any KVM-backed emulator on Zeppole:

- Docker on a **Linux** host with `/dev/kvm`
- `docker-compose.kvm.yml` merged (or `npm run zeppole:up` on a host with KVM)
- Enough RAM/CPU per emulator instance

## What Zeppole does not replace

- **Physical devices** — still registered via device tokens
- **Genymotion Cloud** — separate integration in upstream docker-android (not wired in Zeppole UI by default)
- **Google’s remote device farms** — out of scope for local docker-android deploy
