import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Users({ token, role, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "Manager" });

  const load = () => {
    api.get("/api/auth/users", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setUsers(r.data))
      .catch((err) => setMsg({ type: "err", text: err.response?.data?.message || "Failed to load users" }));
  };

  useEffect(() => {
    if (role === "Admin") load();
  }, [token, role]);

  if (role !== "Admin") {
    return (
      <div className="container">
        <div className="card"><div className="alert">Only Admin users can manage users.</div></div>
      </div>
    );
  }

  const updateRole = async (id, newRole) => {
    try {
      await api.put(`/api/auth/users/${id}`, { role: newRole }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg({ type: "ok", text: "Role updated" });
      load();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed to update role" });
    }
  };

  const deleteUser = async (id, username) => {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/auth/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg({ type: "ok", text: "User deleted" });
      load();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed to delete user" });
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post("/api/auth/users", newUser, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg({ type: "ok", text: "User created" });
      setNewUser({ username: "", email: "", password: "", role: "Manager" });
      setShowCreate(false);
      load();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed to create user" });
    }
  };

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="h1">User Management</h1>
        <button className="btn btn-ghost" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ Create User"}
        </button>
      </div>

      {msg?.type === "err" && <div className="alert">{msg.text}</div>}
      {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="h2">Create New User</h2>
          <form onSubmit={createUser} className="grid-2">
            <div>
              <label>Username</label>
              <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
            </div>
            <div>
              <label>Email</label>
              <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
            </div>
            <div>
              <label>Role</label>
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="Viewer">Viewer</option>
                <option value="Manager">Manager</option>
                <option value="Sustainability Officer">Sustainability Officer</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit">Create User</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="h2">All Users ({users.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>#{u.id}</td>
                <td>{u.username}</td>
                <td>{u.email || "—"}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    disabled={u.id === currentUserId}
                    style={{ padding: "4px 8px", fontSize: 13 }}
                  >
                    <option value="Viewer">Viewer</option>
                    <option value="Manager">Manager</option>
                    <option value="Sustainability Officer">Sustainability Officer</option>
                    <option value="Admin">Admin</option>
                  </select>
                </td>
                <td style={{ fontSize: 13 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  {u.id === currentUserId ? (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>(you)</span>
                  ) : (
                    <button className="btn btn-ghost" style={{ color: "#8a1f1f" }} onClick={() => deleteUser(u.id, u.username)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan="6" className="muted">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
