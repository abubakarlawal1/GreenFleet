import React, { useState } from "react";
import { api } from "../api";
import { Link, useNavigate } from "react-router-dom";

export default function SetupAdmin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post("/api/auth/bootstrap", { username, password });
      setMsg({ type: "ok", text: "Admin created. You can now login." });
      setTimeout(() => navigate("/login"), 800);
    } catch (err) {
      const text = err.response?.data?.message || err.message || "Setup failed";
      setMsg({ type: "err", text });
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 560, margin: "56px auto" }}>
        <h1 className="h1">Initial Admin Setup</h1>
        <p className="muted">Use this once if your database has no users yet.</p>

        {msg?.type === "err" && <div className="alert">{msg.text}</div>}
        {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

        <form onSubmit={submit} className="grid">
          <div>
            <label>Admin Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <label>Admin Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button className="btn" type="submit">Create Admin</button>

          <div className="muted" style={{ fontSize: 13 }}>
            Already created admin? <Link to="/login">Go to login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
