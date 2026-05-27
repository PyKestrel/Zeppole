/**
 * Runs on a host with Docker (socket mounted). Deploys Google aemu emulator pods:
 * emulator container + ws-scrcpy sidecar on a private Docker network.
 */
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import Fastify from "fastify";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT ?? 9100);
const TOKEN = (process.env.BRIDGE_TOKEN ?? process.env.ZEPPOLE_EMULATOR_BRIDGE_TOKEN)?.trim();
const PUBLIC_SCHEME = (process.env.PUBLIC_SCHEME ?? "http").replace(/:+$/, "");
const PUBLIC_HOST = (process.env.PUBLIC_HOST ?? "127.0.0.1").trim();
const WSSCRCPY_IMAGE =
  process.env.ZEPPOLE_WSSCRCPY_IMAGE?.trim() ?? "zeppole-ws-scrcpy:latest";
const DOCKER_TIMEOUT_MS = Number(process.env.DOCKER_TIMEOUT_MS ?? 600_000);
const WSSCRCPY_PORT = Number(process.env.WSSCRCPY_PORT ?? 8000);

function authHeaderOk(auth: string | undefined): boolean {
  if (!TOKEN) return false;
  const m = auth?.match(/^Bearer\s+(.+)$/i);
  return Boolean(m && m[1] === TOKEN);
}

async function docker(args: string[], timeoutMs = DOCKER_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await execFileAsync("docker", args, {
      maxBuffer: 10 * 1024 * 1024,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

let kvmProbeCache: { at: number; result: KvmProbeResult } | null = null;
const KVM_PROBE_CACHE_MS = 60_000;

type KvmProbeResult = {
  ok: boolean;
  visibleInBridge: boolean;
  detail: string;
  lastError?: string;
};

function assumeKvmEnabled(): boolean {
  for (const key of ["EMULATOR_ASSUME_KVM", "EMULATOR_USE_KVM"]) {
    const v = process.env[key]?.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes") return true;
  }
  return false;
}

async function kvmVisibleInBridge(): Promise<boolean> {
  try {
    await access("/dev/kvm");
    return true;
  } catch {
    return false;
  }
}

async function probeKvm(force = false): Promise<KvmProbeResult> {
  if (!force && kvmProbeCache && Date.now() - kvmProbeCache.at < KVM_PROBE_CACHE_MS) {
    return kvmProbeCache.result;
  }

  const visibleInBridge = await kvmVisibleInBridge();
  if (visibleInBridge) {
    const result: KvmProbeResult = {
      ok: true,
      visibleInBridge: true,
      detail: "/dev/kvm is mounted in emulator-bridge",
    };
    kvmProbeCache = { at: Date.now(), result };
    return result;
  }

  if (assumeKvmEnabled()) {
    const result: KvmProbeResult = {
      ok: true,
      visibleInBridge: false,
      detail: "EMULATOR_ASSUME_KVM / EMULATOR_USE_KVM is set",
    };
    kvmProbeCache = { at: Date.now(), result };
    return result;
  }

  const attempts: { args: string[]; label: string }[] = [
    {
      label: "docker run --device /dev/kvm",
      args: ["run", "--rm", "--device", "/dev/kvm", "busybox:1.36", "test", "-e", "/dev/kvm"],
    },
    {
      label: "docker run -v /dev/kvm:/dev/kvm:ro",
      args: ["run", "--rm", "-v", "/dev/kvm:/dev/kvm:ro", "busybox:1.36", "test", "-e", "/dev/kvm"],
    },
  ];

  let lastError = "";
  for (const attempt of attempts) {
    try {
      await docker(attempt.args, 90_000);
      const result: KvmProbeResult = {
        ok: true,
        visibleInBridge: false,
        detail: `KVM OK (${attempt.label})`,
      };
      kvmProbeCache = { at: Date.now(), result };
      return result;
    } catch (e) {
      const err = e as Error & { stderr?: string };
      lastError = [attempt.label, err.message, err.stderr?.trim()].filter(Boolean).join(" — ");
    }
  }

  const result: KvmProbeResult = {
    ok: false,
    visibleInBridge: false,
    detail: "KVM probe failed on Docker host",
    lastError: lastError || "unknown",
  };
  kvmProbeCache = { at: Date.now(), result };
  return result;
}

async function canPassKvmToEmulator(): Promise<boolean> {
  return (await probeKvm()).ok;
}

const KVM_REQUIRED_MSG =
  "Google Android emulators need /dev/kvm on the Docker host. Use a Linux host with KVM, merge docker-compose.kvm.yml, " +
  "or register an external ws-scrcpy URL manually. Docker Desktop on Windows/macOS cannot pass KVM to containers.";

function parseHostPort(dockerPortLine: string): string {
  const line = dockerPortLine.trim().split("\n").pop() ?? "";
  const parts = line.split(":");
  return parts[parts.length - 1]?.trim() ?? "";
}

function displayContainerName(containerName: string): string {
  return `${containerName}-display`;
}

function networkName(containerName: string): string {
  return `${containerName}-net`;
}

async function containerState(
  containerName: string,
): Promise<{ status: string; error: string; running: boolean }> {
  try {
    const { stdout } = await docker(
      [
        "inspect",
        containerName,
        "--format",
        "{{.State.Status}}|{{.State.Error}}|{{.State.Running}}",
      ],
      30_000,
    );
    const [status = "", error = "", running = "false"] = stdout.trim().split("|");
    return { status, error, running: running === "true" };
  } catch {
    return { status: "missing", error: "", running: false };
  }
}

async function tailContainerLogs(containerName: string, lines = 40): Promise<string> {
  try {
    const { stdout } = await docker(["logs", "--tail", String(lines), containerName], 30_000);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function removeContainerBestEffort(containerName: string): Promise<void> {
  try {
    await docker(["rm", "-f", containerName], 60_000);
  } catch {
    /* ignore */
  }
}

async function removeNetworkBestEffort(net: string): Promise<void> {
  try {
    await docker(["network", "rm", net], 60_000);
  } catch {
    /* ignore */
  }
}

async function teardownPod(containerName: string): Promise<void> {
  await removeContainerBestEffort(displayContainerName(containerName));
  await removeContainerBestEffort(containerName);
  await removeNetworkBestEffort(networkName(containerName));
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") return;
  if (!authHeaderOk(request.headers.authorization)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.get("/health", async () => {
  const kvm = await probeKvm(true);
  return {
    status: "ok",
    service: "zeppole-emulator-bridge",
    kvmAvailable: kvm.ok,
    kvm,
    wsScrcpyImage: WSSCRCPY_IMAGE,
  };
});

app.post<{
  Body: {
    containerName: string;
    image?: string;
  };
}>("/v1/deploy", async (request, reply) => {
  const { containerName, image } = request.body ?? ({} as never);
  if (!containerName || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,200}$/.test(containerName)) {
    reply.code(400).send({ error: "Invalid containerName" });
    return;
  }

  const img = image?.trim();
  if (!img) {
    reply.code(400).send({
      error: "image is required. Build a Google aemu image on the Emulator images page first.",
    });
    return;
  }

  const useKvm = await canPassKvmToEmulator();
  if (!useKvm) {
    request.log.warn({ containerName }, "deploy rejected: kvm not available");
    reply.code(503).send({ error: KVM_REQUIRED_MSG });
    return;
  }

  const net = networkName(containerName);
  const displayName = displayContainerName(containerName);

  request.log.info({ containerName, img, net, displayName }, "emulator pod deploy started");
  await teardownPod(containerName);

  try {
    await docker(["network", "create", net], 60_000);
  } catch (e) {
    const err = e as Error & { stderr?: string };
    reply.code(500).send({ error: `Failed to create network: ${err.message}` });
    return;
  }

  const emuArgs = [
    "run",
    "-d",
    "--name",
    containerName,
    "--network",
    net,
    "--restart",
    "unless-stopped",
    "--device",
    "/dev/kvm",
    img,
  ];

  try {
    await docker(emuArgs);
  } catch (e) {
    const err = e as Error & { stderr?: string };
    await teardownPod(containerName);
    reply.code(500).send({ error: [err.message, err.stderr?.trim()].filter(Boolean).join(" — ") });
    return;
  }

  const emuState = await containerState(containerName);
  if (!emuState.running) {
    const logs = await tailContainerLogs(containerName);
    await teardownPod(containerName);
    reply.code(500).send({
      error: [emuState.error || `Emulator container ${emuState.status}`, logs].filter(Boolean).join("\n\n"),
    });
    return;
  }

  const sidecarArgs = [
    "run",
    "-d",
    "--name",
    displayName,
    "--network",
    net,
    "--restart",
    "unless-stopped",
    "-p",
    `0:${WSSCRCPY_PORT}`,
    "-e",
    `ADB_HOST=${containerName}`,
    WSSCRCPY_IMAGE,
  ];

  try {
    await docker(sidecarArgs);
  } catch (e) {
    const err = e as Error & { stderr?: string };
    await teardownPod(containerName);
    reply.code(500).send({
      error: `ws-scrcpy sidecar failed: ${[err.message, err.stderr?.trim()].filter(Boolean).join(" — ")}`,
    });
    return;
  }

  let hostPort = "";
  try {
    const r = await docker(["port", displayName, String(WSSCRCPY_PORT)], 30_000);
    hostPort = parseHostPort(r.stdout);
  } catch (e) {
    request.log.error(e);
    await teardownPod(containerName);
    reply.code(500).send({ error: "Could not read ws-scrcpy published port" });
    return;
  }

  if (!hostPort) {
    await teardownPod(containerName);
    reply.code(500).send({ error: "ws-scrcpy port not published" });
    return;
  }

  for (let i = 0; i < 48; i++) {
    const sidecar = await containerState(displayName);
    if (!sidecar.running) {
      const logs = await tailContainerLogs(displayName);
      await teardownPod(containerName);
      reply.code(500).send({ error: `ws-scrcpy sidecar stopped:\n${logs.slice(-1200)}` });
      return;
    }
    const logs = await tailContainerLogs(displayName, 200);
    if (logs.includes("[zeppole-ws-scrcpy] emulator ready")) {
      break;
    }
    if (i === 47) {
      request.log.warn({ containerName }, "ws-scrcpy sidecar still starting; returning URL anyway");
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const displayUrl = `${PUBLIC_SCHEME}://${PUBLIC_HOST}:${hostPort}/`;
  request.log.info({ containerName, displayUrl }, "emulator pod deploy finished");
  return reply.send({
    containerName,
    displayUrl,
    dockerImage: img,
  });
});

app.post<{ Body: { containerName: string } }>("/v1/stop", async (request, reply) => {
  const { containerName } = request.body ?? ({} as never);
  if (!containerName || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,200}$/.test(containerName)) {
    reply.code(400).send({ error: "Invalid containerName" });
    return;
  }
  await teardownPod(containerName);
  return reply.send({ ok: true });
});

async function main() {
  if (!TOKEN || TOKEN.length < 8) {
    app.log.error("Set BRIDGE_TOKEN (min 8 chars) before starting.");
    process.exit(1);
  }
  const kvm = await probeKvm(true);
  console.info(
    `[zeppole-emulator-bridge] kvmAvailable=${kvm.ok} visibleInBridge=${kvm.visibleInBridge} detail=${kvm.detail}`,
  );
  if (kvm.lastError) {
    console.info(`[zeppole-emulator-bridge] kvmProbeError=${kvm.lastError}`);
  }
  if (!kvm.ok) {
    app.log.warn("KVM not available. Merge docker-compose.kvm.yml or set EMULATOR_ASSUME_KVM=true.");
  }
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Emulator bridge listening on :${PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
