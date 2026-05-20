import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmptyState, PageHeader, StatusBadge } from "../components/chrome";
import type { DeviceRow } from "../types";

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [name, setName] = useState("");
  const [tokenOut, setTokenOut] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<DeviceRow[]>("/devices").then(setDevices).catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function reg(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await api<{ apiToken: string }>("/devices", {
        method: "POST",
        json: { name },
      });
      setTokenOut(res.apiToken);
      setName("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Devices"
        subtitle="Register extra worker tokens when you attach more hosts. If you used npm run zeppole:up, a built-in worker is already provisioned — you can ignore this unless you add more agents."
        actions={
          <Link to="/emulators" className="btn btn--secondary btn--sm">
            Emulators
          </Link>
        }
      />

      <div className="layout-split">
        <section className="card card--elevated side-form">
          <h2 className="panel-heading">Register device</h2>
          <form onSubmit={(e) => void reg(e)}>
            <div className="field-group">
              <label htmlFor="device-name">Display name</label>
              <input
                id="device-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pixel lab · worker-1"
                required
              />
              <span className="field-hint">Shown in run dialogs and job listings.</span>
            </div>
            {err ? (
              <p className="field-error" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary btn--block">
              Create API token
            </button>
          </form>
          {tokenOut ? (
            <div className="secret-reveal callout callout--warn" role="status">
              <strong>Save this token once.</strong> It will not be shown again.
              <pre className="secret-reveal__code">{tokenOut}</pre>
            </div>
          ) : null}
        </section>

        <section className="card card--elevated flex-grow">
          <h2 className="panel-heading">Fleet</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="muted">{d.lastHeartbeat ? new Date(d.lastHeartbeat).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {devices.length === 0 ? (
            <EmptyState title="No devices" hint="Create a token and configure your worker with it." />
          ) : null}
        </section>
      </div>
    </div>
  );
}
