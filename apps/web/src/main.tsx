import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/base.css";
import { Shell } from "./Shell";
import { appRoute } from "./routes";
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
      appRoute("/parametres", <SettingsView />),
      { path: "*", element: <NotFoundView /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
