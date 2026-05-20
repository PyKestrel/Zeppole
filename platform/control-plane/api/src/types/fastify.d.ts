import type { PrismaClient, Role } from "@prisma/client";
import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    prisma: PrismaClient;
  }
}

export interface JwtUserPayload {
  sub: string;
  role: Role;
  email: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: JwtUserPayload;
  }
}
