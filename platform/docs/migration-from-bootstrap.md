# Migrating from docker-android / budtmo to Google aemu + ws-scrcpy

Zeppole previously used a vendored **docker-android** snapshot under `platform/device-pool/bootstrap-source` to build `zeppole-emulator` images with noVNC and Appium. That path has been **removed**.

## Current architecture

- **Images:** built via [android-emulator-container-scripts](https://github.com/google/android-emulator-container-scripts) (`google-emulator-builder`, **Emulator images** UI).
- **Display:** [ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy) sidecar per deploy (port **8000**), not embedded noVNC.
- **Appium:** removed from emulator pods; workers use device tokens.

## Operator migration

1. Rebuild the stack with `--profile emulators --profile builders` (includes `ws-scrcpy`, `google-emulator-builder`, `emulator-bridge`).
2. Build at least one Google image on **Emulator images**.
3. Deploy from **Emulators** with the new Docker tag.
4. Open the ws-scrcpy display link and select **proxy over adb**.
5. Remove old budtmo containers/images on the host: `docker rm` / `docker rmi budtmo/*`.

Existing DB rows with legacy noVNC (6080) `displayUrl` values remain valid only as manual bookmarks; new deploys receive ws-scrcpy URLs.

See `platform/device-pool/docs/google-system-images.md` for build and runtime requirements.
