import { useEffect, useRef, useState } from "react";
import { BellIcon } from "./icons";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type WireNotification,
} from "../notifications-api";
import "../styles/notifications.css";

const POLL_MS = 25_000;

function describe(n: WireNotification): string {
  if (n.type === "project_access_granted") return `Accès accordé au projet "${n.projectName ?? n.projectId}".`;
  if (n.type === "project_access_revoked") return `Accès retiré au projet "${n.projectName ?? n.projectId}".`;
  return `Nouvel élément RAID assigné sur "${n.projectName ?? n.projectId}" (${n.raidItemLabel ?? ""}).`;
}

export function NotificationBell() {
  const [items, setItems] = useState<WireNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    setItems(await fetchNotifications());
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
      >
        <BellIcon />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                className="notif-mark-all"
                onClick={() => void markAllNotificationsRead().then(refresh)}
              >
                Tout marquer lu
              </button>
            )}
          </div>
          {items.length === 0 && <div className="notif-empty">Aucune notification.</div>}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`notif-item${n.read ? "" : " unread"}`}
              onClick={() => void markNotificationRead(n.id).then(refresh)}
            >
              <span className="notif-text">{describe(n)}</span>
              <span className="notif-time">{new Date(n.createdAt).toLocaleString("fr-FR")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
