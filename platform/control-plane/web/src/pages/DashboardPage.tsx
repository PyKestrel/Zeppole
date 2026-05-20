import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/chrome";
import type { DeviceRow, Project } from "../types";

export function DashboardPage() {
  const [stats, setStats] = useState<{ projects: number; devices: number; online: number } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    Promise.all([
      api<Project[]>("/projects"),
      api<DeviceRow[]>("/devices"),
    ])
      .then(([projects, devices]) => {
        const online = devices.filter((d) => d.status.toUpperCase() === "ONLINE").length;
        setStats({
          projects: projects.length,
          devices: devices.length,
          online,
        });
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your Zeppole workspace — projects, devices, and execution readiness."
      />

      {err ? <p className="field-error">{err}</p> : null}

      <div className="stat-grid">
        <Link to="/projects" className="stat-card">
          <span className="stat-card__label">Projects</span>
          <span className="stat-card__value">{stats?.projects ?? "—"}</span>
          <span className="stat-card__hint">Test repositories & cycles</span>
        </Link>
        <Link to="/devices" className="stat-card">
          <span className="stat-card__label">Registered devices</span>
          <span className="stat-card__value">{stats?.devices ?? "—"}</span>
          <span className="stat-card__hint">Workers / emulators</span>
        </Link>
        <div className="stat-card stat-card--static">
          <span className="stat-card__label">Devices online</span>
          <span className="stat-card__value">{stats?.online ?? "—"}</span>
          <span className="stat-card__hint">Recent heartbeat</span>
        </div>
      </div>

      <div className="panel-grid">
        <section className="card card--elevated">
          <h2 className="panel-heading">Quick start</h2>
          <ol className="steps-list">
            <li>
              <strong>Create or open a project</strong> and define structured test cases or import from QMetry /
              Jira.
            </li>
            <li>
              <strong>Build a test cycle</strong> and attach cases in the order you want executed.
            </li>
            <li>
              <strong>Register device tokens</strong> for execution workers, then run the cycle against one or more
              targets.
            </li>
          </ol>
        </section>
        <section className="card card--elevated">
          <h2 className="panel-heading">Operators</h2>
          <ul className="link-list">
            <li>
              <Link to="/projects">Go to projects →</Link>
            </li>
            <li>
              <Link to="/devices">Manage devices →</Link>
            </li>
            <li>
              <span className="muted">
                OpenAPI &amp; REST: same host as this app at <code>/api/v1</code> (via reverse proxy).
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
