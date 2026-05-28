#!/bin/bash
# Build a Zeppole Google aemu image using emu-docker + minimal boot overlay.
set -euo pipefail

BUILD_ID="${1:?build id}"
API_LEVEL="${2:?api level}"
CODENAME="${3:?codename}"
SYSTEM_IMAGE="${4:?system image}"
ABI="${5:-x86_64}"
CHANNEL="${6:-stable}"
PAGE_SIZE="${7:-}"
TAG="${8:?docker tag}"
LOG_FILE="${9:-/work/builds/${BUILD_ID}/build.log}"

mkdir -p "$(dirname "$LOG_FILE")"
WORKDIR="/work/builds/${BUILD_ID}"
mkdir -p "$WORKDIR"
phase() { echo "$1" > "${WORKDIR}/phase"; echo "[zeppole] PHASE:$1"; }

on_fail() {
  trap - ERR
  local code=$?
  /opt/zeppole-scripts/cleanup-build.sh "$BUILD_ID" "$TAG" "$LOG_FILE" >>"$LOG_FILE" 2>&1 \
    || echo "[zeppole] WARNING: cleanup script reported errors (non-fatal)" >>"$LOG_FILE"
  phase failed
  if grep -qi "no space left on device" "$LOG_FILE" 2>/dev/null; then
    echo "[zeppole] ERROR: Docker host ran out of disk during docker build/export."
    echo "[zeppole] Free space under /var/lib/docker (often 40GB+ needed). On the host:"
    echo "[zeppole]   df -h && docker system df && docker system prune -a"
  elif grep -q "ro.product.cpu.abi" "$LOG_FILE" 2>/dev/null; then
    echo "[zeppole] ERROR: System image layer incomplete (often caused by an earlier docker/disk failure)."
  fi
  echo "FAILED" > "${WORKDIR}/status"
  exit "${code}"
}
trap on_fail ERR

phase initializing
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[zeppole] build ${BUILD_ID} starting"
echo "[zeppole] api=${API_LEVEL} codename=${CODENAME} image=${SYSTEM_IMAGE} abi=${ABI} channel=${CHANNEL}"
echo "[zeppole] Display/control at deploy time uses ws-scrcpy sidecar (not baked into image)."

/opt/zeppole-scripts/check-disk.sh

BLD="${WORKDIR}/bld"
rm -rf "$BLD"
mkdir -p "$BLD"

export PATH="/opt/venv/bin:${PATH}"
EMU_DOCKER="/opt/venv/bin/emu-docker"
if [ ! -x "$EMU_DOCKER" ]; then
  echo "[zeppole] ERROR: emu-docker missing at $EMU_DOCKER (venv not installed?)"
  exit 1
fi
cd /opt/aemu

IMG_PATTERN="${CODENAME} ${SYSTEM_IMAGE} ${ABI}"
if [ -n "$PAGE_SIZE" ]; then
  IMG_PATTERN="${IMG_PATTERN} ${PAGE_SIZE}"
fi
# Anchor to end of string so re.match("V google_apis_playstore x86_64") does not
# also match "V google_apis_playstore x86_64 ps16k" (prefix-match bug in emu-docker).
IMG_PATTERN="${IMG_PATTERN}\$"

phase sdk_download
echo "[zeppole] Removing stale sys-${API_LEVEL}-* images from prior failed builds..."
docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | while read -r ref; do
  repo="${ref%%:*}"
  case "$repo" in
    sys-${API_LEVEL}|sys-${API_LEVEL}-*) docker rmi -f "$ref" 2>/dev/null || true ;;
  esac
done
echo "[zeppole] running emu-docker create (accept licenses first run)..."
echo "[zeppole] pattern: ${IMG_PATTERN}"
echo "[zeppole] After platform-tools: packaging system image + docker build sys-* (often 10-40 min, few log lines)."

heartbeat() {
  while true; do
    sleep 90
    echo "[zeppole] $(date -Is) still in emu-docker / docker build phase..."
    if [ -d "${BLD}/sys_img" ]; then
      du -sh "${BLD}/sys_img" 2>/dev/null || true
    fi
    docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null | grep -iE 'build|export' || true
  done
}
heartbeat &
HEARTBEAT_PID=$!
if ! yes | "$EMU_DOCKER" create "$CHANNEL" "$IMG_PATTERN" --dest "$BLD" --no-metrics; then
  kill "$HEARTBEAT_PID" 2>/dev/null || true
  echo "[zeppole] emu-docker create failed"
  exit 1
fi
kill "$HEARTBEAT_PID" 2>/dev/null || true
wait "$HEARTBEAT_PID" 2>/dev/null || true
echo "[zeppole] emu-docker create finished"

BASE_TAG="zeppole-google-base:${BUILD_ID}"
phase docker_base
echo "[zeppole] docker build base ${BASE_TAG}"
docker build -t "$BASE_TAG" "$BLD"

phase zeppole_overlay
echo "[zeppole] applying Zeppole boot overlay"
docker build -t "$TAG" \
  -f /opt/zeppole-overlay/Dockerfile \
  --build-arg GOOGLE_BASE_IMAGE="$BASE_TAG" \
  /opt/zeppole-overlay

phase complete
echo "[zeppole] build complete: ${TAG}"
echo "SUCCEEDED" > "${WORKDIR}/status"
trap - ERR

rm -rf "$BLD"
echo "[zeppole] Removed workspace ${BLD} (images kept: ${TAG})"
