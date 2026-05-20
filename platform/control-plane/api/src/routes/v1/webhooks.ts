import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { can } from "../../lib/roles.js";

const bodySchema = z.object({
  url: z.string().url(),
  secret: z.string().min(8),
  events: z.array(z.string()).min(1),
  active: z.boolean().optional(),
});

export const webhooksPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/webhooks",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["webhooks"], summary: "List webhooks" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      return app.prisma.webhook.findMany({ orderBy: { createdAt: "desc" } });
    },
  );

  app.post(
    "/webhooks",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["webhooks"], summary: "Create webhook" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const body = bodySchema.parse(request.body);
      const wh = await app.prisma.webhook.create({
        data: {
          url: body.url,
          secret: body.secret,
          events: body.events,
          active: body.active ?? true,
        },
      });
      reply.code(201).send(wh);
    },
  );

  app.delete(
    "/webhooks/:webhookId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["webhooks"], summary: "Delete webhook" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { webhookId } = request.params as { webhookId: string };
      try {
        await app.prisma.webhook.delete({ where: { id: webhookId } });
        reply.code(204).send();
      } catch {
        reply.code(404).send({ error: "Not found" });
      }
    },
  );
};
