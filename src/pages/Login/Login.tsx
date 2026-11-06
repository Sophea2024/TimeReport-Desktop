import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { useAuth } from "../../context/AuthContext";
import { login as loginService } from "../../Services/auth/authService";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    try {
      const user = await loginService(username, password);
      console.log(
        "Login-Ergebnis:",
        user
          ? "Benutzer gefunden und authentifiziert"
          : "Anmeldung fehlgeschlagen",
      );
      if (user) {
        login(user);
        navigate("/", { replace: true });
      } else {
        setError("Benutzername oder Passwort ist falsch.");
      }
    } catch (error) {
      console.error("Login fehlgeschlagen:", error);

      setError("Beim Anmelden ist ein Fehler aufgetreten.");
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>TimeReport Desktop</h1>
        <p>Bitte melden Sie sich an.</p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Benutzername</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Benutzername"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit">Anmelden</button>
        </form>
      </div>
    </div>
  );
}

export default Login;
