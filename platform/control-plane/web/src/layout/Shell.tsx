import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../api";
import type { User } from "../types";
import { IconCpu, IconDashboard, IconFolder, IconSmartphone, IconUsers, IconWebhook } from "../components/Icons";

export function Shell({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((r) => setMe(r.user))
      .catch(() => setMe(null));
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand">
          <div className="brand-mark" aria-hidden>
            Z
          </div>
          <div>
            <div className="sidebar__product">Zeppole</div>
            <div className="sidebar__tagline">Test management</div>
          </div>
        </div>

        <div className="sidebar__section-label">Workspace</div>
        <nav className="sidebar__nav">
          <NavLink className="sidebar__link" to="/" end>
            <IconDashboard />
            <span>Dashboard</span>
          </NavLink>
          <NavLink className="sidebar__link" to="/projects">
            <IconFolder />
            <span>Projects</span>
          </NavLink>
          <NavLink className="sidebar__link" to="/devices">
            <IconCpu />
            <span>Devices</span>
          </NavLink>
          <NavLink className="sidebar__link" to="/emulators">
            <IconSmartphone />
            <span>Emulators</span>
          </NavLink>
        </nav>

        {me?.role === "ADMIN" ? (
          <>
            <div className="sidebar__section-label">Administration</div>
            <nav className="sidebar__nav">
              <NavLink className="sidebar__link" to="/users">
                <IconUsers />
                <span>Users</span>
              </NavLink>
              <NavLink className="sidebar__link" to="/webhooks">
                <IconWebhook />
                <span>Webhooks</span>
              </NavLink>
            </nav>
          </>
        ) : null}

        <div className="sidebar__support">
          <strong>Need support?</strong>
          See deployment docs in the repo and OpenAPI at <code>/api/docs</code>.
        </div>

        <div className="sidebar__footer">
          {me ? (
            <>
              <div className="sidebar__user-email" title={me.email}>
                {me.email}
              </div>
              <span className="sidebar__role-pill">{me.role.replace(/_/g, " ")}</span>
              <button type="button" className="sidebar__signout" onClick={onLogout}>
                Sign out
              </button>
            </>
          ) : (
            <span className="sidebar__muted">Loading profile…</span>
          )}
        </div>
      </aside>

      <div className="shell__main">
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
