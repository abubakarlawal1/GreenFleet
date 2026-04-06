import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/Login";
import SetupAdmin from "./components/SetupAdmin";
import Dashboard from "./components/Dashboard";
import VesselForm from "./components/VesselForm";
import VoyageForm from "./components/VoyageForm";
import CreateUser from "./components/CreateUser";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");

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

  useEffect(() => {
    const t = localStorage.getItem("token") || "";
    const r = localStorage.getItem("role") || "";
    const u = localStorage.getItem("username") || "";
    if (t !== token) setToken(t);
    if (r !== role) setRole(r);
    if (u !== username) setUsername(u);
  }, []);

  // Helper: check if current role can write data (create/edit/delete)
  const canWrite = ["Admin", "Sustainability Officer", "Manager"].includes(role);
  const isAdmin = role === "Admin";

  return (
    <BrowserRouter>
      {token && <Navbar role={role} username={username} onLogout={onLogout} />}

      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login onLogin={onLogin} />} />
        <Route path="/setup" element={<SetupAdmin />} />

        {/* All authenticated users can view the dashboard */}
        <Route path="/dashboard" element={
          <ProtectedRoute token={token}>
            <Dashboard token={token} role={role} />
          </ProtectedRoute>
        } />

        {/* Only Admin, Sustainability Officer, Manager can add vessels */}
        <Route path="/vessels/new" element={
          <ProtectedRoute token={token}>
            {canWrite
              ? <VesselForm token={token} />
              : <div className="container"><div className="card alert">You do not have permission to add vessels.</div></div>
            }
          </ProtectedRoute>
        } />

        {/* Only Admin, Sustainability Officer, Manager can add voyages */}
        <Route path="/voyages/new" element={
          <ProtectedRoute token={token}>
            {canWrite
              ? <VoyageForm token={token} />
              : <div className="container"><div className="card alert">You do not have permission to add voyages.</div></div>
            }
          </ProtectedRoute>
        } />

        {/* Only Admin can create users */}
        <Route path="/users/new" element={
          <ProtectedRoute token={token}>
            <CreateUser token={token} role={role} />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
