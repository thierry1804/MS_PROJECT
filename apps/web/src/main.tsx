import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/base.css";
import { Shell } from "./Shell";
import { appRoute } from "./routes";
import { fetchMe } from "./auth";
import { isDesktopShell } from "./api-url";
import { LoginView } from "./views/LoginView";
import { AuditLogView } from "./views/AuditLogView";
import { DashboardView } from "./views/DashboardView";
import { DemandView } from "./views/DemandView";
import { KpiView } from "./views/KpiView";
import { NotFoundView } from "./views/NotFoundView";
import { ProjectView } from "./views/ProjectView";
import { RaidView } from "./views/RaidView";
import { ReportView } from "./views/ReportView";
import { ResourcesView } from "./views/ResourcesView";
import { RouteErrorView } from "./views/RouteErrorView";
import { SettingsView } from "./views/SettingsView";
import { TimesheetView } from "./views/TimesheetView";
import { UsersView } from "./views/UsersView";

const router = createHashRouter([
  {
    element: <Shell />,
    errorElement: <RouteErrorView standalone />,
    children: [
      appRoute("/", <DashboardView />, { index: true }),
      appRoute("/kpi", <KpiView />),
      appRoute("/demandes", <DemandView />),
      appRoute("/projets/:projectId", <ProjectView />),
      appRoute("/projets/:projectId/rapport", <ReportView />),
      appRoute("/ressources", <ResourcesView />),
      appRoute("/temps", <TimesheetView />),
      appRoute("/raid", <RaidView />),
      appRoute("/journal", <AuditLogView />),
      appRoute("/utilisateurs", <UsersView />),
      appRoute("/parametres", <SettingsView />),
      { path: "*", element: <NotFoundView /> },
    ],
  },
]);

/**
 * Web mode requires a session cookie (see apps/api/src/auth.ts); desktop mode is a
 * local single-user app and skips the check entirely. A successful login reloads
 * the page so the store's startup fetch (apps/web/src/sync.ts) picks up the now
 * valid cookie — simpler than threading re-hydration through the store.
 */
function AuthGate() {
  const [status, setStatus] = useState<"checking" | "authed" | "anon">(
    isDesktopShell() ? "authed" : "checking",
  );

  useEffect(() => {
    if (isDesktopShell()) return;
    fetchMe()
      .then((user) => setStatus(user ? "authed" : "anon"))
      .catch(() => setStatus("anon"));
  }, []);

  if (status === "checking") return null;
  if (status === "anon") {
    return <LoginView onLoggedIn={() => window.location.reload()} />;
  }
  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
);
