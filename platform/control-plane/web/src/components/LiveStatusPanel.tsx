import { useEffect, useRef } from "react";

export type LiveStep = { id: string; label: string };

function stepState(
  steps: LiveStep[],
  currentId: string,
  failed: boolean,
): Record<string, "done" | "active" | "pending" | "failed"> {
  const idx = steps.findIndex((s) => s.id === currentId);
  const activeIdx = failed ? idx : idx >= 0 ? idx : 0;
  const out: Record<string, "done" | "active" | "pending" | "failed"> = {};
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (failed && i === activeIdx) out[s.id] = "failed";
    else if (i < activeIdx) out[s.id] = "done";
    else if (i === activeIdx) out[s.id] = failed ? "failed" : "active";
    else out[s.id] = "pending";
  }
  if (currentId === "complete") {
    for (const s of steps) out[s.id] = "done";
  }
  return out;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function LiveStatusPanel({
  title,
  phaseLabel,
  phaseId,
  steps,
  status,
  elapsedSeconds,
  lastLogLine,
  buildLog,
  errorMessage,
  isLive,
  builderDetail,
  hint,
}: {
  title: string;
  phaseLabel: string;
  phaseId: string;
  steps: LiveStep[];
  status: string;
  elapsedSeconds: number;
  lastLogLine?: string | null;
  buildLog?: string | null;
  errorMessage?: string | null;
  isLive: boolean;
  builderDetail?: string | null;
  hint?: string;
}) {
  const logRef = useRef<HTMLPreElement>(null);
  const failed = status.toUpperCase() === "FAILED" || phaseId === "failed";
  const states = stepState(steps, phaseId === "failed" ? steps[steps.length - 2]?.id ?? "unknown" : phaseId, failed);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [buildLog]);

  return (
    <div className="live-status" aria-live="polite">
      <div className="live-status__header">
        <div>
          <h3 className="live-status__title">{title}</h3>
          <p className="live-status__phase">
            <span className="live-status__phase-label">{phaseLabel}</span>
            <span className="live-status__elapsed"> · {formatElapsed(elapsedSeconds)}</span>
          </p>
        </div>
        {isLive ? (
          <span className="live-status__pulse" title={builderDetail ?? "Refreshing"}>
            <span className="live-status__dot" aria-hidden />
            Live
          </span>
        ) : null}
      </div>

      <ol className="live-status__steps">
        {steps.map((s) => (
          <li key={s.id} className={`live-status__step live-status__step--${states[s.id] ?? "pending"}`}>
            <span className="live-status__step-marker" aria-hidden />
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {lastLogLine ? (
        <p className="live-status__last-line muted small" title={lastLogLine}>
          {lastLogLine}
        </p>
      ) : null}

      {errorMessage ? <p className="field-error small">{errorMessage}</p> : null}

      {hint ? <p className="live-status__hint muted small">{hint}</p> : null}

      <pre ref={logRef} className="log-preview live-status__log small">
        {buildLog?.trim() ? buildLog.slice(-6000) : "Waiting for build output…"}
      </pre>
    </div>
  );
}

export const IMAGE_BUILD_STEPS: LiveStep[] = [
  { id: "initializing", label: "Initializing" },
  { id: "sdk_download", label: "SDK & system image" },
  { id: "docker_base", label: "Docker base image" },
  { id: "zeppole_overlay", label: "Zeppole boot overlay" },
  { id: "cleanup", label: "Cleaning up" },
  { id: "complete", label: "Complete" },
];

export function deployPhaseLabel(elapsedSeconds: number, dockerImage?: string | null): string {
  if (elapsedSeconds < 15) return "Creating Docker network";
  if (elapsedSeconds < 45) {
    return dockerImage ? `Starting emulator (${dockerImage})` : "Starting emulator container";
  }
  if (elapsedSeconds < 120) return "Starting ws-scrcpy sidecar";
  if (elapsedSeconds < 300) return "Waiting for ADB + emulator boot";
  return "Still starting — first boot can take several minutes";
}
