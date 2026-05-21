import type { EmulatorStatus } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  bridgeDeploy,
  bridgeStop,
  emulatorBridgeConfigured,
  emulatorBridgeHealth,
} from "../../lib/emulatorBridge.js";
import { can } from "../../lib/roles.js";

const manualBody = z.object({
  mode: z.literal("manual"),
  name: z.string().min(1).max(200),
  displayUrl: z.string().url(),
  appiumUrl: z.string().url().optional(),
});

const dockerBody = z.object({
  mode: z.literal("docker"),
  name: z.string().min(1).max(200),
  emulatorDevice: z.string().min(1).max(200).optional(),
  image: z.string().min(1).max(300).optional(),
  runtime: z.enum(["docker-android", "google-aemu"]).optional(),
});

const createBody = z.discriminatedUnion("mode", [manualBody, dockerBody]);

function assertManage(role: import("@prisma/client").Role, reply: import("fastify").FastifyReply): boolean {
  if (!can(role, "manage_projects")) {
    reply.code(403).send({ error: "Forbidden" });
    return false;
  }
  return true;
}

export const emulatorsPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/emulators",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulators"], summary: "List emulator instances and bridge availability" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "view")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const emulators = await app.prisma.emulatorInstance.findMany({ orderBy: { createdAt: "desc" } });
      const bridgeConfigured = emulatorBridgeConfigured();
      const bridgeHealth = bridgeConfigured ? await emulatorBridgeHealth() : null;
      return {
        bridgeConfigured,
        kvmAvailable: bridgeHealth?.kvmAvailable ?? false,
        kvmDetail: bridgeHealth?.detail,
        kvmError: bridgeHealth?.lastError,
        bridgeReachable: bridgeHealth?.reachable ?? false,
        emulators,
      };
    },
  );

  app.post(
    "/emulators",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulators"], summary: "Register manual URLs or deploy via Docker bridge" },
    },
    async (request, reply) => {
      if (!assertManage(request.user.role, reply)) return;
      const body = createBody.parse(request.body);

      if (body.mode === "manual") {
        const row = await app.prisma.emulatorInstance.create({
          data: {
            name: body.name,
            mode: "manual",
            status: "RUNNING",
            displayUrl: body.displayUrl,
            appiumUrl: body.appiumUrl ?? null,
          },
        });
        reply.code(201).send({ emulator: row });
        return;
      }

      if (!emulatorBridgeConfigured()) {
        reply.code(503).send({
          error:
            "Docker emulator bridge is not configured on the API. Set ZEPPOLE_EMULATOR_BRIDGE_URL and ZEPPOLE_EMULATOR_BRIDGE_TOKEN, or register a running emulator with mode=manual.",
        });
        return;
      }
      const health = await emulatorBridgeHealth();
      if (!health.kvmAvailable) {
        reply.code(503).send({
          error:
            health.detail ??
            "Docker host has no KVM for budtmo/docker-android (/dev/kvm). Use a Linux host with KVM, merge docker-compose.kvm.yml, or register an external noVNC URL.",
          kvmError: health.lastError,
        });
        return;
      }

      const runtime =
        body.runtime ??
        (body.image && /zeppole-google|android-emulator-268719/i.test(body.image)
          ? "google-aemu"
          : "docker-android");

      if (runtime === "docker-android" && !body.emulatorDevice) {
        reply.code(400).send({ error: "emulatorDevice is required for docker-android runtime" });
        return;
      }

      const draft = await app.prisma.emulatorInstance.create({
        data: {
          name: body.name,
          mode: "docker",
          status: "STARTING",
          emulatorDevice: body.emulatorDevice ?? "Google AEMU",
          dockerImage: body.image ?? null,
        },
      });

      const containerName = `zeppole-emu-${draft.id.replace(/-/g, "").slice(0, 12)}`;
      reply.code(201).send({ emulator: draft });

      void (async () => {
        try {
          const deployed = await bridgeDeploy({
            instanceId: draft.id,
            name: body.name,
            emulatorDevice: body.emulatorDevice,
            image: body.image,
            containerName,
            runtime,
          });

          await app.prisma.emulatorInstance.update({
            where: { id: draft.id },
            data: {
              status: "RUNNING" satisfies EmulatorStatus,
              containerName: deployed.containerName,
              displayUrl: deployed.displayUrl,
              appiumUrl: deployed.appiumUrl,
              dockerImage: deployed.dockerImage,
              errorMessage: null,
            },
          });
        } catch (e) {
          await app.prisma.emulatorInstance.update({
            where: { id: draft.id },
            data: {
              status: "ERROR",
              errorMessage: (e as Error).message,
            },
          });
          request.log.error({ err: e, emulatorId: draft.id }, "Emulator deploy failed");
        }
      })();
    },
  );

  app.post(
    "/emulators/:emulatorId/stop",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulators"], summary: "Stop a docker-backed emulator (requires bridge)" },
    },
    async (request, reply) => {
      if (!assertManage(request.user.role, reply)) return;
      const { emulatorId } = request.params as { emulatorId: string };
      const emu = await app.prisma.emulatorInstance.findUnique({ where: { id: emulatorId } });
      if (!emu) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (emu.mode !== "docker" || !emu.containerName) {
        reply.code(400).send({ error: "Only docker-backed instances with a container can be stopped here" });
        return;
      }
      if (!emulatorBridgeConfigured()) {
        reply.code(503).send({ error: "Emulator bridge not configured" });
        return;
      }

      await app.prisma.emulatorInstance.update({
        where: { id: emulatorId },
        data: { status: "STOPPING" },
      });

      try {
        await bridgeStop({ containerName: emu.containerName });
        const updated = await app.prisma.emulatorInstance.update({
          where: { id: emulatorId },
          data: {
            status: "STOPPED",
            displayUrl: null,
            appiumUrl: null,
            errorMessage: null,
          },
        });
        return reply.send({ emulator: updated });
      } catch (e) {
        await app.prisma.emulatorInstance.update({
          where: { id: emulatorId },
          data: {
            status: "ERROR",
            errorMessage: (e as Error).message,
          },
        });
        reply.code(502).send({ error: (e as Error).message });
      }
    },
  );

  app.delete(
    "/emulators/:emulatorId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulators"], summary: "Remove emulator record (stops docker instance when applicable)" },
    },
    async (request, reply) => {
      if (!assertManage(request.user.role, reply)) return;
      const { emulatorId } = request.params as { emulatorId: string };
      const emu = await app.prisma.emulatorInstance.findUnique({ where: { id: emulatorId } });
      if (!emu) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (emu.mode === "docker" && emu.containerName && emulatorBridgeConfigured()) {
        try {
          await bridgeStop({ containerName: emu.containerName });
        } catch {
          /* best-effort */
        }
      }
      await app.prisma.emulatorInstance.delete({ where: { id: emulatorId } });
      reply.code(204).send();
    },
  );
};
