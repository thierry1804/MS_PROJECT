import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/base.css";
import { Shell } from "./Shell";
import { AuditLogView } from "./views/AuditLogView";
import { DashboardView } from "./views/DashboardView";
import { DemandView } from "./views/DemandView";
import { KpiView } from "./views/KpiView";
import { ProjectView } from "./views/ProjectView";
import { RaidView } from "./views/RaidView";
import { ReportView } from "./views/ReportView";
import { ResourcesView } from "./views/ResourcesView";
import { SettingsView } from "./views/SettingsView";
import { TimesheetView } from "./views/TimesheetView";

const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <DashboardView /> },
      { path: "/kpi", element: <KpiView /> },
      { path: "/demandes", element: <DemandView /> },
      { path: "/projets/:projectId", element: <ProjectView /> },
      { path: "/projets/:projectId/rapport", element: <ReportView /> },
      { path: "/ressources", element: <ResourcesView /> },
      { path: "/temps", element: <TimesheetView /> },
      { path: "/raid", element: <RaidView /> },
      { path: "/journal", element: <AuditLogView /> },
      { path: "/parametres", element: <SettingsView /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
