import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { can } from "../../lib/roles.js";

const createBody = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().optional(),
});

const patchBody = createBody.partial();

export const projectsPlugin: FastifyPluginAsync = async (app) => {
  app.post(
    "/projects",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["projects"], summary: "Create project" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const body = createBody.parse(request.body);
      const project = await app.prisma.project.create({
        data: {
          name: body.name,
          slug: body.slug,
          description: body.description,
        },
      });
      reply.code(201).send(project);
    },
  );

  app.get(
    "/projects",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["projects"], summary: "List projects" },
    },
    async () => {
      return app.prisma.project.findMany({ orderBy: { name: "asc" } });
    },
  );

  app.get(
    "/projects/:projectId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["projects"], summary: "Get project" },
    },
    async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const p = await app.prisma.project.findUnique({ where: { id: projectId } });
      if (!p) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      return p;
    },
  );

  app.patch(
    "/projects/:projectId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["projects"], summary: "Update project" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId } = request.params as { projectId: string };
      const body = patchBody.parse(request.body);
      try {
        return await app.prisma.project.update({
          where: { id: projectId },
          data: body,
        });
      } catch {
        reply.code(404).send({ error: "Not found" });
      }
    },
  );

  app.delete(
    "/projects/:projectId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["projects"], summary: "Delete project" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { projectId } = request.params as { projectId: string };
      try {
        await app.prisma.project.delete({ where: { id: projectId } });
        reply.code(204).send();
      } catch {
        reply.code(404).send({ error: "Not found" });
      }
    },
  );
};
