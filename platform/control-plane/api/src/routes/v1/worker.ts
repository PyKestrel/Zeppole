import type { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { validateWorkerResultsAgainstCycle } from "../../lib/cycleValidation.js";
import { notifyRunFinished } from "../../lib/notifyWebhooks.js";
import { finalizeRunIfComplete } from "../../lib/runLifecycle.js";
import { resolveDeviceFromAuthHeader } from "../../lib/deviceAuth.js";

const heartbeatBody = z.object({
  status: z.enum(["ONLINE", "OFFLINE", "BUSY"]).optional(),
});

const completeBody = z.object({
  results: z
    .array(
      z.object({
        testCaseId: z.string().uuid(),
        status: z.enum(["PASSED", "FAILED", "SKIPPED"]),
        durationMs: z.number().int().optional(),
        logs: z.string().optional(),
        artifactUrls: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
  infrastructureError: z.string().optional(),
});

async function requireDevice(
  app: { prisma: import("@prisma/client").PrismaClient },
  request: { headers: { authorization?: string } },
) {
  return resolveDeviceFromAuthHeader(app, request.headers.authorization);
}

export const workerPlugin: FastifyPluginAsync = async (app) => {
  app.post(
    "/worker/heartbeat",
    {
      schema: { tags: ["worker"], summary: "Worker heartbeat (Bearer device token)" },
    },
    async (request, reply) => {
      const device = await requireDevice(app, request);
      if (!device) {
        reply.code(401).send({ error: "Invalid device token" });
        return;
      }
      const body = heartbeatBody.parse(request.body ?? {});
      const status = body.status ?? "ONLINE";
      await app.prisma.device.update({
        where: { id: device.id },
        data: {
          status,
          lastHeartbeat: new Date(),
        },
      });
      return { ok: true };
    },
  );

  app.get(
    "/worker/jobs/next",
    {
      schema: { tags: ["worker"], summary: "Claim next pending job for this device" },
    },
    async (request, reply) => {
      const device = await requireDevice(app, request);
      if (!device) {
        reply.code(401).send({ error: "Invalid device token" });
        return;
      }

      const job = await app.prisma.executionJob.findFirst({
        where: {
          deviceId: device.id,
          status: "PENDING",
        },
        orderBy: { createdAt: "asc" },
        include: {
          run: {
            include: {
              cycle: {
                include: {
                  items: {
                    orderBy: { sortOrder: "asc" },
                    include: { testCase: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!job) {
        return reply.code(204);
      }

      const updated = await app.prisma.executionJob.update({
        where: { id: job.id },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
        },
        include: {
          run: {
            include: {
              cycle: {
                include: {
                  items: {
                    orderBy: { sortOrder: "asc" },
                    include: { testCase: true },
                  },
                },
              },
            },
          },
        },
      });

      await app.prisma.device.update({
        where: { id: device.id },
        data: { status: "BUSY", lastHeartbeat: new Date() },
      });

      return updated;
    },
  );

  app.post(
    "/worker/jobs/:jobId/complete",
    {
      schema: { tags: ["worker"], summary: "Publish results for a job" },
    },
    async (request, reply) => {
      const device = await requireDevice(app, request);
      if (!device) {
        reply.code(401).send({ error: "Invalid device token" });
        return;
      }
      const { jobId } = request.params as { jobId: string };
      const body = completeBody.parse(request.body);

      const job = await app.prisma.executionJob.findFirst({
        where: { id: jobId, deviceId: device.id },
        include: {
          run: {
            include: {
              cycle: {
                include: {
                  items: {
                    orderBy: { sortOrder: "asc" },
                    include: { testCase: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!job) {
        reply.code(404).send({ error: "Job not found" });
        return;
      }

      if (job.status === "COMPLETED") {
        reply.send({ ok: true, idempotentReplay: true });
        return;
      }

      if (job.status !== "RUNNING") {
        reply.code(400).send({ error: "Job is not running" });
        return;
      }

      const cycleCaseIds = job.run.cycle.items.map((i) => i.testCaseId);

      if (body.infrastructureError) {
        const attempt = job.attemptCount + 1;
        const shouldRetry = attempt < job.maxRetries;
        await app.prisma.$transaction(async (tx) => {
          if (shouldRetry) {
            await tx.executionJob.update({
              where: { id: jobId },
              data: {
                status: "PENDING",
                attemptCount: attempt,
                errorMessage: body.infrastructureError,
                startedAt: null,
              },
            });
          } else {
            await tx.executionJob.update({
              where: { id: jobId },
              data: {
                status: "FAILED",
                attemptCount: attempt,
                errorMessage: body.infrastructureError,
                completedAt: new Date(),
              },
            });
            await tx.run.update({
              where: { id: job.runId },
              data: { status: "FAILED" },
            });
          }
        });

        if (!shouldRetry) {
          await notifyRunFinished(app.prisma, app.log, job.runId);
        }

        await app.prisma.device.update({
          where: { id: device.id },
          data: { status: "ONLINE", lastHeartbeat: new Date() },
        });

        reply.send({ ok: true, retried: shouldRetry });
        return;
      }

      const dedup = new Map<string, (typeof body.results)[number]>();
      for (const r of body.results) {
        dedup.set(r.testCaseId, r);
      }
      const uniqueResults = [...dedup.values()];

      const check = validateWorkerResultsAgainstCycle(
        cycleCaseIds,
        uniqueResults.map((r) => r.testCaseId),
      );
      if (!check.ok) {
        reply.code(400).send({ error: check.error });
        return;
      }

      await app.prisma.$transaction(async (tx) => {
        await tx.testResult.deleteMany({
          where: { runId: job.runId, deviceId: device.id },
        });

        for (const r of uniqueResults) {
          await tx.testResult.create({
            data: {
              runId: job.runId,
              testCaseId: r.testCaseId,
              deviceId: device.id,
              status: r.status,
              durationMs: r.durationMs,
              logs: r.logs,
              artifactUrls:
                r.artifactUrls !== undefined
                  ? (r.artifactUrls as Prisma.InputJsonValue)
                  : undefined,
            },
          });
        }

        await tx.executionJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            errorMessage: null,
          },
        });

        await finalizeRunIfComplete(tx, job.runId);
      });

      await notifyRunFinished(app.prisma, app.log, job.runId);

      await app.prisma.device.update({
        where: { id: device.id },
        data: { status: "ONLINE", lastHeartbeat: new Date() },
      });

      reply.send({ ok: true });
    },
  );
};
