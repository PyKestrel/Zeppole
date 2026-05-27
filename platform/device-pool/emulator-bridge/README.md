# Zeppole emulator bridge

Small sidecar that runs on a host with **Docker** (socket mounted). The Zeppole API calls it to start and stop **Google aemu + ws-scrcpy** pods and to discover the published **8000** (ws-scrcpy) display port.

## Configure the control plane API

Set on the API service:

- `ZEPPOLE_EMULATOR_BRIDGE_URL` — e.g. `http://emulator-bridge:9100` (same Docker network) or `http://host.docker.internal:9100` if the bridge runs on the host.
- `ZEPPOLE_EMULATOR_BRIDGE_TOKEN` — shared secret (same value as `BRIDGE_TOKEN` below).

## Bridge environment

| Variable | Description |
|----------|-------------|
| `BRIDGE_TOKEN` | **Required.** Bearer token (min 8 chars) shared with the API. |
| `PUBLIC_SCHEME` | Default `http`. |
| `PUBLIC_HOST` | Hostname or IP users and browsers use to reach published ports (e.g. `localhost` or your Proxmox VM IP). |
| `ZEPPOLE_WSSCRCPY_IMAGE` | ws-scrcpy sidecar image (default `zeppole-ws-scrcpy:latest`). Built by Compose service `ws-scrcpy`. |
| `EMULATOR_USE_KVM` | When `true`, pass `/dev/kvm` into emulator containers (Linux hosts only). |
| `PORT` | Listen port (default `9100`). |

Deploy requests must include a **Google aemu image tag** (from Emulator images builds or an explicit registry tag). There is no default budtmo/docker-android image.

## Deploy pod layout

Each deploy creates:

1. Docker network `zeppole-emu-{shortId}`
2. Emulator container on that network (KVM, ADB internal on 5555)
3. ws-scrcpy sidecar `{name}-display` with `-p 0:8000`, `adb connect` to the emulator

`displayUrl` is `{PUBLIC_SCHEME}://{PUBLIC_HOST}:{publishedPort}/`.

## Docker Compose (profile `emulators`)

From the repo root, with a `.env` that sets matching tokens:

```bash
ZEPPOLE_EMULATOR_BRIDGE_TOKEN=your-long-random-secret
ZEPPOLE_EMULATOR_BRIDGE_URL=http://emulator-bridge:9100
ZEPPOLE_PUBLIC_HOST=localhost
ZEPPOLE_WSSCRCPY_IMAGE=zeppole-ws-scrcpy:latest
```

Then:

```bash
docker compose --profile emulators --profile builders up --build
```

Expose the published ws-scrcpy ports from the **Docker host** to your workstation if needed (SSH tunnel, firewall rules).

## ws-scrcpy operator notes

- On first connect, choose **proxy over adb** for Google emulators.
- Prefer **WebCodecs** decoder in Chrome for lower latency.
- ws-scrcpy has **no auth** — do not expose port 8000 on the public internet without a reverse proxy.

## Linux / KVM

The bridge checks whether the **Docker host** can pass `/dev/kvm` into containers (probe via `docker run --device /dev/kvm`, or `/dev/kvm` mounted into this service).

On a Linux VM with KVM, merge from the repo root:

```bash
docker compose -f docker-compose.yml -f docker-compose.autopilot.yml -f docker-compose.kvm.yml --profile emulators up -d --build
```

`docker-compose.kvm.yml` mounts `/dev/kvm` into `emulator-bridge`. Without it, the UI may show “KVM not detected” even when the VM has KVM, because the bridge container could not see the device.

On **Docker Desktop (Windows/macOS)** KVM is not available to containers; use **Register URLs** in the UI instead.

## Security

The bridge can start arbitrary containers if its token leaks. Restrict network access, rotate `BRIDGE_TOKEN`, and do not expose the bridge port on the public internet without TLS and auth at the edge.
