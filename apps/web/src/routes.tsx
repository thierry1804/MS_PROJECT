import type { ReactNode } from "react";
import { RouteErrorView } from "./views/RouteErrorView";

/** Associe une vue à la page d'erreur Atelier (dans le shell). */
export function appRoute(path: string, element: ReactNode, opts?: { index?: boolean }) {
  const errorElement = <RouteErrorView />;
  if (opts?.index) return { index: true as const, element, errorElement };
  return { path, element, errorElement };
}
