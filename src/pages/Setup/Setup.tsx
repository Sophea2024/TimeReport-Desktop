import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Setup.css";

function Setup() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (username.trim().length < 3) {
      setError("Der Benutzername muss mindestens 3 Zeichen haben.");
      return;
    }

    if (!displayName.trim()) {
      setError("Bitte geben Sie Ihren Anzeigenamen ein.");
      return;
    }

    if (password.length < 12) {
      setError("Das Passwort muss mindestens 12 Zeichen haben.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);

    try {
      await window.database.createInitialAdmin({
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      });

      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Registrierung fehlgeschlagen:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Die Registrierung ist fehlgeschlagen.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>TimeReport Desktop</h1>
        <p>Willkommen! Erstellen Sie Ihren Administrator-Zugang.</p>

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label htmlFor="username">Benutzername</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={50}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="displayName">Anzeigename</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Passwort (mindestens 12 Zeichen)</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Passwort bestätigen</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Registrierung läuft..." : "Administrator erstellen"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Setup;
