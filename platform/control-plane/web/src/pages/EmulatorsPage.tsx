import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmptyState, PageHeader, StatusBadge, Toast } from "../components/chrome";
import { deployPhaseLabel } from "../components/LiveStatusPanel";
import type { EmulatorImageBuild, EmulatorInstance } from "../types";

export function EmulatorsPage() {
  const [bridgeConfigured, setBridgeConfigured] = useState(false);
  const [kvmAvailable, setKvmAvailable] = useState(false);
  const [kvmDetail, setKvmDetail] = useState<string | null>(null);
  const [kvmError, setKvmError] = useState<string | null>(null);
  const [bridgeReachable, setBridgeReachable] = useState(true);
  const [list, setList] = useState<EmulatorInstance[]>([]);
  const [builtImages, setBuiltImages] = useState<EmulatorImageBuild[]>([]);
  const [toast, setToast] = useState<{ msg: string; variant: "success" | "error" } | null>(null);

  const [, setTick] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const [dockName, setDockName] = useState("Lab emulator");
  const [dockImage, setDockImage] = useState("");

  const [manName, setManName] = useState("External emulator");
  const [manDisplay, setManDisplay] = useState("");

  const load = useCallback((opts?: { silent?: boolean }) => {
    return api<{
      bridgeConfigured: boolean;
      kvmAvailable?: boolean;
      kvmDetail?: string;
      kvmError?: string;
      bridgeReachable?: boolean;
      emulators: EmulatorInstance[];
    }>("/emulators")
      .then((r) => {
        setBridgeConfigured(r.bridgeConfigured);
        setKvmAvailable(Boolean(r.kvmAvailable));
        setKvmDetail(r.kvmDetail ?? null);
        setKvmError(r.kvmError ?? null);
        setBridgeReachable(r.bridgeReachable !== false);
        setList(r.emulators);
        return r.emulators;
      })
      .catch((err: Error) => {
        if (!opts?.silent) {
          setToast({ msg: err.message || "Could not load emulators.", variant: "error" });
          window.setTimeout(() => setToast(null), 8000);
        }
        setBridgeConfigured(false);
        setKvmAvailable(false);
        setList([]);
        return [] as EmulatorInstance[];
      });
  }, []);

  function showToast(msg: string, variant: "success" | "error" = "success") {
    setToast({ msg, variant });
    window.setTimeout(() => setToast(null), 8000);
  }

  useEffect(() => {
    void load();
    api<{ builds: EmulatorImageBuild[] }>("/emulator-images/builds")
      .then((r) => setBuiltImages((r.builds ?? []).filter((b) => b.status === "SUCCEEDED")))
      .catch(() => setBuiltImages([]));
  }, [load]);

  const hasStarting = list.some((e) => e.status === "STARTING");

  useEffect(() => {
    if (!hasStarting) return;
    const id = window.setInterval(() => void load({ silent: true }), 2000);
    return () => clearInterval(id);
  }, [hasStarting, load]);

  useEffect(() => {
    if (!hasStarting) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [hasStarting]);

  function deployElapsedSeconds(emu: EmulatorInstance): number {
    const t = new Date(emu.updatedAt || emu.createdAt).getTime();
    return Math.max(0, Math.floor((Date.now() - t) / 1000));
  }

  async function deployDocker(e: FormEvent) {
    e.preventDefault();
    const image = dockImage.trim();
    if (!image) {
      showToast("Select or enter a Google aemu image tag.", "error");
      return;
    }
    setDeploying(true);
    try {
      await api("/emulators", {
        method: "POST",
        json: { mode: "docker", name: dockName, image },
      });
      showToast("Deploy started. ws-scrcpy sidecar will attach when the emulator is ready.");
      await load({ silent: true });
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setDeploying(false);
    }
  }

  async function registerManual(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/emulators", {
        method: "POST",
        json: { mode: "manual", name: manName, displayUrl: manDisplay },
      });
      showToast("Emulator bookmark saved.");
      setManDisplay("");
      load();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function stopEmu(id: string) {
    try {
      await api(`/emulators/${id}/stop`, { method: "POST" });
      showToast("Stop requested.");
      load();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function removeEmu(id: string) {
    if (!window.confirm("Remove this emulator from Zeppole?")) return;
    try {
      await api(`/emulators/${id}`, { method: "DELETE" });
      showToast("Removed.");
      load();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Android emulators"
        subtitle="Deploy Google aemu containers with ws-scrcpy for browser display and control, or bookmark an external ws-scrcpy URL."
        actions={
          <>
            <Link to="/emulator-images" className="btn btn--secondary btn--sm">
              Build images
            </Link>
            <Link to="/devices" className="btn btn--secondary btn--sm">
              Device tokens
            </Link>
          </>
        }
      />

      <Toast
        message={toast?.msg ?? null}
        variant={toast?.variant === "error" ? "error" : "success"}
        onDismiss={() => setToast(null)}
      />

      {!bridgeConfigured ? (
        <div className="callout callout--neutral" role="status">
          <strong>Docker deploy is disabled.</strong> Wire <code>ZEPPOLE_EMULATOR_BRIDGE_URL</code> or register a ws-scrcpy URL manually.
        </div>
      ) : !bridgeReachable ? (
        <div className="callout callout--warn" role="status">
          <strong>Cannot reach emulator-bridge.</strong> {kvmDetail ?? "Check that the bridge container is running."}
        </div>
      ) : hasStarting ? (
        <div className="callout callout--neutral" role="status">
          <strong>Deploy in progress.</strong> Starting emulator + ws-scrcpy sidecar (updates every 2s).
        </div>
      ) : kvmAvailable ? (
        <div className="callout callout--neutral" role="status">
          <strong>Docker bridge is active.</strong> Display links open ws-scrcpy on port 8000 — use <strong>proxy over adb</strong> for emulators.
        </div>
      ) : (
        <div className="callout callout--warn" role="status">
          <strong>KVM not detected.</strong> Google emulators need <code>/dev/kvm</code> on the Docker host.
          {kvmError ? <div className="small muted">{kvmError}</div> : null}
        </div>
      )}

      <div className="layout-split">
        <section className="card card--elevated side-form">
          <h2 className="panel-heading">Deploy (Docker)</h2>
          <p className="panel-lede muted small">
            Images from{" "}
            <Link to="/emulator-images">Emulator images</Link> (Google{" "}
            <a href="https://github.com/google/android-emulator-container-scripts" target="_blank" rel="noreferrer">
              android-emulator-container-scripts
            </a>
            ). Requires KVM on Linux.
          </p>
          <form onSubmit={(e) => void deployDocker(e)}>
            <div className="field-group">
              <label htmlFor="emu-dock-name">Label</label>
              <input id="emu-dock-name" value={dockName} onChange={(e) => setDockName(e.target.value)} required />
            </div>
            <div className="field-group">
              <label htmlFor="emu-dock-preset">Image</label>
              <select
                id="emu-dock-preset"
                value={(() => {
                  const found = builtImages.find((b) => b.dockerTag === dockImage);
                  if (found) return `built:${found.id}`;
                  return dockImage ? "custom" : "";
                })()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith("built:")) {
                    const build = builtImages.find((b) => b.id === val.slice(6));
                    if (build) setDockImage(build.dockerTag);
                    return;
                  }
                  if (val === "custom") return;
                  setDockImage("");
                }}
              >
                <option value="">Select a built image…</option>
                {builtImages.map((b) => (
                  <option key={`built:${b.id}`} value={`built:${b.id}`}>
                    {b.name} ({b.dockerTag})
                  </option>
                ))}
                <option value="custom">Custom tag…</option>
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="emu-dock-image">Docker tag</label>
              <input
                id="emu-dock-image"
                value={dockImage}
                onChange={(e) => setDockImage(e.target.value)}
                placeholder="zeppole-google:34-playstore"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={!bridgeConfigured || !kvmAvailable || deploying}
            >
              {deploying ? "Starting…" : "Start emulator pod"}
            </button>
          </form>

          <h2 className="panel-heading" style={{ marginTop: "1.75rem" }}>
            Register URL
          </h2>
          <p className="panel-lede muted small">Bookmark an external ws-scrcpy instance.</p>
          <form onSubmit={(e) => void registerManual(e)}>
            <div className="field-group">
              <label htmlFor="emu-man-name">Label</label>
              <input id="emu-man-name" value={manName} onChange={(e) => setManName(e.target.value)} required />
            </div>
            <div className="field-group">
              <label htmlFor="emu-man-display">ws-scrcpy URL</label>
              <input
                id="emu-man-display"
                type="url"
                value={manDisplay}
                onChange={(e) => setManDisplay(e.target.value)}
                placeholder="http://192.168.1.50:8000/"
                required
              />
            </div>
            <button type="submit" className="btn btn--primary btn--block">
              Save bookmark
            </button>
          </form>
        </section>

        <section className="card card--elevated flex-grow">
          <h2 className="panel-heading">Instances</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Status</th>
                  <th scope="col">Display</th>
                  <th scope="col" className="col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div>{e.name}</div>
                      {e.dockerImage ? <div className="table-sub muted">{e.dockerImage}</div> : null}
                      {e.errorMessage ? (
                        <div className="field-error small" style={{ marginTop: "0.35rem" }}>
                          {e.errorMessage}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <code className="key-chip">{e.mode}</code>
                    </td>
                    <td>
                      <StatusBadge status={e.status} />
                      {e.status === "STARTING" ? (
                        <div className="deploy-live-banner" role="status">
                          <span className="live-status__inline-pulse" aria-hidden />
                          {deployPhaseLabel(deployElapsedSeconds(e), e.dockerImage)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {e.displayUrl ? (
                        <a href={e.displayUrl} target="_blank" rel="noreferrer">
                          Open ws-scrcpy
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="col-actions">
                      {e.mode === "docker" && e.status === "RUNNING" && bridgeConfigured ? (
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void stopEmu(e.id)}>
                          Stop
                        </button>
                      ) : null}
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => void removeEmu(e.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length === 0 ? (
            <EmptyState
              title="No emulators yet"
              hint="Build an image on Emulator images, then deploy here."
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
