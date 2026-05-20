import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashSecret } from "../../lib/crypto.js";
import { can } from "../../lib/roles.js";

const createBody = z.object({
  name: z.string().min(1),
  capabilities: z.record(z.string(), z.unknown()).optional(),
});

export const devicesPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/devices",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["devices"], summary: "List devices (tokens never returned)" },
    },
    async () => {
      return app.prisma.device.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          capabilities: true,
          status: true,
          lastHeartbeat: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    },
  );

  app.post(
    "/devices",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["devices"],
        summary: "Register device; apiToken is shown once",
      },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const body = createBody.parse(request.body);
      const lookup = randomBytes(10).toString("hex");
      const secret = randomBytes(32).toString("hex");
      const plainToken = `${lookup}.${secret}`;
      const apiTokenHash = await hashSecret(plainToken);

      const device = await app.prisma.device.create({
        data: {
          name: body.name,
          tokenLookup: lookup,
          apiTokenHash,
          capabilities: (body.capabilities ?? {}) as Prisma.InputJsonValue,
        },
      });

      reply.code(201).send({
        device: {
          id: device.id,
          name: device.name,
          capabilities: device.capabilities,
          status: device.status,
          createdAt: device.createdAt,
        },
        apiToken: plainToken,
      });
    },
  );

  app.delete(
    "/devices/:deviceId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["devices"], summary: "Remove device" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { deviceId } = request.params as { deviceId: string };
      try {
        await app.prisma.device.delete({ where: { id: deviceId } });
        reply.code(204).send();
      } catch {
        reply.code(404).send({ error: "Not found" });
      }
    },
  );
};
