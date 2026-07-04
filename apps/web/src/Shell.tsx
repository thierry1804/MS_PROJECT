import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CommandPalette } from "./components/CommandPalette";
import { MenuIcon, SearchIcon } from "./components/icons";
import { useStore, type SyncStatus } from "./store";
import type { Health } from "./domain";
import "./styles/palette.css";

const SYNC_LABEL: Record<SyncStatus, string> = {
  loading: "Chargement…",
  saving: "Sauvegarde…",
  saved: "À jour",
  error: "Échec de sauvegarde",
  offline: "Hors ligne",
};

export const NAV_ITEMS: { to: string; end?: boolean; label: string }[] = [
  { to: "/", end: true, label: "Vue portefeuille" },
  { to: "/demandes", label: "Pipeline demandes" },
  { to: "/ressources", label: "Charge ressources" },
  { to: "/temps", label: "Feuilles de temps" },
  { to: "/raid", label: "Registre RAID" },
  { to: "/journal", label: "Journal d'activité" },
  { to: "/parametres", label: "Paramètres" },
];

const HEALTH_RANK: Record<Health, number> = { red: 0, amber: 1, green: 2 };

const KBD_HINT = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";

export function Shell() {
  const projects = useStore((s) => s.portfolio.projects);
  const syncStatus = useStore((s) => s.syncStatus);
  const retrySync = useStore((s) => s.retrySync);
  const [filter, setFilter] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredProjects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      : projects;
    return [...list].sort(
      (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name),
    );
  }, [projects, filter]);

  return (
    <div className="shell">
      <div
        className={`sidebar-scrim${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          Atelier
          <small>Portefeuille DSI 2026</small>
        </div>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}

        <div className="sidebar-section-head">
          <div className="sidebar-section">Projets</div>
          <label className="sidebar-search">
            <SearchIcon />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer les projets…"
              aria-label="Filtrer les projets"
            />
            <button
              type="button"
              className="sidebar-kbd"
              onClick={() => setPaletteOpen(true)}
              title="Aller à une vue ou un projet"
              aria-label="Ouvrir la palette de commandes"
            >
              {KBD_HINT}
            </button>
          </label>
        </div>
        {filteredProjects.map((p) => (
          <NavLink
            key={p.id}
            to={`/projets/${p.id}`}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <span className={`health-dot health-${p.health}`} />
            {p.name}
            <span className="code">{p.code}</span>
          </NavLink>
        ))}
        {filteredProjects.length === 0 && <div className="sidebar-empty">Aucun projet.</div>}

        <div className={`sync-status ${syncStatus}`}>
          <span className="sync-dot" />
          {SYNC_LABEL[syncStatus]}
          {syncStatus === "error" && (
            <button className="sync-retry" onClick={() => retrySync()}>
              Réessayer
            </button>
          )}
        </div>
      </aside>
      <main className="main">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <MenuIcon />
        </button>
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
