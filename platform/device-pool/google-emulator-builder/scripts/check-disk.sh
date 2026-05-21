#!/bin/bash
# Check Docker host free space (via mounted docker.sock). Used before large aemu builds.
set -euo pipefail

MIN_GB="${ZEPPOLE_BUILD_MIN_FREE_GB:-40}"

echo "[zeppole] Docker disk summary (host):"
docker system df 2>/dev/null || echo "[zeppole] WARNING: could not run docker system df"

ROOT_DIR="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
echo "[zeppole] Docker root on host: ${ROOT_DIR}"

FREE_GB="$(docker run --rm -v /:/host:ro alpine:3.20 sh -c \
  "df -BG /host${ROOT_DIR} 2>/dev/null | awk 'NR==2 {print \$4}' | tr -d G" 2>/dev/null || echo "0")"

echo "[zeppole] Approximate free space at Docker root: ${FREE_GB}G (need >= ${MIN_GB}G for Play/API images)"

if [ "${FREE_GB}" -lt "${MIN_GB}" ] 2>/dev/null; then
  echo "[zeppole] ERROR: insufficient disk on Docker host (${FREE_GB}G free, ${MIN_GB}G required)."
  echo "[zeppole] On the host run: df -h && docker system df && docker system prune -a (removes unused images)"
  exit 1
fi
