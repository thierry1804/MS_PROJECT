import { NavLink, Outlet } from "react-router-dom";
import { useStore, type SyncStatus } from "./store";

const SYNC_LABEL: Record<SyncStatus, string> = {
  loading: "Chargement…",
  saving: "Sauvegarde…",
  saved: "À jour",
  error: "Échec de sauvegarde",
  offline: "Hors ligne",
};

export function Shell() {
  const projects = useStore((s) => s.portfolio.projects);
  const syncStatus = useStore((s) => s.syncStatus);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          Atelier
          <small>Portefeuille DSI 2026</small>
        </div>

        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          Vue portefeuille
        </NavLink>
        <NavLink to="/demandes" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          Pipeline demandes
        </NavLink>
        <NavLink
          to="/ressources"
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          Charge ressources
        </NavLink>
        <NavLink to="/temps" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          Feuilles de temps
        </NavLink>
        <NavLink to="/raid" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          Registre RAID
        </NavLink>
        <NavLink to="/parametres" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          Paramètres
        </NavLink>

        <div className="sidebar-section">Projets</div>
        {projects.map((p) => (
          <NavLink
            key={p.id}
            to={`/projets/${p.id}`}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            {p.name}
            <span className="code">{p.code}</span>
          </NavLink>
        ))}

        <div className={`sync-status ${syncStatus}`}>
          <span className="sync-dot" />
          {SYNC_LABEL[syncStatus]}
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
