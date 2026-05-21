#!/bin/bash
set -euo pipefail

GOOGLE_ENTRY="/android/sdk/launch-emulator.sh"
if [ -x "$GOOGLE_ENTRY" ]; then
  "$GOOGLE_ENTRY" &
  EMU_PID=$!
else
  echo "Google launch-emulator.sh not found" >&2
  exit 1
fi

export ZEPPOLE_ENABLE_APPIUM="${ZEPPOLE_ENABLE_APPIUM:-true}"
export ZEPPOLE_ENABLE_NOVNC="${ZEPPOLE_ENABLE_NOVNC:-true}"

for _ in $(seq 1 180); do
  if adb shell getprop sys.boot_completed 2>/dev/null | grep -q 1; then
    break
  fi
  sleep 2
done

if [ "$ZEPPOLE_ENABLE_APPIUM" = "true" ]; then
  appium --address 0.0.0.0 --port 4723 --allow-insecure adb_shell &
fi

if [ "$ZEPPOLE_ENABLE_NOVNC" = "true" ]; then
  python3 /usr/local/bin/display-http.py &
fi

wait "$EMU_PID"
