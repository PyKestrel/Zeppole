#!/bin/bash
set -euo pipefail

ADB_HOST="${ADB_HOST:-emulator}"
ADB_PORT="${ADB_PORT:-5555}"
ADB_SERIAL="${ADB_HOST}:${ADB_PORT}"
export WS_SCRCPY_CONFIG="${WS_SCRCPY_CONFIG:-/app/config.yaml}"

echo "[zeppole-ws-scrcpy] waiting for ${ADB_SERIAL}..."

for _ in $(seq 1 180); do
  adb connect "${ADB_SERIAL}" >/dev/null 2>&1 || true
  if adb -s "${ADB_SERIAL}" shell getprop sys.boot_completed 2>/dev/null | grep -q 1; then
    echo "[zeppole-ws-scrcpy] emulator ready at ${ADB_SERIAL}"
    break
  fi
  sleep 2
done

if ! adb -s "${ADB_SERIAL}" shell getprop sys.boot_completed 2>/dev/null | grep -q 1; then
  echo "[zeppole-ws-scrcpy] ERROR: emulator did not become ready at ${ADB_SERIAL}" >&2
  exit 1
fi

cd /app/dist
exec node ./index.js
