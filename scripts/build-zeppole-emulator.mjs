/**
 * Build zeppole-emulator image with official Google SDK system images (google_apis).
 * Requires Docker, KVM host recommended for running the image later.
 *
 * Usage:
 *   node scripts/build-zeppole-emulator.mjs
 *   node scripts/build-zeppole-emulator.mjs --android 14.0
 *   node scripts/build-zeppole-emulator.mjs --api 34 --variant google_apis
 *   node scripts/build-zeppole-emulator.mjs --tag myregistry.io/zeppole-emulator:custom
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bootstrap = path.join(root, "platform/device-pool/bootstrap-source");

const ANDROID_TO_API = {
  "9.0": 28,
  "10.0": 29,
  "11.0": 30,
  "12.0": 32,
  "13.0": 33,
  "14.0": 34,
  "15.0": 35,
};

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const androidVersion = arg("--android", "14.0");
const apiLevel = arg("--api", String(ANDROID_TO_API[androidVersion] ?? 34));
const variant = arg("--variant", "google_apis");
const baseRelease = arg("--base-release", "v3.3.0-p0");
const tag =
  arg("--tag", null) ??
  `zeppole-emulator:${androidVersion}-${variant.replace(/_/g, "-")}`;

if (!fs.existsSync(path.join(bootstrap, "docker/emulator"))) {
  console.error("bootstrap-source not found at", bootstrap);
  process.exit(1);
}

const extension = path.join(bootstrap, "extension.sh");
if (!fs.existsSync(extension)) {
  fs.writeFileSync(extension, "#!/bin/bash\n", { mode: 0o755 });
}

console.info("Building", tag);
console.info("  Google system image: system-images;android-" + apiLevel + ";" + variant + ";x86_64");
console.info("  Base layer: budtmo/docker-android:base_" + baseRelease);
console.info("");

const buildArgs = [
  "build",
  "--progress=plain",
  "-t",
  tag,
  "-f",
  "docker/emulator",
  "--build-arg",
  `DOCKER_ANDROID_VERSION=${baseRelease}`,
  "--build-arg",
  `EMULATOR_ANDROID_VERSION=${androidVersion}`,
  "--build-arg",
  `EMULATOR_API_LEVEL=${apiLevel}`,
  "--build-arg",
  `EMULATOR_IMG_TYPE=${variant}`,
  "--secret",
  "id=extension,src=extension.sh",
  ".",
];

const env = { ...process.env, DOCKER_BUILDKIT: "1" };
const r = spawnSync("docker", buildArgs, { cwd: bootstrap, stdio: "inherit", env, shell: false });

if (r.status !== 0) {
  console.error("");
  console.error("Build failed. Common causes:");
  console.error("  - Unknown --base-release (check budtmo/docker-android releases on GitHub)");
  console.error("  - API level not in Google SDK repos yet (try a lower --api)");
  process.exit(r.status ?? 1);
}

console.info("");
console.info("Built:", tag);
console.info("Use in Zeppole:");
console.info("  ZEPPOLE_EMULATOR_IMAGE=" + tag);
console.info("  or Emulators → Deploy (Docker) → Image (optional)");
