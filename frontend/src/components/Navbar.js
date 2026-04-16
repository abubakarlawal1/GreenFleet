import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Navbar({ role, username, onLogout }) {
  const navigate = useNavigate();
  const logout = () => { onLogout(); navigate("/login"); };

  const canWrite = ["Admin", "Sustainability Officer", "Manager"].includes(role);
  const canRecommend = ["Admin", "Sustainability Officer"].includes(role);
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
          <Link to="/vessels">Vessels</Link>
          {canWrite && <Link to="/voyages/new">Add Voyage</Link>}
          {canRecommend && <Link to="/recommendations">Recommendations</Link>}
          <Link to="/reports">Reports</Link>
          <Link to="/alerts">Alerts</Link>
          {isAdmin && <Link to="/users">Users</Link>}
          {isAdmin && <Link to="/audit-logs">Audit Logs</Link>}
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{username}</span>
          <button className="btn btn-ghost" onClick={logout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
