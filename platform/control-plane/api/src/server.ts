import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();
await app.listen({ port, host });
app.log.info({ port, host }, "Zeppole API listening");

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  try {
    await app.close();
  } finally {
    await prisma.$disconnect();
  }
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
