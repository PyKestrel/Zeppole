/** Human-readable build phases for Google aemu image builds. */
export const BUILD_PHASES = [
  { id: "initializing", label: "Initializing" },
  { id: "sdk_download", label: "SDK & system image" },
  { id: "docker_base", label: "Docker base image" },
  { id: "zeppole_overlay", label: "Zeppole overlay" },
  { id: "complete", label: "Complete" },
] as const;

export type BuildPhaseId = (typeof BUILD_PHASES)[number]["id"] | "failed" | "unknown";

export function phaseLabel(phase: string): string {
  const row = BUILD_PHASES.find((p) => p.id === phase);
  if (row) return row.label;
  if (phase === "failed") return "Failed";
  if (phase === "unknown") return "Preparing";
  return phase.replace(/_/g, " ");
}

export function derivePhaseFromLog(log: string | null | undefined, status: string): BuildPhaseId {
  const s = status.toUpperCase();
  if (s === "SUCCEEDED") return "complete";
  if (s === "FAILED") return "failed";
  const text = log ?? "";
  if (text.includes("build complete") || text.includes("PHASE:complete")) return "complete";
  if (text.includes("PHASE:zeppole_overlay") || text.includes("applying Zeppole overlay")) return "zeppole_overlay";
  if (text.includes("PHASE:docker_base") || text.includes("docker build base")) return "docker_base";
  if (text.includes("PHASE:sdk_download") || text.includes("emu-docker create")) return "sdk_download";
  if (text.includes("PHASE:initializing") || text.includes("build") && text.includes("starting")) return "initializing";
  return "unknown";
}

export function lastLogLine(log: string | null | undefined): string | null {
  if (!log?.trim()) return null;
  const lines = log.trim().split(/\r?\n/).filter(Boolean);
  return lines.length ? lines[lines.length - 1]! : null;
}

export function elapsedSeconds(createdAt: Date | string): number {
  const t = typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
