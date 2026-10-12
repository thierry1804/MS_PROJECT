import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CommandPalette } from "./components/CommandPalette";
import { CopilotPanel } from "./components/CopilotPanel";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DemandsNavIcon,
  JournalNavIcon,
  KpiNavIcon,
  MenuIcon,
  PortfolioNavIcon,
  RaidNavIcon,
  ResourcesNavIcon,
  SearchIcon,
  RedoIcon,
  SettingsNavIcon,
  TimeNavIcon,
  UndoIcon,
  UsersNavIcon,
} from "./components/icons";
import { NotificationBell } from "./components/NotificationBell";
import { useStore, type SyncStatus } from "./store";
import { dismissSyncConflict } from "./sync";
import { getCurrentUser, logout, sendHeartbeat, type Role } from "./auth";
import { isDesktopShell } from "./api-url";
import { portfolioSidebarLabel, type Health } from "./domain";
import "./styles/palette.css";

const SYNC_LABEL: Record<SyncStatus, string> = {
  loading: "Chargement…",
  saving: "Sauvegarde…",
  saved: "À jour",
  error: "Échec de sauvegarde",
  offline: "Hors ligne",
  syncing: "Sync cloud…",
  cloud_pending: "Cloud en attente",
  conflict_resolved: "Conflit résolu (LWW)",
  access_revoked: "Accès retiré — rechargement…",
};

const SIDEBAR_COLLAPSED_KEY = "atelier-sidebar-collapsed";
const COPILOT_OPEN_KEY = "atelier-copilot-open";

function readCopilotOpen(): boolean {
  try {
    return localStorage.getItem(COPILOT_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

interface NavItem {
  to: string;
  end?: boolean;
  label: string;
  icon: ReactNode;
  /** Hidden entirely for non-admins (role check, not just a UI nicety). */
  adminOnly?: boolean;
  /** Hidden for a member with zero granted projects — would just show empty data. */
  requiresProjects?: boolean;
  /** Desktop is a local single-user app with no User/role/notification tables (schema.sqlite.prisma) — hide entirely. */
  desktopHidden?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", end: true, label: "Vue portefeuille", icon: <PortfolioNavIcon />, requiresProjects: true },
  { to: "/kpi", label: "Pilotage PMO", icon: <KpiNavIcon />, requiresProjects: true },
  { to: "/demandes", label: "Pipeline demandes", icon: <DemandsNavIcon /> },
  { to: "/ressources", label: "Charge ressources", icon: <ResourcesNavIcon />, requiresProjects: true },
  { to: "/temps", label: "Feuilles de temps", icon: <TimeNavIcon />, requiresProjects: true },
  { to: "/raid", label: "Registre RAID", icon: <RaidNavIcon />, requiresProjects: true },
  { to: "/journal", label: "Journal d'activité", icon: <JournalNavIcon />, adminOnly: true },
  { to: "/utilisateurs", label: "Utilisateurs", icon: <UsersNavIcon />, adminOnly: true, desktopHidden: true },
  { to: "/parametres", label: "Paramètres", icon: <SettingsNavIcon /> },
];

/** Shared by Shell's sidebar and CommandPalette's jump-to-view list, so a hidden nav item never leaks as a command. */
export function visibleNavItems(role: Role, hasProjects: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.adminOnly && role !== "admin") return false;
    if (item.requiresProjects && role === "member" && !hasProjects) return false;
    if (item.desktopHidden && isDesktopShell()) return false;
    return true;
  });
}

const HEALTH_RANK: Record<Health, number> = { red: 0, amber: 1, green: 2 };

const KBD_HINT = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Shell() {
  const appName = useStore((s) => s.portfolio.appName ?? "Atelier");
  const portfolioName = useStore((s) => s.portfolio.name);
  const fiscalYear = useStore((s) => s.portfolio.fiscalYear);
  const portfolioSubtitle = portfolioSidebarLabel(portfolioName, fiscalYear);
  const projects = useStore((s) => s.portfolio.projects);
  const syncStatus = useStore((s) => s.syncStatus);
  const retrySync = useStore((s) => s.retrySync);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const [filter, setFilter] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [copilotOpen, setCopilotOpen] = useState(readCopilotOpen);
  const role = getCurrentUser().role;
  const hasProjects = projects.length > 0;
  const items = useMemo(() => visibleNavItems(role, hasProjects), [role, hasProjects]);

  function toggleCopilot() {
    setCopilotOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COPILOT_OPEN_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      // Let the browser's own undo run inside text fields — don't hijack native field undo.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    document.title = `${appName} — ${portfolioSubtitle}`;
  }, [appName, portfolioSubtitle]);

  const location = useLocation();
  useEffect(() => {
    if (isDesktopShell()) return;
    void sendHeartbeat(location.pathname);
    const timer = setInterval(() => void sendHeartbeat(location.pathname), 30_000);
    return () => clearInterval(timer);
  }, [location.pathname]);

  const appMonogram = appName.trim().charAt(0).toUpperCase() || "A";

  const filteredProjects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      : projects;
    return [...list].sort(
      (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name),
    );
  }, [projects, filter]);

  const sidebarClass = [
    "sidebar",
    sidebarOpen ? "open" : "",
    sidebarCollapsed ? "collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="shell">
      <div
        className={`sidebar-scrim${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={sidebarClass}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-text">
            <span className="sidebar-mark" aria-hidden="true">
              {appMonogram}
            </span>
            <span className="sidebar-title">{appName}</span>
            <small>{portfolioSubtitle}</small>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleSidebarCollapsed}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Développer le menu" : "Réduire le menu"}
            title={sidebarCollapsed ? "Développer le menu" : "Réduire le menu"}
          >
            {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>

        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            title={item.label}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
        {role === "member" && !hasProjects && (
          <div className="sidebar-empty">Aucun projet ne vous a été attribué — contactez un administrateur.</div>
        )}

        {hasProjects && (
          <>
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

            <button
              type="button"
              className="sidebar-palette-btn"
              onClick={() => setPaletteOpen(true)}
              title={`Rechercher un projet (${KBD_HINT})`}
              aria-label="Ouvrir la palette de commandes"
            >
              <SearchIcon />
            </button>

            {filteredProjects.map((p) => (
              <NavLink
                key={p.id}
                to={`/projets/${p.id}`}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `nav-item nav-item-project${isActive ? " active" : ""}`}
                title={`${p.name} (${p.code})`}
              >
                <span className={`health-dot health-${p.health}`} />
                <span className="nav-label">{p.name}</span>
                <span className="code">{p.code}</span>
              </NavLink>
            ))}
            {filteredProjects.length === 0 && <div className="sidebar-empty">Aucun projet.</div>}
          </>
        )}

        <div className={`sync-status ${syncStatus}`} title={SYNC_LABEL[syncStatus]}>
          <span className="sync-dot" />
          <span className="sync-label">{SYNC_LABEL[syncStatus]}</span>
          {syncStatus === "error" && (
            <button className="sync-retry" onClick={() => retrySync()}>
              Réessayer
            </button>
          )}
          {syncStatus === "conflict_resolved" && (
            <button
              className="sync-retry"
              onClick={() => void dismissSyncConflict().then(() => useStore.setState({ syncStatus: "saved" }))}
            >
              OK
            </button>
          )}
        </div>
        {!isDesktopShell() && (
          <button
            type="button"
            className="nav-item"
            onClick={() => void logout().then(() => window.location.reload())}
            title="Se déconnecter"
          >
            <span className="nav-label">Déconnexion</span>
          </button>
        )}
      </aside>
      <div className="shell-body">
        <main className="main">
          <div className="main-head">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <MenuIcon />
            </button>
            <div className="undo-redo-group">
              <button
                type="button"
                className="undo-redo-btn"
                onClick={undo}
                disabled={!canUndo}
                title="Annuler (Ctrl+Z)"
                aria-label="Annuler"
              >
                <UndoIcon />
              </button>
              <button
                type="button"
                className="undo-redo-btn"
                onClick={redo}
                disabled={!canRedo}
                title="Rétablir (Ctrl+Maj+Z)"
                aria-label="Rétablir"
              >
                <RedoIcon />
              </button>
            </div>
            <button type="button" className="copilot-toggle" onClick={toggleCopilot}>
              Copilot
            </button>
            {!isDesktopShell() && <NotificationBell />}
          </div>
          <div className="main-content">
            <Outlet />
          </div>
        </main>
        {copilotOpen && <CopilotPanel onClose={toggleCopilot} />}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
