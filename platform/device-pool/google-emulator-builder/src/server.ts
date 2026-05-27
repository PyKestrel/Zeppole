import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { fetchCatalog } from "./catalog.js";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT ?? 9200);
const TOKEN = (process.env.BUILDER_TOKEN ?? process.env.ZEPPOLE_IMAGE_BUILDER_TOKEN)?.trim();
const WORK_ROOT = process.env.WORK_ROOT ?? "/work/builds";

type BuildJob = {
  buildId: string;
  apiLevel: number;
  codename: string;
  systemImage: string;
  abi: string;
  emulatorChannel: string;
  pageSize: string;
  dockerTag: string;
};

type RunningBuild = {
  child: ReturnType<typeof spawn>;
  dockerTag: string;
  logFile: string;
};

const running = new Map<string, RunningBuild>();

async function cleanupFailedBuild(buildId: string, dockerTag: string, logFile: string): Promise<void> {
  try {
    await execFileAsync("/opt/zeppole-scripts/cleanup-build.sh", [buildId, dockerTag, logFile], {
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (e) {
    const err = e as { message?: string };
    console.warn(`cleanup failed for ${buildId}: ${err.message ?? e}`);
  }
}

function authOk(auth: string | undefined): boolean {
  if (!TOKEN || TOKEN.length < 8) return false;
  const m = auth?.match(/^Bearer\s+(.+)$/i);
  return Boolean(m && m[1] === TOKEN);
}

async function readStatus(buildId: string): Promise<{ status: string; phase: string; log: string }> {
  const dir = path.join(WORK_ROOT, buildId);
  let status = "BUILDING";
  try {
    const s = await fs.readFile(path.join(dir, "status"), "utf8");
    if (s.includes("SUCCEEDED")) status = "SUCCEEDED";
    else if (s.includes("FAILED")) status = "FAILED";
  } catch {
    /* building */
  }
  let phase = "unknown";
  try {
    phase = (await fs.readFile(path.join(dir, "phase"), "utf8")).trim() || "unknown";
  } catch {
    /* no phase yet */
  }
  let log = "";
  try {
    log = await fs.readFile(path.join(dir, "build.log"), "utf8");
  } catch {
    /* no log yet */
  }
  if (status === "SUCCEEDED") phase = "complete";
  if (status === "FAILED" && phase !== "complete") phase = "failed";
  return { status, phase, log };
}

function startBuild(job: BuildJob): void {
  const dir = path.join(WORK_ROOT, job.buildId);
  fs.mkdir(dir, { recursive: true }).catch(() => {});

  const args = [
    job.buildId,
    String(job.apiLevel),
    job.codename,
    job.systemImage,
    job.abi,
    job.emulatorChannel,
    job.pageSize,
    job.dockerTag,
    path.join(dir, "build.log"),
  ];

  const logFile = path.join(dir, "build.log");
  const child = spawn("/opt/zeppole-scripts/run-build.sh", args, { stdio: "ignore" });
  running.set(job.buildId, { child, dockerTag: job.dockerTag, logFile });
  child.on("exit", (code) => {
    running.delete(job.buildId);
    const status = code === 0 ? "SUCCEEDED" : "FAILED";
    void (async () => {
      if (code !== 0) {
        await cleanupFailedBuild(job.buildId, job.dockerTag, logFile);
      }
      await fs.writeFile(path.join(dir, "status"), status);
    })();
  });
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") return;
  if (!authOk(request.headers.authorization)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.get("/health", async () => ({ status: "ok", service: "zeppole-google-emulator-builder" }));

app.get("/v1/catalog", async () => fetchCatalog());

app.get("/v1/preflight", async () => {
  const minGb = Number(process.env.ZEPPOLE_BUILD_MIN_FREE_GB ?? 40);
  try {
    const { stdout } = await execFileAsync("/opt/zeppole-scripts/check-disk.sh", [], {
      env: { ...process.env, ZEPPOLE_BUILD_MIN_FREE_GB: String(minGb) },
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, recommendedFreeGb: minGb, detail: stdout.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const detail = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").trim();
    return {
      ok: false,
      recommendedFreeGb: minGb,
      detail: detail || "Disk preflight failed",
    };
  }
});

app.post<{ Body: BuildJob }>("/v1/build", async (request, reply) => {
  const job = request.body;
  if (!job?.buildId || !job.dockerTag) {
    reply.code(400).send({ error: "Invalid build job" });
    return;
  }
  if (running.has(job.buildId)) {
    reply.code(409).send({ error: "Build already running" });
    return;
  }
  startBuild(job);
  reply.code(202).send({ buildId: job.buildId, status: "BUILDING" });
});

app.post<{ Params: { buildId: string }; Body: { dockerTag?: string } }>(
  "/v1/build/:buildId/cleanup",
  async (request) => {
    const { buildId } = request.params;
    const dockerTag = request.body?.dockerTag ?? "";
    const logFile = path.join(WORK_ROOT, buildId, "build.log");
    await cleanupFailedBuild(buildId, dockerTag, logFile);
    return { buildId, cleaned: true };
  },
);

app.get<{ Params: { buildId: string } }>("/v1/build/:buildId", async (request) => {
  const { buildId } = request.params;
  const { status, phase, log } = await readStatus(buildId);
  return { buildId, status, phase, logTail: log.slice(-8000) };
});

async function main() {
  if (!TOKEN || TOKEN.length < 8) {
    console.error("Set BUILDER_TOKEN or ZEPPOLE_IMAGE_BUILDER_TOKEN (min 8 chars)");
    process.exit(1);
  }
  await fs.mkdir(WORK_ROOT, { recursive: true });
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Google emulator builder on :${PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
