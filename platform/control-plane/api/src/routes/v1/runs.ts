import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { notifyRunFinished } from "../../lib/notifyWebhooks.js";
import { can } from "../../lib/roles.js";

const executeBody = z.object({
  cycleId: z.string().uuid(),
  deviceIds: z.array(z.string().uuid()).min(1),
  idempotencyKey: z.string().min(4).max(256).optional(),
});

export const runsPlugin: FastifyPluginAsync = async (app) => {
  app.post(
    "/projects/:projectId/runs/execute",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["runs"], summary: "Execute a test cycle on one or more devices (idempotent)" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "execute_runs")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId } = request.params as { projectId: string };
      const body = executeBody.parse(request.body);

      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }

      if (body.idempotencyKey) {
        const existing = await app.prisma.run.findUnique({
          where: {
            projectId_idempotencyKey: {
              projectId,
              idempotencyKey: body.idempotencyKey,
            },
          },
          include: { executionJobs: true },
        });
        if (existing) {
          reply.header("X-Idempotent-Replay", "true");
          reply.send(existing);
          return;
        }
      }

      const cycle = await app.prisma.testCycle.findFirst({
        where: { id: body.cycleId, projectId },
        include: { items: true },
      });
      if (!cycle || cycle.items.length === 0) {
        reply.code(400).send({ error: "Cycle not found or has no test cases" });
        return;
      }

      const devices = await app.prisma.device.findMany({
        where: { id: { in: body.deviceIds } },
      });
      if (devices.length !== body.deviceIds.length) {
        reply.code(400).send({ error: "One or more devices are invalid" });
        return;
      }

      const run = await app.prisma.$transaction(async (tx) => {
        const r = await tx.run.create({
          data: {
            projectId,
            cycleId: body.cycleId,
            status: "RUNNING",
            idempotencyKey: body.idempotencyKey,
          },
        });
        for (const deviceId of body.deviceIds) {
          await tx.executionJob.create({
            data: {
              runId: r.id,
              deviceId,
              status: "PENDING",
            },
          });
        }
        return tx.run.findUniqueOrThrow({
          where: { id: r.id },
          include: { executionJobs: { include: { device: true } } },
        });
      });

      reply.code(201).send(run);
    },
  );

  app.get(
    "/projects/:projectId/runs",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["runs"], summary: "List runs for project" },
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }
      return app.prisma.run.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          executionJobs: { include: { device: { select: { id: true, name: true } } } },
        },
      });
    },
  );

  app.get(
    "/projects/:projectId/runs/:runId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["runs"], summary: "Run detail with results" },
    },
    async (request, reply) => {
      const { projectId, runId } = request.params as { projectId: string; runId: string };
      const run = await app.prisma.run.findFirst({
        where: { id: runId, projectId },
        include: {
          executionJobs: { include: { device: true } },
          results: { include: { testCase: true, device: true } },
          cycle: {
            include: {
              items: {
                orderBy: { sortOrder: "asc" },
                include: { testCase: true },
              },
            },
          },
        },
      });
      if (!run) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      return run;
    },
  );

  app.post(
    "/projects/:projectId/runs/:runId/cancel",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["runs"], summary: "Cancel a queued/running test run" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "execute_runs")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId, runId } = request.params as { projectId: string; runId: string };
      const run = await app.prisma.run.findFirst({
        where: { id: runId, projectId },
        include: { executionJobs: true },
      });
      if (!run) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      if (run.status === "PASSED" || run.status === "FAILED" || run.status === "CANCELLED") {
        reply.code(400).send({ error: "Run is already terminal" });
        return;
      }

      await app.prisma.$transaction(async (tx) => {
        await tx.run.update({
          where: { id: runId },
          data: { status: "CANCELLED" },
        });
        await tx.executionJob.updateMany({
          where: { runId, status: { in: ["PENDING", "RUNNING", "RETRYING"] } },
          data: { status: "FAILED", errorMessage: "Cancelled by user", completedAt: new Date() },
        });
      });

      await notifyRunFinished(app.prisma, app.log, runId);

      reply.code(204).send();
    },
  );
};
