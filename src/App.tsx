import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Layout from "./components/layout/Layout";
import Login from "./pages/Login/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import TimeTracking from "./pages/TimeTracking/TimeTracking";
import DailyReport from "./pages/Reports/DailyReport";
import WeeklyReport from "./pages/Reports/WeeklyReport";
import MonthlyReport from "./pages/Reports/MonthlyReport";
import YearlyReport from "./pages/Reports/YearlyReport";
import Settings from "./pages/Settings/Settings";
import Users from "./pages/Users/Users";
import WorkTimeManagement from "./pages/WokTimeManagement/WorkTimeManagement";
import Vacation from "./pages/Vacation/Vacation";
import OvertimeAccount from "../src/pages/Overtime/OvertimeAccount";
import Setup from "../src/pages/Setup/Setup";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SingleReport from "./pages/Reports/SingleReport";

function App() {
  const navigate = useNavigate();
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSetup() {
      try {
        const needsSetup = await window.database.needsInitialSetup();

        if (!active) return;

        // Nur bei erforderlicher Ersteinrichtung umleiten.
        if (needsSetup) {
          navigate("/setup", { replace: true });
        }
        // Wenn Setup abgeschlossen ist, die aktuelle Route
        // beibehalten. Login und Dashboard werden nicht überschrieben.
      } catch (error) {
        console.error("Fehler bei der Setup-Prüfung:", error);
      } finally {
        if (active) setCheckingSetup(false);
      }
    }

    void checkSetup();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (checkingSetup) {
    return <div>TimeReport Desktop wird gestartet …</div>;
  }
  console.log("Aktuelle Route:", window.location.hash);

  return (
    <Routes>
      {/* Login */}
      <Route path="/login" element={<Login />} />

      {/* Dashboard */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Zeiterfassung */}
      <Route
        path="/timetracking"
        element={
          <ProtectedRoute>
            <Layout>
              <TimeTracking />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Arbeitszeiten verwalten */}
      <Route
        path="/work-time-management"
        element={
          <ProtectedRoute>
            <Layout>
              <WorkTimeManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Berichte */}
      <Route
        path="/reports/daily"
        element={
          <ProtectedRoute>
            <Layout>
              <DailyReport />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/weekly"
        element={
          <ProtectedRoute>
            <Layout>
              <WeeklyReport />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/monthly"
        element={
          <ProtectedRoute>
            <Layout>
              <MonthlyReport />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/yearly"
        element={
          <ProtectedRoute>
            <Layout>
              <YearlyReport />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Einzelzeitnachweis */}
      <Route
        path="/reports/single"
        element={
          <ProtectedRoute>
            <Layout>
              <SingleReport />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Einstellungen */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/vacation"
        element={
          <ProtectedRoute>
            <Layout>
              <Vacation />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Überstundenkonto */}
      <Route
        path="/ueberstundenkonto"
        element={
          <ProtectedRoute>
            <Layout>
              <OvertimeAccount />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Users */}
      <Route
        path="/users"
        element={
          <ProtectedRoute requiredRole="Administrator">
            <Layout>
              <Users />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="/setup" element={<Setup />} />

      {/* Unbekannte URLs */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
