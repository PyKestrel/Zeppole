import type { Prisma, PrismaClient, ResultStatus, RunStatus } from "@prisma/client";

/**
 * After jobs complete, roll up run status from test results.
 */
export async function finalizeRunIfComplete(
  prisma: PrismaClient | Prisma.TransactionClient,
  runId: string,
): Promise<void> {
  const jobs = await prisma.executionJob.findMany({ where: { runId } });
  if (jobs.length === 0) return;

  const unfinished = jobs.some(
    (j) => !["COMPLETED", "FAILED"].includes(j.status),
  );
  if (unfinished) return;

  if (jobs.some((j) => j.status === "FAILED")) {
    await prisma.run.update({
      where: { id: runId },
      data: { status: "FAILED" satisfies RunStatus },
    });
    return;
  }

  const results = await prisma.testResult.findMany({ where: { runId } });
  if (results.length === 0) {
    await prisma.run.update({
      where: { id: runId },
      data: { status: "FAILED" satisfies RunStatus },
    });
    return;
  }

  const anyFail = results.some((r) => r.status === ("FAILED" satisfies ResultStatus));
  await prisma.run.update({
    where: { id: runId },
    data: { status: anyFail ? "FAILED" : "PASSED" },
  });
}
