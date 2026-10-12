import { useState, type FormEvent } from "react";
import { login } from "../auth";
import { LoginIllustration } from "../components/LoginIllustration";
import "../styles/login.css";

export function LoginView({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-illustration-pane">
        <LoginIllustration />
        <p className="login-tagline">Le chemin critique, visible d'un coup d'œil.</p>
      </div>
      <div className="login-form-pane">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-brand">
            <span className="login-mark" aria-hidden="true">A</span>
            <span>Atelier</span>
          </div>
          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="login-field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
