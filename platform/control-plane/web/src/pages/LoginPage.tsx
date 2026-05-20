import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bootstrapNeeded, setBootstrapNeeded] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ bootstrapNeeded: boolean }>("/meta/bootstrap-needed")
      .then((r) => setBootstrapNeeded(r.bootstrapNeeded))
      .catch(() => setBootstrapNeeded(false));
  }, []);

  async function submit(mode: "login" | "bootstrap") {
    setError(null);
    try {
      if (mode === "bootstrap") {
        const res = await api<{ token: string }>("/auth/bootstrap", {
          method: "POST",
          json: { email, password, name: "Admin" },
        });
        setToken(res.token);
        onLoggedIn();
        navigate("/");
        return;
      }
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        json: { email, password },
      });
      setToken(res.token);
      onLoggedIn();
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function clearBrowserSession() {
    setToken(null);
    window.location.reload();
  }

  const setupMode = bootstrapNeeded === true;
  const loadingMeta = bootstrapNeeded === null;

  return (
    <div className="login-screen login-screen--light">
      <div className="login-screen__pattern" aria-hidden />
      <div className="login-panel card card--elevated">
        <div className="login-panel__brand">
          <div className="brand-mark" aria-hidden>
            Z
          </div>
          <div>
            <h1 className="login-panel__title">{setupMode ? "Create your workspace" : "Sign in"}</h1>
            <p className="login-panel__subtitle">
              {setupMode
                ? "Add the first administrator for this Zeppole deployment."
                : "Zeppole · Android test management"}
            </p>
          </div>
        </div>

        {loadingMeta ? (
          <p className="login-panel__lede muted">Checking server setup…</p>
        ) : setupMode ? (
          <p className="login-panel__lede">
            No users exist in the database yet. Create an admin account below — you can invite more users later from{" "}
            <strong>Administration</strong>.
          </p>
        ) : (
          <p className="login-panel__lede muted">
            Use your Zeppole credentials. If you expected a first-time setup prompt but see this screen instead, users
            already exist (for example from a prior run or optional database seed).
          </p>
        )}

        {!setupMode && bootstrapNeeded === false ? (
          <div className="callout callout--neutral" role="note">
            <strong>No admin prompt?</strong> Either you already completed setup, or an admin was created automatically
            (e.g. optional seed). Try signing in with that account, or reset the database volume for a clean bootstrap.
          </div>
        ) : null}

        <div className="field-group">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="you@company.com"
            disabled={loadingMeta}
          />
        </div>
        <div className="field-group">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={setupMode ? "new-password" : "current-password"}
            disabled={loadingMeta}
          />
          {setupMode ? (
            <span className="field-hint">At least 8 characters.</span>
          ) : null}
        </div>

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="btn-row btn-row--stack">
          {setupMode ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={loadingMeta}
                onClick={() => void submit("bootstrap")}
              >
                Create administrator
              </button>
              <p className="login-panel__fineprint muted">
                After this account exists, use <strong>Sign in</strong> on future visits (same page).
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={loadingMeta}
                onClick={() => void submit("login")}
              >
                Sign in
              </button>
            </>
          )}
        </div>

        <p className="login-panel__footnote muted">
          {!setupMode && !loadingMeta ? (
            <>
              Went straight to the dashboard? Your browser may still hold a session token — use{" "}
              <strong>Sign out</strong> in the sidebar, or{" "}
              <button type="button" className="link-button" onClick={clearBrowserSession}>
                clear browser session
              </button>{" "}
              after a database reset.
            </>
          ) : null}{" "}
          OpenAPI: <code>/api/docs</code> on the API host.
        </p>
      </div>
    </div>
  );
}
