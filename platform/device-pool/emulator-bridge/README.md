# Zeppole emulator bridge

Small sidecar that runs on a host with **Docker** (socket mounted). The Zeppole API calls it to start and stop **docker-android**-style containers and to discover published **6080** (noVNC) and **4723** (Appium) ports.

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
| `EMULATOR_IMAGE` | Default `budtmo/docker-android:emulator_11.0`. |
| `PORT` | Listen port (default `9100`). |

## Docker Compose (profile `emulators`)

From the repo root, with a `.env` that sets matching tokens:

```bash
ZEPPOLE_EMULATOR_BRIDGE_TOKEN=your-long-random-secret
ZEPPOLE_EMULATOR_BRIDGE_URL=http://emulator-bridge:9100
ZEPPOLE_PUBLIC_HOST=localhost
```

Then:

```bash
docker compose --profile emulators up --build
```

Expose the published emulator ports from the **Docker host** to your workstation if needed (SSH tunnel, firewall rules).

## Linux / KVM

KVM is **opt-in**. The bridge only passes `--device /dev/kvm` when **both** are true:

1. `EMULATOR_USE_KVM=true`
2. `/dev/kvm` is visible inside the bridge container (mount it from the host).

Example for a Linux lab host:

```yaml
emulator-bridge:
  environment:
    EMULATOR_USE_KVM: "true"
  devices:
    - /dev/kvm:/dev/kvm
```

On **Docker Desktop (Windows/macOS)** leave `EMULATOR_USE_KVM` unset/false. Older bridge versions always added KVM on Linux and could leave emulator containers stuck in `Created` with `no such file or directory` for `/dev/kvm`.

## Security

The bridge can start arbitrary containers if its token leaks. Restrict network access, rotate `BRIDGE_TOKEN`, and do not expose the bridge port on the public internet without TLS and auth at the edge.
