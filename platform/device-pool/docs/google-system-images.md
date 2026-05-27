# Google system images with ws-scrcpy display

Zeppole uses only **[google/android-emulator-container-scripts](https://github.com/google/android-emulator-container-scripts)** for Docker-based emulators. Browser display and control come from a **[ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy)** sidecar per deploy — not noVNC or Appium.

## Options in Zeppole

| Approach | System images | Display | Notes |
|----------|---------------|---------|--------|
| **Emulator images UI** | All images from `emu-docker list` (dynamic catalog) | ws-scrcpy on port 8000 at deploy | Recommended; requires KVM + `google-emulator-builder` |
| **Custom Google aemu tag** | Any tag you built or pulled (`zeppole-google:*`, `android-emulator-268719/*`, …) | ws-scrcpy sidecar at deploy | Set tag on **Emulators** deploy form |
| **Register URLs** | Any | Your external ws-scrcpy URL | Emulator runs outside Zeppole |

## Emulator images (UI builder)

When `npm run zeppole:up` is used (or Compose with `--profile emulators --profile builders`), the **Emulator images** page lets you:

1. Pick **API level**, **system image** (`google_apis`, `google_apis_playstore`, `aosp`, …), **ABI**, emulator **channel**, and optional **16 KB page size** from the live catalog.
2. Start a build; `google-emulator-builder` runs `emu-docker create` and applies a lean Zeppole boot overlay (no embedded display).
3. On **Emulators**, deploy a succeeded build by Docker tag.

At deploy time the bridge starts the emulator plus a **ws-scrcpy** sidecar. Open the display link and select **proxy over adb** in the ws-scrcpy UI.

Requirements: Linux Docker host with **KVM**, and matching `ZEPPOLE_IMAGE_BUILDER_TOKEN` on API and builder (autopilot sets this to the bridge token).

**Disk:** Google Play / newer API images download 1.5GB+ and Docker exports multi‑GB layers. Keep **at least 40GB free** under `/var/lib/docker` on the host. If a build fails with `no space left on device`:

```bash
df -h
docker system df
docker system prune -a   # removes unused images/containers — confirm before running
```

Then rebuild `google-emulator-builder` and start a new image build.

Failed builds automatically run **cleanup**: partial workspace under `/work/builds/<id>/bld`, intermediate tags, and dangling images are removed. The build log is kept for the UI.

## Runtime requirements

- Docker on a **Linux** host with `/dev/kvm`
- `docker-compose.kvm.yml` merged (or `npm run zeppole:up` on a host with KVM)
- Enough RAM/CPU per emulator instance
- ws-scrcpy image built or pulled (`ZEPPOLE_WSSCRCPY_IMAGE`, default `zeppole-ws-scrcpy:latest`)

## ws-scrcpy security

ws-scrcpy has **no built-in authentication**. Use lab-only networks or put a reverse proxy with auth in front of published display ports. Do not expose port 8000 directly on the public internet.

## What Zeppole does not replace

- **Physical devices** — still registered via device tokens
- **Appium** — removed from Zeppole emulator pods; workers use device tokens, not Appium
- **Google’s remote device farms** — out of scope for local deploy
