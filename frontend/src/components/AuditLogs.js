import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function AuditLogs({ token, role }) {
  const [logs, setLogs] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = () => {
    if (role !== "Admin") return;
    api.get("/api/audit-logs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setLogs(r.data))
      .catch(console.log);
  };

  useEffect(() => { load(); }, [token, role]);

  if (role !== "Admin") {
    return (
      <div className="container">
        <div className="card"><div className="alert">Only Admin users can view audit logs.</div></div>
      </div>
    );
  }

  const clearAll = async () => {
    if (!window.confirm("Clear all audit logs? This cannot be undone.")) return;
    try {
      await api.delete("/api/audit-logs", { headers: { Authorization: `Bearer ${token}` } });
      setMsg({ type: "ok", text: "All audit logs cleared" });
      load();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed" });
    }
  };

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="h1">Audit Logs</h1>
        {logs.length > 0 && (
          <button className="btn btn-ghost" style={{ color: "#8a1f1f" }} onClick={clearAll}>Clear All</button>
        )}
      </div>
      <p className="muted">System activity trail showing all user actions for accountability and compliance.</p>

      {msg?.type === "err" && <div className="alert">{msg.text}</div>}
      {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</td>
                <td>{log.username || "System"}</td>
                <td><code style={{ fontSize: 12 }}>{log.action}</code></td>
                <td>{log.entity_type} {log.entity_id ? `#${log.entity_id}` : ""}</td>
                <td style={{ fontSize: 12, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>{log.details || "\u2014"}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan="5" className="muted">No activity logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
