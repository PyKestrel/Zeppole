/**
 * Runs on a host with Docker (socket mounted). The Zeppole API calls this service
 * to start/stop docker-android style containers and discover published ports.
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
const DEFAULT_IMAGE =
  process.env.EMULATOR_IMAGE?.trim() ?? "budtmo/docker-android:emulator_11.0";
const DOCKER_TIMEOUT_MS = Number(process.env.DOCKER_TIMEOUT_MS ?? 600_000);

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

let kvmProbeCache: { at: number; value: boolean } | null = null;
const KVM_PROBE_CACHE_MS = 60_000;

async function kvmVisibleInBridge(): Promise<boolean> {
  try {
    await access("/dev/kvm");
    return true;
  } catch {
    return false;
  }
}

/** True when the Docker daemon (via socket) can start containers with --device /dev/kvm. */
async function kvmAvailableOnDockerHost(): Promise<boolean> {
  if (kvmProbeCache && Date.now() - kvmProbeCache.at < KVM_PROBE_CACHE_MS) {
    return kvmProbeCache.value;
  }
  if (await kvmVisibleInBridge()) {
    kvmProbeCache = { at: Date.now(), value: true };
    return true;
  }
  try {
    await docker(["run", "--rm", "--device", "/dev/kvm", "busybox", "test", "-e", "/dev/kvm"], 60_000);
    kvmProbeCache = { at: Date.now(), value: true };
    return true;
  } catch {
    kvmProbeCache = { at: Date.now(), value: false };
    return false;
  }
}

/** docker-android requires /dev/kvm inside the emulator container (pass from Docker host). */
async function canPassKvmToEmulator(): Promise<boolean> {
  return kvmAvailableOnDockerHost();
}

const KVM_REQUIRED_MSG =
  "budtmo/docker-android needs /dev/kvm on the Docker host. The noVNC page will show only the splash screen without it. " +
  "On a Linux VM with KVM, ensure Docker runs on that VM and merge docker-compose.kvm.yml (mounts /dev/kvm into emulator-bridge), " +
  "or register an external noVNC URL. Docker Desktop on Windows/macOS cannot pass KVM to containers.";

function parseHostPort(dockerPortLine: string): string {
  const line = dockerPortLine.trim().split("\n").pop() ?? "";
  const parts = line.split(":");
  return parts[parts.length - 1]?.trim() ?? "";
}

async function containerState(
  containerName: string,
): Promise<{ status: string; error: string; running: boolean }> {
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

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") return;
  if (!authHeaderOk(request.headers.authorization)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
});

app.get("/health", async () => ({
  status: "ok",
  service: "zeppole-emulator-bridge",
  kvmAvailable: await canPassKvmToEmulator(),
}));

app.post<{ Body: { containerName: string; emulatorDevice: string; image?: string } }>(
  "/v1/deploy",
  async (request, reply) => {
    const { containerName, emulatorDevice, image } = request.body ?? ({} as never);
    if (!containerName || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,200}$/.test(containerName)) {
      reply.code(400).send({ error: "Invalid containerName" });
      return;
    }
    if (!emulatorDevice || emulatorDevice.length > 300) {
      reply.code(400).send({ error: "Invalid emulatorDevice" });
      return;
    }

    const img = image?.trim() || DEFAULT_IMAGE;
    const useKvm = await canPassKvmToEmulator();
    if (!useKvm) {
      request.log.warn({ containerName }, "deploy rejected: kvm not available");
      reply.code(503).send({ error: KVM_REQUIRED_MSG });
      return;
    }

    request.log.info({ containerName, img, useKvm, emulatorDevice }, "emulator deploy started");

    await removeContainerBestEffort(containerName);

    const runArgs = [
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      "0:6080",
      "-p",
      "0:4723",
      "-e",
      "WEB_VNC=true",
      "-e",
      "APPIUM=true",
      "-e",
      `EMULATOR_DEVICE=${emulatorDevice}`,
      "--restart",
      "unless-stopped",
    ];

    runArgs.push("--device", "/dev/kvm");

    runArgs.push(img);

    try {
      request.log.info({ containerName }, "docker run");
      await docker(runArgs);
    } catch (e) {
      const err = e as Error & { stderr?: string };
      const detail = [err.message, err.stderr?.trim()].filter(Boolean).join(" — ");
      request.log.error({ err: e, containerName }, "docker run failed");
      await removeContainerBestEffort(containerName);
      reply.code(500).send({
        error: detail || "docker run failed",
      });
      return;
    }

    const state = await containerState(containerName);
    if (!state.running) {
      const logs = await tailContainerLogs(containerName);
      const msg = [
        state.error || `Container is ${state.status || "not running"} after docker run`,
        logs ? `Logs:\n${logs}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      request.log.error({ containerName, state, logs: logs.slice(0, 500) }, "emulator container did not start");
      await removeContainerBestEffort(containerName);
      reply.code(500).send({ error: msg });
      return;
    }

    let p6080 = "";
    let p4723 = "";
    try {
      const r6080 = await docker(["port", containerName, "6080"], 30_000);
      p6080 = parseHostPort(r6080.stdout);
      const r4723 = await docker(["port", containerName, "4723"], 30_000);
      p4723 = parseHostPort(r4723.stdout);
    } catch (e) {
      request.log.error(e);
      await removeContainerBestEffort(containerName);
      reply.code(500).send({ error: "Could not read published ports (is the image exposing 6080/4723?)" });
      return;
    }

    if (!p6080 || !p4723) {
      await removeContainerBestEffort(containerName);
      reply.code(500).send({ error: "Published ports missing" });
      return;
    }

    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const { stdout: deviceLog } = await docker(
          ["exec", containerName, "cat", "/home/androidusr/logs/device.stdout.log"],
          30_000,
        );
        if (deviceLog.includes("RuntimeError: /dev/kvm cannot be found!")) {
          await removeContainerBestEffort(containerName);
          reply.code(503).send({ error: KVM_REQUIRED_MSG });
          return;
        }
        if (deviceLog.includes("Traceback (most recent call last)")) {
          const tail = deviceLog.slice(-800);
          await removeContainerBestEffort(containerName);
          reply.code(500).send({ error: `Emulator failed to start:\n${tail}` });
          return;
        }
      } catch {
        /* log not ready yet */
      }
    }

    const displayUrl = `${PUBLIC_SCHEME}://${PUBLIC_HOST}:${p6080}/?autoconnect=true`;
    const appiumUrl = `${PUBLIC_SCHEME}://${PUBLIC_HOST}:${p4723}/`;

    request.log.info({ containerName, displayUrl, appiumUrl }, "emulator deploy finished");
    return reply.send({
      containerName,
      displayUrl,
      appiumUrl,
      dockerImage: img,
    });
  },
);

app.post<{ Body: { containerName: string } }>("/v1/stop", async (request, reply) => {
  const { containerName } = request.body ?? ({} as never);
  if (!containerName || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,200}$/.test(containerName)) {
    reply.code(400).send({ error: "Invalid containerName" });
    return;
  }
  try {
    await docker(["rm", "-f", containerName], 120_000);
  } catch (e) {
    request.log.warn(e);
  }
  return reply.send({ ok: true });
});

async function main() {
  if (!TOKEN || TOKEN.length < 8) {
    app.log.error("Set BRIDGE_TOKEN (min 8 chars) before starting.");
    process.exit(1);
  }
  const kvmInBridge = await kvmVisibleInBridge();
  const kvmOnHost = await kvmAvailableOnDockerHost();
  app.log.info(
    { kvmVisibleInBridge: kvmInBridge, kvmOnDockerHost: kvmOnHost, dockerAndroidDeployAllowed: kvmOnHost },
    "KVM configuration at startup",
  );
  if (!kvm) {
    app.log.warn(
      "Deploy will be rejected until /dev/kvm is mounted into this bridge container (see emulator-bridge README).",
    );
  }
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Emulator bridge listening on :${PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
