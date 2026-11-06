import "./Dashboard.css";
import { Clock3, FileText, User, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function Dashboard() {
  const { username } = useAuth();

  return (
    <div className="dashboard">
      <h1>Willkommen, {username}!</h1>

      <p className="welcome">Willkommen zurück, {username}!</p>

      <div className="cards">
        <Link to="/timetracking" className="card">
          <Clock3 size={20} />
          <h3>Zeiterfassung</h3>
          <p>Arbeitsbeginn und Arbeitsende erfassen.</p>
        </Link>

        <Link to="/reports" className="card">
          <FileText size={36} />
          <h3>Berichte</h3>
          <p>Tages-, Wochen- und Monatsberichte anzeigen.</p>
        </Link>

        <Link to="/users" className="card">
          <User size={36} />
          <h3>Benutzer</h3>
          <p>Benutzerinformationen verwalten.</p>
        </Link>

        <Link to="/settings" className="card">
          <Settings size={36} />
          <h3>Einstellungen</h3>
          <p>Programm individuell konfigurieren.</p>
        </Link>
      </div>
    </div>
  );
}

export default Dashboard;
