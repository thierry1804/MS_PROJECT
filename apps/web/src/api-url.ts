/** Sidecar API spawned by the Tauri shell (see apps/desktop/src-tauri/src/lib.rs). */
export const DESKTOP_API_ORIGIN = "http://127.0.0.1:8888";

/** True when the UI runs inside the Tauri desktop shell. */
export function isDesktopShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(import.meta.env.TAURI_ENV_PLATFORM) || "__TAURI__" in window;
}

/**
 * Packaged desktop serves static assets — no Vite proxy.
 * Tauri dev still uses localhost:5173 + proxy, so keep relative paths there.
 */
export function needsDirectApiOrigin(): boolean {
  return isDesktopShell() && import.meta.env.PROD;
}

/** Resolve an API path for web (relative + Vite proxy) or packaged desktop (sidecar URL). */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return needsDirectApiOrigin() ? `${DESKTOP_API_ORIGIN}${normalized}` : normalized;
}
