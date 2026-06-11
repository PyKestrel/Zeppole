#!/bin/bash
set -euo pipefail

ADB_HOST="${ADB_HOST:-emulator}"
ADB_PORT="${ADB_PORT:-5555}"
ADB_SERIAL="${ADB_HOST}:${ADB_PORT}"
export WS_SCRCPY_CONFIG="${WS_SCRCPY_CONFIG:-/app/config.yaml}"

# Connect to the emulator in the background so the web UI is reachable
# immediately (first boot of a Play image can take several minutes).
# The device shows up in ws-scrcpy once ADB answers; afterwards keep the
# connection alive in case the emulator container restarts.
(
  echo "[zeppole-ws-scrcpy] waiting for ${ADB_SERIAL}..."
  for _ in $(seq 1 600); do
    adb connect "${ADB_SERIAL}" >/dev/null 2>&1 || true
    if adb -s "${ADB_SERIAL}" shell getprop sys.boot_completed 2>/dev/null | grep -q 1; then
      echo "[zeppole-ws-scrcpy] emulator ready at ${ADB_SERIAL}"
      break
    fi
    sleep 2
  done
  if ! adb -s "${ADB_SERIAL}" shell getprop sys.boot_completed 2>/dev/null | grep -q 1; then
    echo "[zeppole-ws-scrcpy] WARNING: emulator not ready after 20 min; still retrying in background" >&2
  fi
  while true; do
    adb connect "${ADB_SERIAL}" >/dev/null 2>&1 || true
    sleep 30
  done
) &

cd /app/dist
exec node ./index.js
