import type { Device } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { verifySecret } from "./crypto.js";

export async function resolveDeviceFromAuthHeader(
  app: Pick<FastifyInstance, "prisma">,
  authHeader: string | undefined,
): Promise<Device | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const lookup = raw.slice(0, dot);
  const device = await app.prisma.device.findUnique({ where: { tokenLookup: lookup } });
  if (!device) return null;
  const ok = await verifySecret(raw, device.apiTokenHash);
  return ok ? device : null;
}
