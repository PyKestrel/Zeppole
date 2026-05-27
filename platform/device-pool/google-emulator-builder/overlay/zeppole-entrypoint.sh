#!/bin/bash
set -euo pipefail

GOOGLE_ENTRY="/android/sdk/launch-emulator.sh"
if [ ! -x "$GOOGLE_ENTRY" ]; then
  echo "Google launch-emulator.sh not found" >&2
  exit 1
fi

exec "$GOOGLE_ENTRY"
