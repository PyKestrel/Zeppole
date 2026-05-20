import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmptyState, PageHeader, StatusBadge, Toast } from "../components/chrome";
import type { EmulatorInstance } from "../types";

export function EmulatorsPage() {
  const [bridgeConfigured, setBridgeConfigured] = useState(false);
  const [kvmAvailable, setKvmAvailable] = useState(false);
  const [list, setList] = useState<EmulatorInstance[]>([]);
  const [toast, setToast] = useState<{ msg: string; variant: "success" | "error" } | null>(null);

  const [deploying, setDeploying] = useState(false);
  const [dockName, setDockName] = useState("Lab Pixel");
  const [dockDevice, setDockDevice] = useState("Samsung Galaxy S10");
  const [dockImage, setDockImage] = useState("");

  const [manName, setManName] = useState("Proxmox emulator");
  const [manDisplay, setManDisplay] = useState("");
  const [manAppium, setManAppium] = useState("");

  const load = useCallback((opts?: { silent?: boolean }) => {
    return api<{ bridgeConfigured: boolean; kvmAvailable?: boolean; emulators: EmulatorInstance[] }>(
      "/emulators",
    )
      .then((r) => {
        setBridgeConfigured(r.bridgeConfigured);
        setKvmAvailable(Boolean(r.kvmAvailable));
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
  }, [load]);

  useEffect(() => {
    if (!list.some((e) => e.status === "STARTING")) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 3000);
    return () => clearInterval(id);
  }, [list, load]);

  async function deployDocker(e: FormEvent) {
    e.preventDefault();
    setDeploying(true);
    try {
      await api("/emulators", {
        method: "POST",
        json: {
          mode: "docker",
          name: dockName,
          emulatorDevice: dockDevice,
          ...(dockImage.trim() ? { image: dockImage.trim() } : {}),
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
          <Link to="/devices" className="btn btn--secondary btn--sm">
            Device tokens
          </Link>
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
      ) : kvmAvailable ? (
        <div className="callout callout--neutral" role="status">
          <strong>Docker bridge is active.</strong> New containers publish random host ports; open the display link from
          a browser that can reach the host configured for the bridge (<code>PUBLIC_HOST</code>).
        </div>
      ) : (
        <div className="callout callout--warn" role="status">
          <strong>KVM not detected for Docker deploy.</strong> budtmo/docker-android needs <code>/dev/kvm</code> on the
          machine where <strong>Docker</strong> runs (the emulator-bridge talks to that daemon). If your VM has KVM, run
          Zeppole there and add <code>docker-compose.kvm.yml</code> to your compose command, or use{" "}
          <strong>Register URLs</strong> for an emulator you start elsewhere.
        </div>
      )}

      <div className="layout-split">
        <section className="card card--elevated side-form">
          <h2 className="panel-heading">Deploy (Docker)</h2>
          <p className="panel-lede muted small">
            Runs a <code>docker-android</code>-style image with <code>WEB_VNC</code> and <code>APPIUM=true</code>. Requires
            KVM on Linux hosts.
          </p>
          <form onSubmit={(e) => void deployDocker(e)}>
            <div className="field-group">
              <label htmlFor="emu-dock-name">Label</label>
              <input id="emu-dock-name" value={dockName} onChange={(e) => setDockName(e.target.value)} required />
            </div>
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
            <div className="field-group">
              <label htmlFor="emu-dock-image">Image (optional)</label>
              <input
                id="emu-dock-image"
                value={dockImage}
                onChange={(e) => setDockImage(e.target.value)}
                placeholder="budtmo/docker-android:emulator_11.0"
              />
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
                          <a href={e.appiumUrl} target="_blank" rel="noreferrer">
                            Appium
                          </a>
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
