# Device pool (Android emulators)

Zeppole expects Android targets reachable from workers (ADB). This directory holds:

- **`google-emulator-builder/`** — builds Google [android-emulator-container-scripts](https://github.com/google/android-emulator-container-scripts) images with a lean Zeppole boot overlay. Used by the **Emulator images** UI.
- **`ws-scrcpy/`** — [ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy) sidecar image for browser display and control (port **8000**). One sidecar per deployed emulator pod.
- **`emulator-bridge/`** — optional sidecar used by the control plane **Emulators** UI to start/stop Google aemu + ws-scrcpy pods on a Docker host. See `emulator-bridge/README.md`.

## Building emulator images

Use the **Emulator images** page (requires `google-emulator-builder` from `npm run zeppole:up` or Compose with `--profile emulators --profile builders`).

The builder runs `emu-docker create` against Google's catalog (`emu-docker list` with static fallback) and applies a minimal overlay that boots the emulator cleanly. Display is **not** embedded in the emulator image — deploy attaches a **ws-scrcpy** sidecar at runtime.

See [docs/google-system-images.md](./docs/google-system-images.md).

## Deploy flow

1. Build an image on **Emulator images** (or use a prebuilt `zeppole-google:*` / `android-emulator-268719/*` tag).
2. On **Emulators**, deploy with that Docker tag.
3. The bridge creates a Docker network, starts the Google aemu container (KVM, internal ADB), and starts **ws-scrcpy** with a published port on **8000**.
4. Open the **Display** link; in ws-scrcpy select **proxy over adb** and a decoder (WebCodecs in Chrome works well).

## Hardware

Emulators require KVM/nested virtualization on Linux hosts. Plan CPU and RAM per concurrent emulator (see root `README.md` deployment notes).

## Security

ws-scrcpy has **no built-in authentication**. Restrict access via lab-only networks or a reverse proxy with auth in front of published display ports.
