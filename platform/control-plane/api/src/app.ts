import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyJwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { validateProductionEnv } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { registerV1 } from "./routes/v1/index.js";

const API_TITLE = "Zeppole API";
const API_VERSION = "0.1.0";

export async function buildApp() {
  validateProductionEnv();

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    requestIdHeader: "x-request-id",
    genReqId: (req) =>
      (req.headers["x-request-id"] as string) || randomUUID(),
    trustProxy: process.env.TRUST_PROXY === "true",
  });

  app.decorate("prisma", prisma);

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, { origin: true, credentials: true });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    app.log.warn("JWT_SECRET is not set; using insecure dev default (set in production).");
  }
  await app.register(fastifyJwt, {
    secret: jwtSecret ?? "unsafe-dev-zeppole-jwt-secret",
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  await app.register(swagger, {
    openapi: {
      info: { title: API_TITLE, version: API_VERSION },
      tags: [
        { name: "auth", description: "Authentication and bootstrap" },
        { name: "users", description: "Users and RBAC (admin)" },
        { name: "projects", description: "Projects" },
        { name: "test-cases", description: "Test cases" },
        { name: "test-cycles", description: "Test cycles" },
        { name: "runs", description: "Test runs" },
        { name: "devices", description: "Device pool" },
        { name: "emulators", description: "Android emulator instances (docker / manual)" },
        { name: "emulator-images", description: "Custom Google aemu container image builds" },
        { name: "worker", description: "Execution worker API" },
        { name: "webhooks", description: "Webhooks" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
    staticCSP: true,
  });

  app.get("/health", async () => ({ status: "ok", service: "zeppole-api" }));

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: "Validation failed", details: err.flatten() });
      return;
    }
    request.log.error(err);
    reply.code((err as { statusCode?: number }).statusCode ?? 500).send({
      error: (err as Error).message ?? "Internal Server Error",
    });
  });

  await app.register(registerV1, { prefix: "/api/v1" });

  return app;
}

export function zeppoleUserAgent(): string {
  const ver = API_VERSION;
  const docs = process.env.ZEPPOLE_PUBLIC_DOCS_URL ?? "";
  return docs ? `Zeppole/${ver} (+${docs})` : `Zeppole/${ver}`;
}

export type { JwtUserPayload } from "./types/fastify.js";
