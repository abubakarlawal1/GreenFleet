import React, { useState } from "react";
import { api } from "../api";
import { useNavigate, Link } from "react-router-dom";

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/api/auth/login", { username, password });
      const token = res.data?.token;
      const role = (res.data?.role || "").trim();
      const user = res.data?.username || username;
      if (!token) throw new Error("Token missing in response.");
      onLogin(token, role, user);
      navigate("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Login failed";
      setError(msg);
    }
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 560, margin: "56px auto" }}>
        <h1 className="h1">GreenFleet Login</h1>
        <p className="muted">Sign in to manage vessels, voyages, and emissions reporting.</p>

        {error && <div className="alert">{error}</div>}

        <form onSubmit={submit} className="grid">
          <div>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button className="btn" type="submit">Login</button>

          <div className="muted" style={{ fontSize: 13 }}>
            First run? <Link to="/setup">Create initial admin</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
