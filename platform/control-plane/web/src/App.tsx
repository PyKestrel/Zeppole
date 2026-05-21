import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api, getToken, setToken } from "./api";
import { Shell } from "./layout/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { DevicesPage } from "./pages/DevicesPage";
import { EmulatorsPage } from "./pages/EmulatorsPage";
import { EmulatorImagesPage } from "./pages/EmulatorImagesPage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { UsersPage } from "./pages/UsersPage";
import { WebhooksPage } from "./pages/WebhooksPage";

type AuthState = "loading" | "anonymous" | "authenticated";

function SessionSpinner() {
  return (
    <div className="app-boot">
      <div className="app-boot__card">
        <div className="app-boot__logo" aria-hidden>
          Z
        </div>
        <div className="app-boot__spinner" aria-hidden />
        <p className="app-boot__text">Checking session…</p>
      </div>
    </div>
  );
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setAuthState("anonymous");
      return;
    }
    api("/auth/me")
      .then(() => setAuthState("authenticated"))
      .catch(() => {
        setToken(null);
        setAuthState("anonymous");
      });
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAuthState("anonymous");
  }, []);

  const onLoggedIn = useCallback(() => {
    setAuthState("authenticated");
  }, []);

  if (authState === "loading") {
    return <SessionSpinner />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          authState === "authenticated" ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onLoggedIn={onLoggedIn} />
          )
        }
      />
      <Route
        path="/"
        element={
          authState === "authenticated" ? <Shell onLogout={logout} /> : <Navigate to="/login" replace />
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectWorkspacePage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="emulators" element={<EmulatorsPage />} />
        <Route path="emulator-images" element={<EmulatorImagesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
      </Route>
    </Routes>
  );
}
