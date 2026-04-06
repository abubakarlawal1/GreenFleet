import React, { useState } from "react";
import { api } from "../api";

export default function CreateUser({ token, role }) {
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "Manager" });
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post("/api/auth/users", form, { headers: { Authorization: `Bearer ${token}` } });
      setMsg({ type: "ok", text: "User created successfully." });
      setForm({ username: "", email: "", password: "", role: "Manager" });
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || err.message || "Failed" });
    }
  };

  if (role !== "Admin") {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 720, margin: "24px auto" }}>
          <h1 className="h1">Create User</h1>
          <div className="alert">Only Admin users can create new accounts.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 720, margin: "24px auto" }}>
        <h1 className="h1">Create User</h1>
        <p className="muted">Create accounts for team members and assign their access level.</p>

        {msg?.type === "err" && <div className="alert">{msg.text}</div>}
        {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

        <form onSubmit={submit} className="grid-2">
          <div>
            <label>Username</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </div>
          <div>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div>
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
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
    </div>
  );
}
