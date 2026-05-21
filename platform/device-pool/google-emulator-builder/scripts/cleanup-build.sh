#!/bin/bash
# Remove partial workspace and Docker images after a failed emulator image build.
set -uo pipefail

BUILD_ID="${1:?build id}"
TAG="${2:-}"
LOG_FILE="${3:-/work/builds/${BUILD_ID}/build.log}"
WORKDIR="/work/builds/${BUILD_ID}"

if [ "${ZEPPOLE_BUILD_SKIP_CLEANUP:-}" = "true" ]; then
  echo "[zeppole] Skipping cleanup (ZEPPOLE_BUILD_SKIP_CLEANUP=true)"
  exit 0
fi

echo "[zeppole] PHASE:cleanup"
echo "[zeppole] Cleaning up failed build ${BUILD_ID}..."

# Workspace artifacts (keep build.log, status, phase for the UI)
rm -rf "${WORKDIR}/bld" 2>/dev/null || true

BASE_TAG="zeppole-google-base:${BUILD_ID}"
for img in "$BASE_TAG" "$TAG"; do
  [ -z "$img" ] && continue
  if docker image inspect "$img" >/dev/null 2>&1; then
    echo "[zeppole] Removing image ${img}"
    docker rmi -f "$img" >/dev/null 2>&1 || echo "[zeppole] WARNING: could not remove ${img}"
  fi
done

# emu-docker tags intermediate sys-* images (see build log)
if [ -f "$LOG_FILE" ]; then
  grep -oE 'sys-[a-zA-Z0-9._-]+' "$LOG_FILE" 2>/dev/null | sort -u | while read -r sys_img; do
    [ -z "$sys_img" ] && continue
    if docker image inspect "$sys_img" >/dev/null 2>&1; then
      echo "[zeppole] Removing intermediate image ${sys_img}"
      docker rmi -f "$sys_img" >/dev/null 2>&1 || echo "[zeppole] WARNING: could not remove ${sys_img}"
    fi
  done
fi

# Dangling layers from failed docker build / export
docker image prune -f >/dev/null 2>&1 || true

if [ "${ZEPPOLE_BUILD_PRUNE_BUILDER:-}" = "true" ]; then
  docker builder prune -f >/dev/null 2>&1 || true
fi

echo "[zeppole] Cleanup finished for ${BUILD_ID}"
