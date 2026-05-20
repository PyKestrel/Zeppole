import { createHmac } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "@prisma/client";

const WEBHOOK_TIMEOUT_MS = 15_000;

/** Events operators may subscribe to (subset used by Zeppole today). */
export const WEBHOOK_EVENTS = ["run.finished", "run.completed"] as const;

function matchesWebhook(events: string[]): boolean {
  return events.some((e) => e === "run.finished" || e === "run.completed");
}

/**
 * POST active webhooks when a run reaches a terminal status (PASSED | FAILED | CANCELLED).
 * Failures are logged only — API responses are never blocked by webhook latency.
 */
export async function notifyRunFinished(
  prisma: PrismaClient,
  log: FastifyBaseLogger,
  runId: string,
): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { project: { select: { id: true, name: true, slug: true } } },
  });

  if (!run) return;
  if (!["PASSED", "FAILED", "CANCELLED"].includes(run.status)) return;

  const hooks = await prisma.webhook.findMany({ where: { active: true } });
  if (hooks.length === 0) return;

  const payload = {
    event: "run.finished",
    timestamp: new Date().toISOString(),
    run: {
      id: run.id,
      status: run.status,
      projectId: run.projectId,
      cycleId: run.cycleId,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      project: run.project,
    },
  };

  const rawBody = JSON.stringify(payload);
  const ua =
    process.env.ZEPPOLE_PUBLIC_DOCS_URL != null && process.env.ZEPPOLE_PUBLIC_DOCS_URL !== ""
      ? `Zeppole/1 (+${process.env.ZEPPOLE_PUBLIC_DOCS_URL})`
      : "Zeppole/1";

  await Promise.all(
    hooks.map(async (hook) => {
      if (!matchesWebhook(hook.events)) return;

      const sig = createHmac("sha256", hook.secret).update(rawBody).digest("hex");

      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), WEBHOOK_TIMEOUT_MS);
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": ua,
            "X-Zeppole-Signature": `sha256=${sig}`,
            "X-Zeppole-Event": "run.finished",
          },
          body: rawBody,
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
          log.warn({ webhookId: hook.id, status: res.status }, "webhook delivery failed");
        }
      } catch (err) {
        log.warn({ webhookId: hook.id, err }, "webhook delivery error");
      }
    }),
  );
}
