import "./Header.css";
import { useAuth } from "../../context/AuthContext";

function Header() {
  const { username } = useAuth();
  const today = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="header">
      <div>
        <h2>TimeReport Desktop</h2>
      </div>

      <div className="header-right">
        <span>{today}</span>

        <div className="user">
          👤 {username || "Gast"}
        </div>
      </div>
    </header>
  );
}

export default Header;