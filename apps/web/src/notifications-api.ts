import { apiUrl } from "./api-url";

export interface WireNotification {
  id: string;
  type: "project_access_granted" | "project_access_revoked" | "raid_assigned";
  projectId: string | null;
  projectName: string | null;
  raidKind: "risks" | "actions" | "issues" | null;
  raidItemId: string | null;
  raidItemLabel: string | null;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(): Promise<WireNotification[]> {
  const res = await fetch(apiUrl("/api/notifications"));
  if (!res.ok) return [];
  return (await res.json()) as WireNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetch(apiUrl(`/api/notifications/${id}/read`), { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch(apiUrl("/api/notifications/read-all"), { method: "POST" });
}
