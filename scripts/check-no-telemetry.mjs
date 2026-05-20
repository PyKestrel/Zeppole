#!/usr/bin/env node
/**
 * Fails the build if known telemetry / exfiltration patterns appear in tracked source.
 * Scans from repository root; skips node_modules, .git, and binary paths.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const FORBIDDEN = [
  { re: /docs\.google\.com\/forms/i, name: "Google Forms URL" },
  { re: /1FAIpQLSdrKWQdMh6Nt8v8NQdYvTIntohebAgqWCpXT3T9NofAoxcpkw/i, name: "legacy form id" },
  { re: /formResponse/i, name: "Google formResponse" },
  { re: /USER_BEHAVIOR_ANALYTICS/i, name: "USER_BEHAVIOR_ANALYTICS symbol" },
  { re: /ipinfo\.io/i, name: "ipinfo.io exfil (unless in security docs)" },
];

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
  "dir-list.txt",
]);

const EXT_OK = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".jsx",
  ".md",
  ".yml",
  ".yaml",
  ".json",
  ".py",
  ".sh",
  ".html",
  ".css",
  ".prisma",
  ".toml",
]);

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    const rel = relative(ROOT, p);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      await walk(p, out);
    } else {
      const dot = e.name.lastIndexOf(".");
      const ext = dot >= 0 ? e.name.slice(dot) : "";
      if (!EXT_OK.has(ext)) continue;
      out.push(p);
    }
  }
}

async function main() {
  const files = [];
  await walk(ROOT, files);
  const failures = [];
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (rel === "scripts/check-no-telemetry.mjs") continue;
    if (rel.startsWith("platform/docs/security.md")) continue;
    if (rel.startsWith("POLICY-NO-TELEMETRY.md")) continue;
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const { re, name } of FORBIDDEN) {
      if (re.test(content)) {
        failures.push({ rel, name });
      }
    }
  }
  if (failures.length) {
    console.error("Telemetry guard failed:\n");
    for (const f of failures) {
      console.error(`  ${f.rel}: forbidden pattern (${f.name})`);
    }
    process.exit(1);
  }
  console.log("check-no-telemetry: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
