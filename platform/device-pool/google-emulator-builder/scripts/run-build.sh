#!/bin/bash
# Build a Zeppole Google aemu image using emu-docker + optional overlay.
set -euo pipefail

BUILD_ID="${1:?build id}"
API_LEVEL="${2:?api level}"
CODENAME="${3:?codename}"
SYSTEM_IMAGE="${4:?system image}"
ABI="${5:-x86_64}"
CHANNEL="${6:-stable}"
PAGE_SIZE="${7:-}"
TAG="${8:?docker tag}"
ENABLE_NOVNC="${9:-true}"
ENABLE_APPIUM="${10:-true}"
LOG_FILE="${11:-/work/builds/${BUILD_ID}/build.log}"

mkdir -p "$(dirname "$LOG_FILE")"
WORKDIR="/work/builds/${BUILD_ID}"
mkdir -p "$WORKDIR"
phase() { echo "$1" > "${WORKDIR}/phase"; echo "[zeppole] PHASE:$1"; }
phase initializing
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[zeppole] build ${BUILD_ID} starting"
echo "[zeppole] api=${API_LEVEL} codename=${CODENAME} image=${SYSTEM_IMAGE} abi=${ABI} channel=${CHANNEL}"

BLD="${WORKDIR}/bld"
rm -rf "$BLD"
mkdir -p "$BLD"

# emu-docker selects system image by codename regex (e.g. U, V, B).
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

phase sdk_download
echo "[zeppole] running emu-docker create (accept licenses first run)..."
echo "[zeppole] pattern: ${IMG_PATTERN}"
yes | "$EMU_DOCKER" create "$CHANNEL" "$IMG_PATTERN" --dest "$BLD" --no-metrics || {
  echo "[zeppole] emu-docker create failed"
  exit 1
}

BASE_TAG="zeppole-google-base:${BUILD_ID}"
phase docker_base
echo "[zeppole] docker build base ${BASE_TAG}"
docker build -t "$BASE_TAG" "$BLD"

if [ "$ENABLE_NOVNC" = "true" ] || [ "$ENABLE_APPIUM" = "true" ]; then
  phase zeppole_overlay
  echo "[zeppole] applying Zeppole overlay (display + Appium)"
  docker build -t "$TAG" \
    -f /opt/zeppole-overlay/Dockerfile \
    --build-arg GOOGLE_BASE_IMAGE="$BASE_TAG" \
    /opt/zeppole-overlay
else
  docker tag "$BASE_TAG" "$TAG"
fi

phase complete
echo "[zeppole] build complete: ${TAG}"
echo "SUCCEEDED" > "${WORKDIR}/status"
