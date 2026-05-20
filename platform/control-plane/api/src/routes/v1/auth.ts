import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { hashSecret, verifySecret } from "../../lib/crypto.js";

const bootstrapBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/meta/bootstrap-needed",
    {
      schema: {
        tags: ["auth"],
        summary: "Whether the server requires initial admin bootstrap",
      },
    },
    async () => {
      const count = await app.prisma.user.count();
      return { bootstrapNeeded: count === 0 };
    },
  );

  app.get(
    "/auth/me",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["auth"], summary: "Current user" },
    },
    async (request, reply) => {
      const u = await app.prisma.user.findUnique({
        where: { id: request.user.sub },
      });
      if (!u) {
        reply.code(401).send({ error: "Session invalid (user no longer exists)" });
        return;
      }
      return { user: safeUser(u) };
    },
  );

  const authMax = Number(
    process.env.ZEPPOLE_AUTH_RATE_MAX ?? (process.env.NODE_ENV === "production" ? 60 : 600),
  );

  await app.register(
    async (limited) => {
      await limited.register(rateLimit, {
        max: authMax,
        timeWindow: "1 minute",
        errorResponseBuilder: () => ({
          error: "Too many authentication attempts",
          statusCode: 429,
        }),
      });

      limited.post(
        "/auth/bootstrap",
        {
          schema: {
            tags: ["auth"],
            summary: "Create first admin user (only when no users exist)",
            body: { type: "object", required: ["email", "password"] },
            response: {
              201: { type: "object" },
              403: { type: "object" },
            },
          },
        },
        async (request, reply) => {
          const count = await app.prisma.user.count();
          if (count > 0) {
            reply.code(403).send({ error: "Bootstrap already completed" });
            return;
          }
          const body = bootstrapBody.parse(request.body);
          const passwordHash = await hashSecret(body.password);
          const user = await app.prisma.user.create({
            data: {
              email: body.email.toLowerCase(),
              passwordHash,
              role: "ADMIN",
              name: body.name,
            },
          });
          const token = await reply.jwtSign({
            sub: user.id,
            role: user.role,
            email: user.email,
          });
          reply.code(201).send({ token, user: safeUser(user) });
        },
      );

      limited.post(
        "/auth/login",
        {
          schema: {
            tags: ["auth"],
            summary: "Sign in",
          },
        },
        async (request, reply) => {
          const body = loginBody.parse(request.body);
          const user = await app.prisma.user.findUnique({
            where: { email: body.email.toLowerCase() },
          });
          if (!user || !(await verifySecret(body.password, user.passwordHash))) {
            reply.code(401).send({ error: "Invalid credentials" });
            return;
          }
          const token = await reply.jwtSign({
            sub: user.id,
            role: user.role,
            email: user.email,
          });
          reply.send({ token, user: safeUser(user) });
        },
      );
    },
    { encapsulate: false },
  );
};

function safeUser(user: {
  id: string;
  email: string;
  role: string;
  name: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    createdAt: user.createdAt,
  };
}
