import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseQmetryImport } from "../../lib/qmetryImport.js";
import { can } from "../../lib/roles.js";

const stepSchema = z.object({
  action: z.string().min(1),
  expected: z.string().optional(),
  testData: z.string().optional(),
});

const bodySchema = z.object({
  title: z.string().min(1),
  steps: z.string().optional(),
  stepsList: z.array(stepSchema).optional(),
  automationRef: z.string().optional(),
  priority: z.number().int().optional(),
});

const importSchema = z.object({
  source: z.enum(["qmetry", "qmetry-jira-plugin"]),
  format: z.enum(["json", "csv"]),
  payload: z.string().min(2),
});

function stepsToLegacyText(stepsList: { action: string; expected?: string; testData?: string }[]): string {
  if (stepsList.length === 0) return "";
  return stepsList
    .map((s, idx) => `${idx + 1}. ${s.action}${s.expected ? ` -> ${s.expected}` : ""}${s.testData ? ` [data: ${s.testData}]` : ""}`)
    .join("\n");
}

export const testCasesPlugin: FastifyPluginAsync = async (app) => {
  app.post(
    "/projects/:projectId/test-cases/import",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cases"], summary: "Import QMetry/Jira-plugin test cases and cycles" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }

      const { projectId } = request.params as { projectId: string };
      const body = importSchema.parse(request.body);
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }

      let imported;
      try {
        imported = parseQmetryImport(body.format, body.payload);
      } catch {
        reply.code(400).send({ error: "Invalid import payload" });
        return;
      }
      if (imported.length === 0) {
        reply.code(400).send({ error: "No test cases found in import payload" });
        return;
      }

      const cycleMap = new Map<string, string[]>();
      let createdCases = 0;
      let createdCycles = 0;

      await app.prisma.$transaction(async (tx) => {
        for (const c of imported) {
          const tc = await tx.testCase.create({
            data: {
              projectId,
              title: c.title,
              steps: stepsToLegacyText(c.steps),
              automationRef: c.automationRef,
              priority: c.priority ?? 0,
              stepsList: {
                create: c.steps.map((s, idx) => ({
                  action: s.action,
                  expected: s.expected,
                  testData: s.testData,
                  sortOrder: idx,
                })),
              },
            },
          });
          createdCases++;
          for (const cycleName of c.cycleNames) {
            const list = cycleMap.get(cycleName) ?? [];
            list.push(tc.id);
            cycleMap.set(cycleName, list);
          }
        }

        for (const [cycleName, testCaseIds] of cycleMap.entries()) {
          const cyc = await tx.testCycle.create({
            data: { projectId, name: cycleName },
          });
          createdCycles++;
          for (let idx = 0; idx < testCaseIds.length; idx++) {
            await tx.cycleItem.create({
              data: { cycleId: cyc.id, testCaseId: testCaseIds[idx], sortOrder: idx },
            });
          }
        }
      });

      reply.code(201).send({
        source: body.source,
        importedCases: createdCases,
        importedCycles: createdCycles,
      });
    },
  );

  app.post(
    "/projects/:projectId/test-cases",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cases"], summary: "Create test case" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId } = request.params as { projectId: string };
      const body = bodySchema.parse(request.body);
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }
      const stepsList = body.stepsList ?? [];
      const tc = await app.prisma.testCase.create({
        data: {
          projectId,
          title: body.title,
          steps: body.steps ?? stepsToLegacyText(stepsList),
          automationRef: body.automationRef,
          priority: body.priority ?? 0,
          stepsList: {
            create: stepsList.map((s, idx) => ({
              action: s.action,
              expected: s.expected,
              testData: s.testData,
              sortOrder: idx,
            })),
          },
        },
        include: { stepsList: { orderBy: { sortOrder: "asc" } } },
      });
      reply.code(201).send(tc);
    },
  );

  app.get(
    "/projects/:projectId/test-cases",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cases"], summary: "List test cases" },
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const project = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }
      return app.prisma.testCase.findMany({
        where: { projectId },
        orderBy: [{ priority: "desc" }, { title: "asc" }],
        include: { stepsList: { orderBy: { sortOrder: "asc" } } },
      });
    },
  );

  app.get(
    "/projects/:projectId/test-cases/:testCaseId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cases"], summary: "Get test case" },
    },
    async (request, reply) => {
      const { projectId, testCaseId } = request.params as {
        projectId: string;
        testCaseId: string;
      };
      const tc = await app.prisma.testCase.findFirst({
        where: { id: testCaseId, projectId },
        include: { stepsList: { orderBy: { sortOrder: "asc" } } },
      });
      if (!tc) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      return tc;
    },
  );

  app.patch(
    "/projects/:projectId/test-cases/:testCaseId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cases"], summary: "Update test case" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId, testCaseId } = request.params as {
        projectId: string;
        testCaseId: string;
      };
      const existing = await app.prisma.testCase.findFirst({
        where: { id: testCaseId, projectId },
      });
      if (!existing) {
        reply.code(404).send({ error: "Not found" });
        return;
      }

      const body = bodySchema.partial().parse(request.body);
      const nextStepsList = body.stepsList;
      const updated = await app.prisma.$transaction(async (tx) => {
        if (nextStepsList) {
          await tx.testCaseStep.deleteMany({ where: { testCaseId } });
          for (let idx = 0; idx < nextStepsList.length; idx++) {
            await tx.testCaseStep.create({
              data: {
                testCaseId,
                action: nextStepsList[idx].action,
                expected: nextStepsList[idx].expected,
                testData: nextStepsList[idx].testData,
                sortOrder: idx,
              },
            });
          }
        }

        return tx.testCase.update({
          where: { id: testCaseId },
          data: {
            title: body.title,
            steps:
              body.steps ?? (nextStepsList ? stepsToLegacyText(nextStepsList) : undefined),
            automationRef: body.automationRef,
            priority: body.priority,
          },
          include: { stepsList: { orderBy: { sortOrder: "asc" } } },
        });
      });
      reply.send(updated);
    },
  );

  app.delete(
    "/projects/:projectId/test-cases/:testCaseId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["test-cases"], summary: "Delete test case" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId, testCaseId } = request.params as {
        projectId: string;
        testCaseId: string;
      };
      const existing = await app.prisma.testCase.findFirst({
        where: { id: testCaseId, projectId },
      });
      if (!existing) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      await app.prisma.testCase.delete({ where: { id: testCaseId } });
      reply.code(204).send();
    },
  );
};
