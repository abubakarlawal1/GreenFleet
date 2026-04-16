import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Alerts({ token, role }) {
  const [alerts, setAlerts] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = () => {
    api.get("/api/alerts", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setAlerts(r.data))
      .catch(console.log);
  };

  useEffect(() => { load(); }, [token]);

  const markRead = async (id) => {
    try {
      await api.put(`/api/alerts/${id}/read`, {}, { headers: { Authorization: `Bearer ${token}` } });
      load();
    } catch (err) { console.log(err); }
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all alerts? This cannot be undone.")) return;
    try {
      await api.delete("/api/alerts", { headers: { Authorization: `Bearer ${token}` } });
      setMsg({ type: "ok", text: "All alerts cleared" });
      load();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed" });
    }
  };

  const severityStyle = (severity) => ({
    padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
    background: severity === "Critical" ? "#fde2e2" : severity === "High" ? "#fff3e0" : severity === "Medium" ? "#fef3cd" : "#e8f5e9",
    color: severity === "Critical" ? "#8a1f1f" : severity === "High" ? "#e65100" : severity === "Medium" ? "#856404" : "#2e7d32",
  });

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="h1">Alerts</h1>
        {role === "Admin" && alerts.length > 0 && (
          <button className="btn btn-ghost" style={{ color: "#8a1f1f" }} onClick={clearAll}>Clear All</button>
        )}
      </div>
      <p className="muted">Emission anomalies and compliance warnings are flagged automatically when voyage data is recorded.</p>

      {msg?.type === "err" && <div className="alert">{msg.text}</div>}
      {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

      {alerts.length === 0 && (
        <div className="card"><p className="muted">No alerts. Alerts are generated automatically when emissions exceed thresholds.</p></div>
      )}

      {alerts.map((a) => (
        <div key={a.id} className="card" style={{
          marginBottom: 10, opacity: a.is_read ? 0.6 : 1,
          borderLeft: a.is_read ? "3px solid var(--border)" : "3px solid #e24b4b",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={severityStyle(a.severity)}>{a.severity}</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>{a.alert_type}</span>
              {a.vessel_name && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>{a.vessel_name}</span>}
            </div>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(a.created_at).toLocaleString()}</span>
          </div>
          <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{a.message}</p>
          {!a.is_read && (
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => markRead(a.id)}>Mark as read</button>
          )}
        </div>
      ))}
    </div>
  );
}
