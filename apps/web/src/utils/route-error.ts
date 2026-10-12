import { isRouteErrorResponse } from "react-router-dom";

export interface RouteErrorCopy {
  title: string;
  message: string;
  detail?: string;
}

export function describeRouteError(error: unknown): RouteErrorCopy {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        title: "Page introuvable",
        message: "Cette adresse ne correspond à aucune vue de l'application.",
        detail: error.statusText || undefined,
      };
    }
    return {
      title: `Erreur ${error.status}`,
      message: error.statusText || "La requête n'a pas abouti.",
      detail: typeof error.data === "string" ? error.data : error.data ? JSON.stringify(error.data, null, 2) : undefined,
    };
  }

  if (error instanceof Error) {
    const hooks = /hooks than during the previous render/i.test(error.message);
    return {
      title: hooks ? "Affichage interrompu" : "Une erreur est survenue",
      message: hooks
        ? "Cette page n'a pas pu s'afficher correctement. Rechargez la page ou revenez au portefeuille."
        : "Un problème inattendu s'est produit. Vous pouvez réessayer ou reprendre depuis le portefeuille.",
      detail: import.meta.env.DEV ? error.stack ?? error.message : error.message,
    };
  }

  return {
    title: "Une erreur est survenue",
    message: "Un problème inattendu s'est produit. Vous pouvez réessayer ou reprendre depuis le portefeuille.",
    detail: import.meta.env.DEV ? String(error) : undefined,
  };
}
