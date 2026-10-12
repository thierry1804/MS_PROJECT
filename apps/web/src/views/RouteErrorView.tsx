import { Link, useRouteError } from "react-router-dom";
import { describeRouteError } from "../utils/route-error";
import "../styles/error.css";

interface Props {
  /** Plein écran sans shell (erreur au niveau racine). */
  standalone?: boolean;
}

export function RouteErrorView({ standalone = false }: Props) {
  const error = useRouteError();
  const { title, message, detail } = describeRouteError(error);

  return (
    <div className={`error-page${standalone ? " error-page--standalone" : ""}`}>
      <div className="error-card" role="alert">
        <p className="error-kicker">Erreur</p>
        <h1 className="error-title">{title}</h1>
        <p className="error-message">{message}</p>

        <div className="error-actions">
          <Link to="/" className="error-btn error-btn--primary">
            Retour au portefeuille
          </Link>
          <button type="button" className="error-btn" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>

        {detail && (
          <details className="error-details">
            <summary>Détails techniques</summary>
            <pre>{detail}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
