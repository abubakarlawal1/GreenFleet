import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/Login";
import SetupAdmin from "./components/SetupAdmin";
import Dashboard from "./components/Dashboard";
import Vessels from "./components/Vessels";
import VesselForm from "./components/VesselForm";
import VoyageForm from "./components/VoyageForm";
import Users from "./components/Users";
import Recommendations from "./components/Recommendations";
import Reports from "./components/Reports";
import Alerts from "./components/Alerts";
import AuditLogs from "./components/AuditLogs";
import ImportCSV from "./components/ImportCSV";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");
  const [currentUserId, setCurrentUserId] = useState(null);

  // Decode token to get current user's ID (so we can prevent self-delete)
  useEffect(() => {
    if (token) {
      try {
        const decoded = JSON.parse(atob(token.split(".")[1]));
        setCurrentUserId(decoded.id);
      } catch (err) { setCurrentUserId(null); }
    } else {
      setCurrentUserId(null);
    }
  }, [token]);

  const onLogin = (t, r, u) => {
    const cleanRole = (r || "").trim();
    setToken(t);
    setRole(cleanRole);
    setUsername(u || "");
    localStorage.setItem("token", t);
    localStorage.setItem("role", cleanRole);
    localStorage.setItem("username", u || "");
  };

  const onLogout = () => {
    setToken("");
    setRole("");
    setUsername("");
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
  };

  const canWrite = ["Admin", "Sustainability Officer", "Manager"].includes(role);
  const canRecommend = ["Admin", "Sustainability Officer"].includes(role);

  const denied = (msg) => (
    <div className="container"><div className="card alert">{msg}</div></div>
  );

  return (
    <BrowserRouter>
      {token && <Navbar role={role} username={username} onLogout={onLogout} />}
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login onLogin={onLogin} />} />
        <Route path="/setup" element={<SetupAdmin />} />

        <Route path="/dashboard" element={
          <ProtectedRoute token={token}><Dashboard token={token} role={role} /></ProtectedRoute>
        } />

        {/* Vessels list - all logged-in users can view; write actions gated inside component */}
        <Route path="/vessels" element={
          <ProtectedRoute token={token}><Vessels token={token} role={role} /></ProtectedRoute>
        } />

        <Route path="/vessels/new" element={
          <ProtectedRoute token={token}>
            {canWrite ? <VesselForm token={token} /> : denied("You do not have permission to add vessels.")}
          </ProtectedRoute>
        } />

        <Route path="/voyages/new" element={
          <ProtectedRoute token={token}>
            {canWrite ? <VoyageForm token={token} /> : denied("You do not have permission to add voyages.")}
          </ProtectedRoute>
        } />

        <Route path="/voyages/import" element={
          <ProtectedRoute token={token}>
            {canWrite ? <ImportCSV token={token} /> : denied("You do not have permission to import data.")}
          </ProtectedRoute>
        } />

        <Route path="/recommendations" element={
          <ProtectedRoute token={token}>
            {canRecommend ? <Recommendations token={token} /> : denied("Only Admin and Sustainability Officers can access recommendations.")}
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute token={token}><Reports token={token} role={role} /></ProtectedRoute>
        } />

        <Route path="/alerts" element={
          <ProtectedRoute token={token}><Alerts token={token} /></ProtectedRoute>
        } />

        {/* Users page - Admin only */}
        <Route path="/users" element={
          <ProtectedRoute token={token}><Users token={token} role={role} currentUserId={currentUserId} /></ProtectedRoute>
        } />

        <Route path="/audit-logs" element={
          <ProtectedRoute token={token}><AuditLogs token={token} role={role} /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
