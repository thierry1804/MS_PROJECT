import { Link } from "react-router-dom";
import "../styles/error.css";

export function NotFoundView() {
  return (
    <div className="error-page">
      <div className="error-card">
        <p className="error-kicker tnum">404</p>
        <h1 className="error-title">Page introuvable</h1>
        <p className="error-message">
          Cette adresse ne correspond à aucune vue de l'application. Vérifiez l'URL ou reprenez depuis le
          portefeuille.
        </p>

        <div className="error-actions">
          <Link to="/" className="error-btn error-btn--primary">
            Retour au portefeuille
          </Link>
        </div>
      </div>
    </div>
  );
}
