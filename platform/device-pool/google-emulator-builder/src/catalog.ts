import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackPath = path.join(__dirname, "..", "catalog.json");

const CACHE_MS = Number(process.env.CATALOG_CACHE_MS ?? 3_600_000);
let cache: { at: number; data: unknown } | null = null;

export type CatalogImage = {
  id: string;
  label: string;
  apiLevel: number;
  codename: string;
  androidVersion: string;
  systemImage: string;
  abi: string;
  pageSize: string;
  pattern: string;
};

const CODENAME_TO_API: Record<string, { apiLevel: number; androidVersion: string }> = {
  R: { apiLevel: 30, androidVersion: "11" },
  S: { apiLevel: 31, androidVersion: "12" },
  Sv2: { apiLevel: 32, androidVersion: "12L" },
  T: { apiLevel: 33, androidVersion: "13" },
  U: { apiLevel: 34, androidVersion: "14" },
  V: { apiLevel: 35, androidVersion: "15" },
  B: { apiLevel: 36, androidVersion: "16" },
};

function parseListLine(line: string): CatalogImage | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || /^api\s/i.test(trimmed)) return null;
  // Typical: "U google_apis_playstore x86_64" or with ps16k
  const m = trimmed.match(
    /^(\S+)\s+(google_apis_playstore|google_apis|aosp)\s+(x86_64|x86|arm64-v8a|armeabi-v7a)(?:\s+(ps16k))?$/i,
  );
  if (!m) return null;
  const codename = m[1]!;
  const systemImage = m[2]!.toLowerCase();
  const abi = m[3]!.toLowerCase();
  const pageSize = m[4] ? "ps16k" : "";
  const meta = CODENAME_TO_API[codename] ?? { apiLevel: 0, androidVersion: "?" };
  const pageSuffix = pageSize ? ` · 16KB` : "";
  return {
    id: `${codename}-${systemImage}-${abi}${pageSize ? "-ps16k" : ""}`,
    label: `API ${meta.apiLevel || codename} ${systemImage} ${abi}${pageSuffix}`,
    apiLevel: meta.apiLevel,
    codename,
    androidVersion: meta.androidVersion,
    systemImage,
    abi,
    pageSize,
    pattern: pageSize
      ? `${codename} ${systemImage} ${abi} ${pageSize}`
      : `${codename} ${systemImage} ${abi}`,
  };
}

async function loadFallback(): Promise<unknown> {
  const raw = await fs.readFile(fallbackPath, "utf8");
  return JSON.parse(raw) as unknown;
}

export async function fetchCatalog(): Promise<unknown> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }

  try {
    const { stdout } = await execFileAsync("/opt/venv/bin/emu-docker", ["list"], {
      env: { ...process.env, PATH: `/opt/venv/bin:${process.env.PATH ?? ""}` },
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const images: CatalogImage[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const row = parseListLine(line);
      if (row) images.push(row);
    }
    if (images.length === 0) {
      throw new Error("emu-docker list returned no parseable rows");
    }

    const apiLevels = [...new Map(
      images
        .filter((i) => i.apiLevel > 0)
        .map((i) => [i.apiLevel, { apiLevel: i.apiLevel, codename: i.codename, androidVersion: i.androidVersion }]),
    ).values()].sort((a, b) => b.apiLevel - a.apiLevel);

    const systemImages = [...new Set(images.map((i) => i.systemImage))].map((id) => ({
      id,
      label:
        id === "google_apis_playstore"
          ? "Google Play"
          : id === "google_apis"
            ? "Google APIs"
            : id.toUpperCase(),
      description:
        id === "google_apis_playstore"
          ? "Play Store app and Google Play services"
          : id === "google_apis"
            ? "Google APIs without Play Store"
            : "Android Open Source Project",
    }));

    const abis = [...new Set(images.map((i) => i.abi))].map((id) => ({
      id,
      label: id === "x86_64" ? "x86_64 (64-bit, recommended)" : id,
    }));

    const pageSizes = [
      { id: "", label: "4 KB pages (default)" },
      ...(images.some((i) => i.pageSize === "ps16k") ? [{ id: "ps16k", label: "16 KB pages (ps16k)" }] : []),
    ];

    const data = {
      source: "https://github.com/google/android-emulator-container-scripts",
      dynamic: true,
      images,
      emulatorChannels: [
        { id: "stable", label: "Stable" },
        { id: "dev", label: "Developer" },
        { id: "canary", label: "Canary" },
      ],
      abis,
      systemImages,
      pageSizes,
      apiLevels: apiLevels.length
        ? apiLevels
        : [{ apiLevel: 34, codename: "U", androidVersion: "14" }],
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    const fallback = await loadFallback();
    cache = { at: Date.now(), data: { ...(fallback as object), dynamic: false } };
    return cache.data;
  }
}
