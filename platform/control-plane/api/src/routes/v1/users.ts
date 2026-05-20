import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashSecret } from "../../lib/crypto.js";
import { can } from "../../lib/roles.js";
import type { Role } from "@prisma/client";

const patchUserBody = z.object({
  role: z.enum(["ADMIN", "QA_LEAD", "AUTOMATION", "VIEWER"]).optional(),
  name: z.string().optional(),
  password: z.string().min(8).optional(),
});

export const usersPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/users",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["users"], summary: "List users (admin)" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_users")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      return app.prisma.user.findMany({
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          createdAt: true,
        },
      });
    },
  );

  app.patch(
    "/users/:userId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["users"], summary: "Update user (admin)" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_users")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { userId } = request.params as { userId: string };
      const body = patchUserBody.parse(request.body);

      const data: {
        role?: Role;
        name?: string | null;
        passwordHash?: string;
      } = {};
      if (body.role !== undefined) data.role = body.role as Role;
      if (body.name !== undefined) data.name = body.name;
      if (body.password !== undefined) data.passwordHash = await hashSecret(body.password);

      if (Object.keys(data).length === 0) {
        reply.code(400).send({ error: "No fields to update" });
        return;
      }

      try {
        const user = await app.prisma.user.update({
          where: { id: userId },
          data,
          select: {
            id: true,
            email: true,
            role: true,
            name: true,
            createdAt: true,
          },
        });
        return user;
      } catch {
        reply.code(404).send({ error: "Not found" });
      }
    },
  );
};
