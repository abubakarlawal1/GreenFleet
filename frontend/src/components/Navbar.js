import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Navbar({ role, username, onLogout }) {
  const navigate = useNavigate();
  const logout = () => { onLogout(); navigate("/login"); };

  const canWrite = ["Admin", "Sustainability Officer", "Manager"].includes(role);
  const isAdmin = role === "Admin";

  return (
    <div className="nav">
      <div className="nav-inner">
        <div className="brand">
          <span className="dot" />
          GreenFleet
          <span className="pill">{role || "Guest"}</span>
        </div>
        <div className="nav-links">
          <Link to="/dashboard">Dashboard</Link>
          {canWrite && <Link to="/vessels/new">Add Vessel</Link>}
          {canWrite && <Link to="/voyages/new">Add Voyage</Link>}
          {isAdmin && <Link to="/users/new">Create User</Link>}
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{username}</span>
          <button className="btn btn-ghost" onClick={logout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
