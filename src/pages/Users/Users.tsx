import { useEffect, useState } from "react";
import "./Users.css";

type User = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("Mitarbeiter");

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);

      const result = await window.database.getUsers();

      console.log("===== ALLE BENUTZER =====");
      console.table(result);

      setUsers(result as User[]);
    } catch (error) {
      console.error("Benutzer konnten nicht geladen werden:", error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setUsername("");
    setPassword("");
    setDisplayName("");
    setRole("Mitarbeiter");
    setEditingId(null);
  }

  async function handleSave() {
    if (!username.trim()) {
      alert("Bitte einen Benutzernamen eingeben.");
      return;
    }

    if (!displayName.trim()) {
      alert("Bitte einen Anzeigenamen eingeben.");
      return;
    }

    try {
      if (editingId) {
        const updateData: {
          id: string;
          username: string;
          displayName: string;
          role: string;
          password?: string;
        } = {
          id: editingId,
          username: username.trim(),
          displayName: displayName.trim(),
          role,
        };

        if (password.trim()) {
          updateData.password = password.trim();
        }

        await window.database.updateUser(updateData);
      } else {
        if (!password.trim()) {
          alert("Bitte ein Passwort eingeben.");
          return;
        }

        await window.database.createUser({
          id: crypto.randomUUID(),
          username: username.trim(),
          password: password.trim(),
          displayName: displayName.trim(),
          role,
        });
      }

      await loadUsers();
      resetForm();
    } catch (error) {
      console.error("Benutzer konnte nicht gespeichert werden:", error);

      alert(
        "Benutzer konnte nicht gespeichert werden. " +
          "Möglicherweise existiert der Benutzername bereits.",
      );
    }
  }

  function handleEdit(user: User) {
    setEditingId(user.id);
    setUsername(user.username);
    setPassword("");
    setDisplayName(user.displayName);
    setRole(user.role);
  }

  async function handleDelete(user: User) {
    const confirmed = window.confirm(
      `Möchtest du den Benutzer "${user.displayName}" wirklich löschen?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await window.database.deleteUser(user.id);
      await loadUsers();

      if (editingId === user.id) {
        resetForm();
      }
    } catch (error) {
      console.error("Fehler beim Löschen des Benutzers:", error);

      window.alert("Der Benutzer konnte nicht gelöscht werden.");
    }
  }

  if (loading) {
    return (
      <div className="users-page">
        <div className="users-card loading-card">
          <div className="loading-spinner" />
          <p>Benutzer werden geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users-page">
      {/* Kopfbereich */}
      <div className="users-header">
        <div>
          <h1>Benutzerverwaltung</h1>
          <p>Benutzer anlegen, bearbeiten und verwalten</p>
        </div>

        <div className="user-count">
          <span>{users.length}</span>
          <small>{users.length === 1 ? "Benutzer" : "Benutzer"}</small>
        </div>
      </div>

      {/* Formular */}
      <section className="users-card">
        <div className="card-header">
          <div>
            <h2>
              {editingId ? "Benutzer bearbeiten" : "Neuen Benutzer anlegen"}
            </h2>

            <p>
              {editingId
                ? "Ändere die Daten des ausgewählten Benutzers."
                : "Lege einen neuen Benutzer für TimeReport an."}
            </p>
          </div>
        </div>

        <div className="user-form">
          <div className="form-group">
            <label htmlFor="username">Benutzername</label>

            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="z. B. max.mustermann"
            />
          </div>

          <div className="form-group">
            <label htmlFor="displayName">Name</label>

            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="z. B. Max Mustermann"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Passwort
              {editingId && <span className="optional">optional</span>}
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                editingId ? "Leer lassen = unverändert" : "Passwort eingeben"
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Rolle</label>

            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="Mitarbeiter">Mitarbeiter</option>

              <option value="Administrator">Administrator</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button
            className="btn-benutzer-anlegen btn-primary"
            onClick={handleSave}
          >
            {editingId ? (
              <>
                <span>✓</span>
                Änderungen speichern
              </>
            ) : (
              <>
                <span>＋</span>
                Benutzer anlegen
              </>
            )}
          </button>

          {editingId && (
            <button className="btn btn-secondary" onClick={resetForm}>
              Abbrechen
            </button>
          )}
        </div>
      </section>

      {/* Benutzerliste */}
      <section className="users-card">
        <div className="card-header">
          <div>
            <h2>Benutzerliste</h2>
            <p>Alle Benutzer deiner TimeReport-Anwendung</p>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>

            <h3>Keine Benutzer vorhanden</h3>

            <p>Lege oben einen neuen Benutzer an.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Benutzername</th>
                  <th>Name</th>
                  <th>Rolle</th>
                  <th className="actions-column">Aktionen</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="username-cell">
                        <div className="user-avatar">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>

                        <span>{user.username}</span>
                      </div>
                    </td>

                    <td>
                      <strong>{user.displayName}</strong>
                    </td>

                    <td>
                      <span
                        className={
                          user.role === "Administrator"
                            ? "role-badge admin"
                            : "role-badge employee"
                        }
                      >
                        {user.role === "Administrator"
                          ? "⚙ Administrator"
                          : "👤 Mitarbeiter"}
                      </span>
                    </td>

                    <td className="actions-column">
                      <div className="action-buttons">
                        <button
                          className="action-btn edit-btn"
                          onClick={() => handleEdit(user)}
                          title="Benutzer bearbeiten"
                        >
                          ✏️
                          <span>Bearbeiten</span>
                        </button>

                        <button
                          className="action-btn delete-btn"
                          onClick={() => handleDelete(user)}
                          title="Benutzer löschen"
                        >
                          🗑️
                          <span>Löschen</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default Users;
