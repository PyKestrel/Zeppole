import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmptyState, PageHeader, StatusBadge, Toast } from "../components/chrome";
import { deployPhaseLabel } from "../components/LiveStatusPanel";
import type { EmulatorImageBuild, EmulatorInstance } from "../types";

function appiumStatusUrl(serverUrl: string): string {
  const base = serverUrl.replace(/\/$/, "");
  return `${base}/status`;
}

function deployElapsedSeconds(emu: EmulatorInstance): number {
  const t = new Date(emu.updatedAt || emu.createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

/** Prebuilt / custom images; all use Google SDK system images + noVNC + Appium when started with bridge defaults. */
const IMAGE_PRESETS: { id: string; label: string; image: string }[] = [
  { id: "default", label: "Default (Android 14 / API 34)", image: "" },
  { id: "14", label: "budtmo emulator_14.0 (Google APIs)", image: "budtmo/docker-android:emulator_14.0" },
  { id: "13", label: "budtmo emulator_13.0 (Google APIs)", image: "budtmo/docker-android:emulator_13.0" },
  {
    id: "zeppole",
    label: "zeppole-emulator (built locally)",
    image: "zeppole-emulator:14.0-google-apis",
  },
];

export function EmulatorsPage() {
  const [bridgeConfigured, setBridgeConfigured] = useState(false);
  const [kvmAvailable, setKvmAvailable] = useState(false);
  const [kvmDetail, setKvmDetail] = useState<string | null>(null);
  const [kvmError, setKvmError] = useState<string | null>(null);
  const [bridgeReachable, setBridgeReachable] = useState(true);
  const [list, setList] = useState<EmulatorInstance[]>([]);
  const [toast, setToast] = useState<{ msg: string; variant: "success" | "error" } | null>(null);

  const [builtImages, setBuiltImages] = useState<EmulatorImageBuild[]>([]);
  const [, setTick] = useState(0);
  const [deploying, setDeploying] = useState(false);
  const [dockName, setDockName] = useState("Lab Pixel");
  const [dockDevice, setDockDevice] = useState("Samsung Galaxy S10");
  const [dockImage, setDockImage] = useState("");
  const [dockRuntime, setDockRuntime] = useState<"docker-android" | "google-aemu">("docker-android");

  const [manName, setManName] = useState("Proxmox emulator");
  const [manDisplay, setManDisplay] = useState("");
  const [manAppium, setManAppium] = useState("");

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
        setKvmDetail(null);
        setKvmError(null);
        setBridgeReachable(false);
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
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 2000);
    return () => clearInterval(id);
  }, [hasStarting, load]);

  useEffect(() => {
    if (!hasStarting) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [hasStarting]);

  function isGoogleImage(tag: string): boolean {
    return /zeppole-google|android-emulator-268719|google-emulator/i.test(tag);
  }

  async function deployDocker(e: FormEvent) {
    e.preventDefault();
    const image = dockImage.trim();
    const runtime =
      dockRuntime === "google-aemu" || (image && isGoogleImage(image)) ? "google-aemu" : "docker-android";
    setDeploying(true);
    try {
      await api("/emulators", {
        method: "POST",
        json: {
          mode: "docker",
          name: dockName,
          runtime,
          ...(runtime === "docker-android" ? { emulatorDevice: dockDevice } : {}),
          ...(image ? { image } : {}),
        },
      });
      showToast(
        "Deploy started. The instance list will update when the container is running (first pull can take several minutes).",
      );
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
        json: {
          mode: "manual",
          name: manName,
          displayUrl: manDisplay,
          ...(manAppium.trim() ? { appiumUrl: manAppium.trim() } : {}),
        },
      });
      showToast("Emulator bookmark saved.");
      setManDisplay("");
      setManAppium("");
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
    if (!window.confirm("Remove this emulator from Zeppole? Docker containers are stopped when the bridge is configured.")) return;
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
        subtitle="Deploy docker-android from the control plane (when the bridge is enabled) or save noVNC / Appium links. Use npm run zeppole:up for a fully wired stack without manual tokens."
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
          <strong>Docker deploy is disabled.</strong> The API is not wired to an emulator bridge (
          <code>ZEPPOLE_EMULATOR_BRIDGE_URL</code> / <code>ZEPPOLE_EMULATOR_BRIDGE_TOKEN</code>). You can still{" "}
          <strong>register</strong> running emulators below (paste noVNC and Appium URLs). See{" "}
          <code>platform/device-pool/emulator-bridge/README.md</code> to enable one-click deploy.
        </div>
      ) : !bridgeReachable ? (
        <div className="callout callout--warn" role="status">
          <strong>Cannot reach emulator-bridge.</strong> {kvmDetail ?? "Check that the bridge container is running."}
          {kvmError ? (
            <div className="small muted" style={{ marginTop: "0.5rem" }}>
              {kvmError}
            </div>
          ) : null}
        </div>
      ) : hasStarting ? (
        <div className="callout callout--neutral" role="status">
          <strong>Deploy in progress.</strong> Instance list refreshes every 2s until the container is running.
        </div>
      ) : kvmAvailable ? (
        <div className="callout callout--neutral" role="status">
          <strong>Docker bridge is active.</strong> {kvmDetail ? <span> {kvmDetail}</span> : null} New containers publish
          random host ports; open the display link from a browser that can reach{" "}
          <code>PUBLIC_HOST</code>.
        </div>
      ) : (
        <div className="callout callout--warn" role="status">
          <strong>KVM not detected for Docker deploy.</strong> {kvmDetail ?? "budtmo/docker-android needs /dev/kvm on the Docker host."}{" "}
          Rebuild and recreate <code>emulator-bridge</code> after pulling latest Zeppole. On your VM run:{" "}
          <code>ls -l /dev/kvm</code> and{" "}
          <code>docker compose ... up -d --build emulator-bridge api web</code>. Or use <strong>Register URLs</strong>.
          {kvmError ? (
            <div className="small muted" style={{ marginTop: "0.5rem" }}>
              Probe: {kvmError}
            </div>
          ) : null}
        </div>
      )}

      <div className="layout-split">
        <section className="card card--elevated side-form">
          <h2 className="panel-heading">Deploy (Docker)</h2>
          <p className="panel-lede muted small">
            Use <strong>budtmo/docker-android</strong> presets or images built on{" "}
            <Link to="/emulator-images">Emulator images</Link> (Google{" "}
            <a href="https://github.com/google/android-emulator-container-scripts" target="_blank" rel="noreferrer">
              android-emulator-container-scripts
            </a>
            , display <code>6080</code>, Appium <code>4723</code>). Requires KVM on Linux hosts.
          </p>
          <form onSubmit={(e) => void deployDocker(e)}>
            <div className="field-group">
              <label htmlFor="emu-dock-runtime">Runtime</label>
              <select
                id="emu-dock-runtime"
                value={dockRuntime}
                onChange={(e) => setDockRuntime(e.target.value as "docker-android" | "google-aemu")}
              >
                <option value="docker-android">docker-android (budtmo)</option>
                <option value="google-aemu">Google aemu (custom Zeppole build)</option>
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="emu-dock-name">Label</label>
              <input id="emu-dock-name" value={dockName} onChange={(e) => setDockName(e.target.value)} required />
            </div>
            {dockRuntime === "docker-android" ? (
              <div className="field-group">
                <label htmlFor="emu-dock-device">EMULATOR_DEVICE</label>
                <input
                  id="emu-dock-device"
                  value={dockDevice}
                  onChange={(e) => setDockDevice(e.target.value)}
                  placeholder="Samsung Galaxy S10"
                  required
                />
                <span className="field-hint">Must match a skin supported by your image.</span>
              </div>
            ) : null}
            <div className="field-group">
              <label htmlFor="emu-dock-preset">Image preset</label>
              <select
                id="emu-dock-preset"
                value={
                  IMAGE_PRESETS.find((p) => p.image === dockImage)?.id ??
                  (dockImage ? "custom" : "default")
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith("built:")) {
                    const build = builtImages.find((b) => b.id === val.slice(6));
                    if (build) {
                      setDockImage(build.dockerTag);
                      setDockRuntime("google-aemu");
                    }
                    return;
                  }
                  const preset = IMAGE_PRESETS.find((p) => p.id === val);
                  if (preset) {
                    setDockImage(preset.image);
                    setDockRuntime(preset.id === "zeppole" ? "google-aemu" : "docker-android");
                  }
                }}
              >
                {IMAGE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {builtImages.map((b) => (
                  <option key={`built:${b.id}`} value={`built:${b.id}`}>
                    Built: {b.name} ({b.dockerTag})
                  </option>
                ))}
                <option value="custom">Custom tag…</option>
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="emu-dock-image">Image tag (optional)</label>
              <input
                id="emu-dock-image"
                value={dockImage}
                onChange={(e) => setDockImage(e.target.value)}
                placeholder="budtmo/docker-android:emulator_14.0"
              />
              <span className="field-hint">
                Leave empty for bridge default. Google aemu: use a tag from{" "}
                <Link to="/emulator-images">Emulator images</Link>.
              </span>
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={!bridgeConfigured || !kvmAvailable || deploying}
            >
              {deploying ? "Starting…" : "Start container"}
            </button>
          </form>

          <h2 className="panel-heading" style={{ marginTop: "1.75rem" }}>
            Register URLs
          </h2>
          <p className="panel-lede muted small">Bookmark an emulator you already started (e.g. on Proxmox).</p>
          <form onSubmit={(e) => void registerManual(e)}>
            <div className="field-group">
              <label htmlFor="emu-man-name">Label</label>
              <input id="emu-man-name" value={manName} onChange={(e) => setManName(e.target.value)} required />
            </div>
            <div className="field-group">
              <label htmlFor="emu-man-display">noVNC URL</label>
              <input
                id="emu-man-display"
                type="url"
                value={manDisplay}
                onChange={(e) => setManDisplay(e.target.value)}
                placeholder="http://192.168.1.50:6080/?autoconnect=true"
                required
              />
            </div>
            <div className="field-group">
              <label htmlFor="emu-man-appium">Appium URL (optional)</label>
              <input
                id="emu-man-appium"
                type="url"
                value={manAppium}
                onChange={(e) => setManAppium(e.target.value)}
                placeholder="http://192.168.1.50:4723/"
              />
              <span className="field-hint">
                Server URL for test runners (not a web page). In a browser open <code>/status</code> on that host:port to verify.
              </span>
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
                  <th scope="col">Control</th>
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
                      {e.emulatorDevice ? (
                        <div className="table-sub muted">{e.emulatorDevice}</div>
                      ) : null}
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
                          Open display
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {e.appiumUrl ? (
                        <div className="small" style={{ marginTop: "0.25rem" }}>
                          <a href={appiumStatusUrl(e.appiumUrl)} target="_blank" rel="noreferrer" title={e.appiumUrl}>
                            Appium status
                          </a>
                          <div className="table-sub muted" title="Use in Appium / WebDriver clients">
                            {e.appiumUrl}
                          </div>
                        </div>
                      ) : null}
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
              hint="Deploy with Docker or register URLs for instances you manage manually."
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
