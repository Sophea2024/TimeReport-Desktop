import "./Sidebar.css";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useState } from "react";

import {
  LayoutDashboard,
  Clock3,
  FileText,
  Settings,
  Users,
  CalendarClock,
  Palmtree,
  LogOut,
  DatabaseBackup,
  Import,
  ChevronDown,
  CalendarDays,
  CalendarRange,
  Calendar,
} from "lucide-react";

function Sidebar() {
  const Navigate = useNavigate();
  const { username, user, logout } = useAuth();

  const [reportsOpen, setReportsOpen] = useState(true);

  function handleLogout() {
    logout();
    Navigate("/login");
  }

  async function handleDatabaseBackup() {
    try {
      const result = await window.ipcRenderer.invoke("backup-database");

      if (result.success) {
        alert(result.message);
      } else {
        alert(`Fehler: ${result.message}`);
      }
    } catch (error) {
      console.error("Backup-Fehler:", error);
      alert("Das Datenbank-Backup konnte nicht erstellt werden.");
    }
  }

  async function handleRestoreDatabase() {
    const result = await window.ipcRenderer.invoke("restore-database");

    if (!result?.success && result?.message) {
      alert(result.message);
    }
  }

  return (
    <aside className="sidebar">
      <div className="logo">
        <h2>
          Time<span>Report</span>
        </h2>

        <small>Arbeitszeit Management</small>
      </div>

      <nav className="menu">
        {/* =========================
            DASHBOARD
        ========================= */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          <LayoutDashboard size={21} />
          <span>Dashboard</span>
        </NavLink>

        {/* =========================
            ZEITERFASSUNG
        ========================= */}
        <NavLink
          to="/timetracking"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          <Clock3 size={21} />
          <span>Zeiterfassung</span>
        </NavLink>

        {/* =========================
            BERICHTE
        ========================= */}
        <div className="reports-menu">
          <button
            type="button"
            className="nav-link reports-toggle"
            onClick={() => setReportsOpen((open) => !open)}
          >
            <FileText size={21} />

            <span>Berichte</span>

            <ChevronDown
              size={18}
              className={
                reportsOpen
                  ? "reports-chevron reports-chevron-open"
                  : "reports-chevron"
              }
            />
          </button>

          {reportsOpen && (
            <div className="submenu">
              <button
                type="button"
                className="submenu-link"
                onClick={() => Navigate("/reports/daily")}
              >
                <CalendarDays size={17} />
                <span>Tagesbericht</span>
              </button>

              <button
                type="button"
                className="submenu-link"
                onClick={() => Navigate("/reports/weekly")}
              >
                <CalendarRange size={17} />
                <span>Wochenbericht</span>
              </button>

              <button
                type="button"
                className="submenu-link"
                onClick={() => Navigate("/reports/monthly")}
              >
                <Calendar size={17} />
                <span>Monatsbericht</span>
              </button>

              <button
                type="button"
                className="submenu-link"
                onClick={() => Navigate("/reports/yearly")}
              >
                <Calendar size={17} />
                <span>Jahresbericht</span>
              </button>

              <button
                type="button"
                className="submenu-link"
                onClick={() => Navigate("/reports/single")}
              >
                <FileText size={17} />
                <span>Einzelzeitnachweis</span>
              </button>
            </div>
          )}
        </div>

        {/* =========================
            EINSTELLUNGEN
        ========================= */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          <Settings size={21} />
          <span>Einstellungen</span>
        </NavLink>

        {/* =========================
            ARBEITSZEITEN VERWALTEN
        ========================= */}
        {user?.role === "Administrator" && (
          <NavLink
            to="/work-time-management"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <CalendarClock size={21} />
            <span>Arbeitszeiten verwalten</span>
          </NavLink>
        )}

        {/* =========================
            URLAUB
        ========================= */}
        <NavLink
          to="/vacation"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          <Palmtree size={21} />
          <span>Urlaub</span>
        </NavLink>

        {/* ============================
          ÜBERSTUNDENKONTO
        ===============================*/}

        <NavLink
          to="/ueberstundenkonto"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          <Clock3 size={18} />
          <span>Überstundenkonto</span>
        </NavLink>

        {/* =========================
            BENUTZER
        ========================= */}
        {user?.role === "Administrator" && (
          <NavLink
            to="/users"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <Users size={21} />
            <span>Benutzer</span>
          </NavLink>
        )}
      </nav>

      {/* =========================
          FOOTER
      ========================= */}
      <div className="sidebar-footer">
        <div className="user">
          <div className="avatar">U</div>

          <div>
            <strong>{username || "Gast"}</strong>
            <small>{user?.role || "Gast"}</small>
          </div>
        </div>

        {/* Datenbank sichern */}
        <button
          type="button"
          className="backup-button"
          onClick={handleDatabaseBackup}
        >
          <DatabaseBackup size={20} />
          <span>Datenbank sichern</span>
        </button>

        {/* Datenbank Wiederstellen */}
        <button
          type="button"
          className="restore-button"
          onClick={handleRestoreDatabase}
          title="Datenbank wiederherstellen"
        >
          <Import size={18} />
          <span>Datenbank wiederherstellen</span>
        </button>

        {/* Abmelden */}
        <button type="button" className="logout" onClick={handleLogout}>
          <LogOut size={20} />
          <span>Abmelden</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
