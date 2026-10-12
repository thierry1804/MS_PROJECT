import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DiceIcon, EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from "../components/icons";
import { getCurrentUser, type Role } from "../auth";
import { isDesktopShell } from "../api-url";
import {
  createUser,
  deleteUser,
  fetchProjectAccess,
  fetchUsers,
  setProjectAccess,
  updateUser,
  type WireUser,
} from "../users-api";
import { useStore } from "../store";
import "../styles/raid.css";
import "../styles/users.css";

export function UsersView() {
  const role = getCurrentUser().role;
  if (role !== "admin" || isDesktopShell()) {
    return (
      <>
        <div className="view-header">
          <h1>Utilisateurs</h1>
        </div>
        <div className="view-body">
          <p className="users-denied">
            {isDesktopShell()
              ? "La gestion des utilisateurs n'existe pas en mode desktop (application locale mono-utilisateur)."
              : "Accès réservé aux administrateurs."}
          </p>
        </div>
      </>
    );
  }
  return <UsersAdmin />;
}

type DrawerState = { mode: "create" } | { mode: "edit"; user: WireUser } | null;

const ONLINE_WINDOW_MS = 45_000; // heartbeat every 30s — two misses before "offline"

const KNOWN_PATH_LABELS: Record<string, string> = {
  "/": "Vue portefeuille",
  "/kpi": "Pilotage PMO",
  "/demandes": "Pipeline demandes",
  "/ressources": "Charge ressources",
  "/temps": "Feuilles de temps",
  "/raid": "Registre RAID",
  "/journal": "Journal d'activité",
  "/utilisateurs": "Utilisateurs",
  "/parametres": "Paramètres",
};

function describePath(path: string | null, projectsById: Map<string, { name: string; code: string }>): string {
  if (!path) return "—";
  if (KNOWN_PATH_LABELS[path]) return KNOWN_PATH_LABELS[path];
  const projectMatch = /^\/projets\/([^/]+)/.exec(path);
  const projectId = projectMatch?.[1];
  if (projectId) {
    const p = projectsById.get(projectId);
    const suffix = path.endsWith("/rapport") ? " · rapport" : "";
    return p ? `Projet ${p.name}${suffix}` : `Projet ${projectId}${suffix}`;
  }
  return path;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "jamais";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "à l'instant";
  const s = Math.floor(ms / 1000);
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

function UsersAdmin() {
  const allProjects = useStore((s) => s.portfolio.projects);
  const [users, setUsers] = useState<WireUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WireUser | null>(null);
  const [accessByUser, setAccessByUser] = useState<Record<string, string[]>>({});
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProjectId, setBulkProjectId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void refreshPresence(), 20_000);
    return () => clearInterval(timer);
  }, []);

  async function refreshPresence() {
    try {
      setUsers(await fetchUsers());
    } catch {
      // best-effort — a failed presence refresh must not surface as an error banner
    }
  }

  async function reload() {
    setLoading(true);
    try {
      const list = await fetchUsers();
      setUsers(list);
      const members = list.filter((u) => u.role === "member");
      const pairs = await Promise.all(members.map(async (u) => [u.id, await fetchProjectAccess(u.id)] as const));
      setAccessByUser(Object.fromEntries(pairs));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  const projectById = useMemo(() => new Map(allProjects.map((p) => [p.id, { name: p.name, code: p.code }])), [allProjects]);

  async function handleDelete(u: WireUser) {
    try {
      await deleteUser(u.id);
      setUsers((list) => list.filter((x) => x.id !== u.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
      setDeleteTarget(null);
    }
  }

  const members = users.filter((u) => u.role === "member");
  const selectedMemberIds = [...selectedIds].filter((id) => members.some((m) => m.id === id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllMembers() {
    setSelectedIds((prev) =>
      members.every((m) => prev.has(m.id)) ? new Set() : new Set(members.map((m) => m.id)),
    );
  }

  async function bulkApplyAccess(action: "grant" | "revoke") {
    if (!bulkProjectId || selectedMemberIds.length === 0) return;
    setBulkBusy(true);
    try {
      for (const id of selectedMemberIds) {
        const current = accessByUser[id] ?? [];
        const next =
          action === "grant"
            ? Array.from(new Set([...current, bulkProjectId]))
            : current.filter((pid) => pid !== bulkProjectId);
        await setProjectAccess(id, next);
        setAccessByUser((m) => ({ ...m, [id]: next }));
      }
      setError(null);
      setBulkProjectId("");
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mise à jour groupée impossible.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <div className="view-header">
        <h1>Utilisateurs</h1>
        <span className="sub">Comptes, rôles et accès par projet.</span>
      </div>

      <div className="view-body">
        <section className="res-manage">
          <div className="users-section-head">
            <h2>
              Comptes <span className="raid-count tnum">{users.length}</span>
            </h2>
            <button type="button" className="modal-btn primary" onClick={() => setDrawer({ mode: "create" })}>
              + Créer un utilisateur
            </button>
          </div>

          {error && <p className="users-error">{error}</p>}

          {selectedMemberIds.length > 0 && (
            <div className="users-bulk-bar">
              <span>{selectedMemberIds.length} membre(s) sélectionné(s)</span>
              <select value={bulkProjectId} onChange={(e) => setBulkProjectId(e.target.value)}>
                <option value="">Choisir un projet…</option>
                {allProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.code}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="modal-btn primary"
                disabled={!bulkProjectId || bulkBusy}
                onClick={() => void bulkApplyAccess("grant")}
              >
                Accorder
              </button>
              <button
                type="button"
                className="modal-btn ghost"
                disabled={!bulkProjectId || bulkBusy}
                onClick={() => void bulkApplyAccess("revoke")}
              >
                Retirer
              </button>
              <button type="button" className="drawer-icon-btn users-bulk-clear" onClick={() => setSelectedIds(new Set())}>
                ✕
              </button>
            </div>
          )}

          <table className="raid-table res-manage-table users-table">
            <thead>
              <tr>
                <th className="c">
                  <input
                    type="checkbox"
                    checked={members.length > 0 && members.every((m) => selectedIds.has(m.id))}
                    onChange={toggleSelectAllMembers}
                    aria-label="Sélectionner tous les membres"
                  />
                </th>
                <th>Email</th>
                <th>Nom</th>
                <th>Rôle</th>
                <th>Accès projets</th>
                <th>Activité</th>
                <th>Dernière connexion</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="muted">
                    Chargement…
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((u) => {
                  const grantedCount = accessByUser[u.id]?.length ?? 0;
                  const online = isOnline(u.lastSeenAt);
                  return (
                    <tr key={u.id}>
                      <td className="c">
                        {u.role === "member" && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(u.id)}
                            onChange={() => toggleSelected(u.id)}
                            aria-label={`Sélectionner ${u.email}`}
                          />
                        )}
                      </td>
                      <td>{u.email}</td>
                      <td>{u.name ?? <span className="muted">—</span>}</td>
                      <td>
                        <span className={`users-role-badge ${u.role}`}>{u.role === "admin" ? "Administrateur" : "Membre"}</span>
                      </td>
                      <td className="muted">
                        {u.role === "admin"
                          ? "Tous les projets"
                          : grantedCount === 0
                            ? "Aucun projet"
                            : `${grantedCount} projet${grantedCount > 1 ? "s" : ""}`}
                      </td>
                      <td>
                        <span className={`users-presence-dot${online ? " online" : ""}`} aria-hidden="true" />
                        <span className="users-presence-text">
                          {online ? describePath(u.lastSeenPath, projectById) : `Hors ligne · ${timeAgo(u.lastSeenAt)}`}
                        </span>
                        {online && u.lastSeenIp && <span className="users-ip muted">{u.lastSeenIp}</span>}
                      </td>
                      <td className="muted">
                        {u.lastLoginAt ? (
                          <>
                            {timeAgo(u.lastLoginAt)}
                            {u.lastLoginIp && <span className="users-ip">{u.lastLoginIp}</span>}
                          </>
                        ) : (
                          "Jamais connecté"
                        )}
                      </td>
                      <td className="c">
                        <button
                          className="raid-del"
                          onClick={() => setDrawer({ mode: "edit", user: u })}
                          title="Éditer l'utilisateur"
                          aria-label={`Éditer ${u.email}`}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          className="raid-del"
                          onClick={() => setDeleteTarget(u)}
                          title="Supprimer le compte"
                          aria-label={`Supprimer ${u.email}`}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    Aucun utilisateur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Supprimer le compte"
          message={`« ${deleteTarget.email} » sera supprimé définitivement et perdra tout accès à l'application.`}
          confirmLabel="Supprimer"
          danger
          onConfirm={() => void handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {drawer?.mode === "create" && (
        <UserDrawer
          mode="create"
          projects={allProjects}
          initialProjectIds={[]}
          onClose={() => setDrawer(null)}
          onSubmit={async (input) => {
            const created = await createUser({
              email: input.email,
              password: input.password,
              name: input.name || undefined,
              role: input.role,
            });
            setUsers((list) => [...list, created]);
            if (input.role === "member" && input.projectIds.length > 0) {
              await setProjectAccess(created.id, input.projectIds);
            }
            setAccessByUser((m) => ({ ...m, [created.id]: input.role === "member" ? input.projectIds : [] }));
          }}
        />
      )}

      {drawer?.mode === "edit" && (
        <UserDrawer
          mode="edit"
          email={drawer.user.email}
          projects={allProjects}
          initialName={drawer.user.name ?? ""}
          initialRole={drawer.user.role}
          initialProjectIds={accessByUser[drawer.user.id] ?? []}
          onClose={() => setDrawer(null)}
          onSubmit={async (input) => {
            const userId = drawer.user.id;
            const updated = await updateUser(userId, {
              name: input.name || undefined,
              role: input.role,
              password: input.password || undefined,
            });
            setUsers((list) => list.map((u) => (u.id === userId ? updated : u)));
            if (input.role === "member") {
              await setProjectAccess(userId, input.projectIds);
              setAccessByUser((m) => ({ ...m, [userId]: input.projectIds }));
            } else {
              setAccessByUser((m) => ({ ...m, [userId]: [] }));
            }
          }}
        />
      )}
    </>
  );
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

interface MiniProject {
  id: string;
  name: string;
  code: string;
}

interface UserDrawerSubmit {
  email: string;
  name: string;
  password: string;
  role: Role;
  projectIds: string[];
}

type UserDrawerProps = {
  projects: MiniProject[];
  initialProjectIds: string[];
  onClose: () => void;
  onSubmit: (input: UserDrawerSubmit) => Promise<void>;
} & (
  | { mode: "create" }
  | { mode: "edit"; email: string; initialName: string; initialRole: Role }
);

function UserDrawer(props: UserDrawerProps) {
  const { mode, projects, initialProjectIds, onClose, onSubmit } = props;
  const [email, setEmail] = useState(mode === "edit" ? props.email : "");
  const [name, setName] = useState(mode === "edit" ? props.initialName : "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>(mode === "edit" ? props.initialRole : "member");
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set(initialProjectIds));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleProject(id: string) {
    setProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSubmit = email.trim().length > 0 && (mode === "edit" || password.length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ email: email.trim(), name: name.trim(), password, role, projectIds: [...projectIds] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop drawer-backdrop" onClick={onClose}>
      <form className="drawer" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-head">
          <h2>{mode === "create" ? "Créer un utilisateur" : "Éditer l'utilisateur"}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body drawer-body">
          <div className="modal-row">
            <label className="modal-field">
              <span>Email</span>
              {mode === "create" ? (
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              ) : (
                <input type="email" value={email} disabled />
              )}
            </label>

            <label className="modal-field">
              <span>Nom <i className="drawer-optional">(optionnel)</i></span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={mode === "edit"} />
            </label>
          </div>
          <p className="drawer-hint">Le nom sert à repérer automatiquement les items RAID qui vous sont assignés.</p>

          <label className="modal-field">
            <span>{mode === "create" ? "Mot de passe" : "Nouveau mot de passe (laisser vide pour ne pas changer)"}</span>
            <div className="drawer-password-row">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={mode === "create"}
              />
              <button
                type="button"
                className="drawer-icon-btn"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
              <button
                type="button"
                className="drawer-icon-btn"
                onClick={() => {
                  setPassword(generatePassword());
                  setShowPassword(true);
                }}
                title="Générer un mot de passe"
                aria-label="Générer un mot de passe"
              >
                <DiceIcon />
              </button>
            </div>
          </label>

          <div className="drawer-group">
            <label className="modal-field">
              <span>Rôle</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="member">Membre</option>
                <option value="admin">Administrateur</option>
              </select>
            </label>

            {role === "member" && (
              <div className="modal-field">
                <span>Accès projets</span>
                {projects.length === 0 && <p className="users-empty-hint">Aucun projet dans le portefeuille.</p>}
                <div className="gate-checklist drawer-project-list">
                  {projects.map((p) => (
                    <label key={p.id} className="gate-check">
                      <input type="checkbox" checked={projectIds.has(p.id)} onChange={() => toggleProject(p.id)} />
                      {p.name} <span className="code">{p.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <p className="users-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">{role === "member" ? `${projectIds.size} projet(s) accordé(s)` : "Accès à tous les projets"}</span>
          <div className="modal-actions">
            <button type="button" className="modal-btn ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="modal-btn primary" disabled={!canSubmit || submitting}>
              {submitting ? "Enregistrement…" : mode === "create" ? "Créer" : "Enregistrer"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
