import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { can } from "../../lib/roles.js";

const createCycle = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const setItems = z.object({
  testCaseIds: z.array(z.string().uuid()),
});

export const testCyclesPlugin: FastifyPluginAsync = async (app) => {
  app.post(
    "/projects/:projectId/test-cycles",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cycles"], summary: "Create test cycle" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId } = request.params as { projectId: string };
      const body = createCycle.parse(request.body);
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }
      const cycle = await app.prisma.testCycle.create({
        data: {
          projectId,
          name: body.name,
          description: body.description,
        },
      });
      reply.code(201).send(cycle);
    },
  );

  app.get(
    "/projects/:projectId/test-cycles",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cycles"], summary: "List test cycles" },
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }
      return app.prisma.testCycle.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
      });
    },
  );

  app.get(
    "/projects/:projectId/test-cycles/:cycleId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cycles"], summary: "Get cycle with ordered cases" },
    },
    async (request, reply) => {
      const { projectId, cycleId } = request.params as {
        projectId: string;
        cycleId: string;
      };
      const cycle = await app.prisma.testCycle.findFirst({
        where: { id: cycleId, projectId },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: { testCase: true },
          },
        },
      });
      if (!cycle) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      return cycle;
    },
  );

  app.patch(
    "/projects/:projectId/test-cycles/:cycleId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cycles"], summary: "Update cycle metadata" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId, cycleId } = request.params as {
        projectId: string;
        cycleId: string;
      };
      const body = createCycle.partial().parse(request.body);
      const existing = await app.prisma.testCycle.findFirst({
        where: { id: cycleId, projectId },
      });
      if (!existing) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      return app.prisma.testCycle.update({
        where: { id: cycleId },
        data: body,
      });
    },
  );

  app.put(
    "/projects/:projectId/test-cycles/:cycleId/items",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cycles"], summary: "Replace ordered test cases in cycle" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId, cycleId } = request.params as {
        projectId: string;
        cycleId: string;
      };
      const body = setItems.parse(request.body);
      const cycle = await app.prisma.testCycle.findFirst({
        where: { id: cycleId, projectId },
      });
      if (!cycle) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const cases = await app.prisma.testCase.findMany({
        where: { projectId, id: { in: body.testCaseIds } },
      });
      if (cases.length !== body.testCaseIds.length) {
        reply.code(400).send({ error: "One or more test cases are invalid for this project" });
        return;
      }

      await app.prisma.$transaction(async (tx) => {
        await tx.cycleItem.deleteMany({ where: { cycleId } });
        let order = 0;
        for (const id of body.testCaseIds) {
          await tx.cycleItem.create({
            data: {
              cycleId,
              testCaseId: id,
              sortOrder: order++,
            },
          });
        }
      });

      return app.prisma.testCycle.findFirstOrThrow({
        where: { id: cycleId },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: { testCase: true },
          },
        },
      });
    },
  );

  app.delete(
    "/projects/:projectId/test-cycles/:cycleId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cycles"], summary: "Delete cycle" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId, cycleId } = request.params as {
        projectId: string;
        cycleId: string;
      };
      const existing = await app.prisma.testCycle.findFirst({
        where: { id: cycleId, projectId },
      });
      if (!existing) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      await app.prisma.testCycle.delete({ where: { id: cycleId } });
      reply.code(204).send();
    },
  );
};
