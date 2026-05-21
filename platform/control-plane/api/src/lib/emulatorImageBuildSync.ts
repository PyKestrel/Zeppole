import type { EmulatorImageBuild, PrismaClient } from "@prisma/client";
import {
  derivePhaseFromLog,
  elapsedSeconds,
  lastLogLine,
  parseBuildFailureReason,
  phaseLabel,
  type BuildPhaseId,
} from "./buildPhase.js";
import { imageBuilderConfigured, pollImageBuild } from "./imageBuilder.js";

export type EnrichedEmulatorImageBuild = EmulatorImageBuild & {
  phase: BuildPhaseId | string;
  phaseLabel: string;
  lastLogLine: string | null;
  elapsedSeconds: number;
};

export function enrichBuild(row: EmulatorImageBuild, remotePhase?: string): EnrichedEmulatorImageBuild {
  const phase =
    remotePhase ??
    (row.status === "SUCCEEDED"
      ? "complete"
      : row.status === "FAILED"
        ? "failed"
        : derivePhaseFromLog(row.buildLog, row.status));
  const failureHint = row.status === "FAILED" ? parseBuildFailureReason(row.buildLog) : null;
  return {
    ...row,
    phase,
    phaseLabel: phaseLabel(phase),
    lastLogLine: lastLogLine(row.buildLog),
    elapsedSeconds: elapsedSeconds(row.createdAt),
    errorMessage: failureHint ?? row.errorMessage,
  };
}

export async function syncBuildFromBuilder(
  prisma: PrismaClient,
  row: EmulatorImageBuild,
): Promise<EnrichedEmulatorImageBuild> {
  if (!imageBuilderConfigured() || row.status !== "BUILDING") {
    return enrichBuild(row);
  }
  try {
    const remote = await pollImageBuild(row.id);
    const logChanged = remote.logTail !== (row.buildLog ?? "");
    const statusChanged = remote.status !== row.status;
    const updated =
      statusChanged || logChanged
        ? await prisma.emulatorImageBuild.update({
            where: { id: row.id },
            data: {
              status: remote.status,
              buildLog: remote.logTail || null,
              imageRef: remote.status === "SUCCEEDED" ? row.dockerTag : row.imageRef,
              errorMessage:
                remote.status === "FAILED"
                  ? parseBuildFailureReason(remote.logTail) ??
                    row.errorMessage ??
                    "Build failed — see build log"
                  : null,
            },
          })
        : row;
    return enrichBuild(updated, remote.phase);
  } catch {
    return enrichBuild(row);
  }
}

export async function syncAllBuildingBuilds(prisma: PrismaClient): Promise<EnrichedEmulatorImageBuild[]> {
  const rows = await prisma.emulatorImageBuild.findMany({ orderBy: { createdAt: "desc" } });
  const building = rows.filter((r) => r.status === "BUILDING");
  if (building.length === 0) {
    return rows.map((r) => enrichBuild(r));
  }
  const synced = await Promise.all(building.map((r) => syncBuildFromBuilder(prisma, r)));
  const byId = new Map(synced.map((b) => [b.id, b]));
  return rows.map((r) => byId.get(r.id) ?? enrichBuild(r));
}
