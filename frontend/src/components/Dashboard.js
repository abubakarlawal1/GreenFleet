import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

export default function Dashboard({ token, role }) {
  const [summary, setSummary] = useState(null);
  const [voyages, setVoyages] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [selectedVessel, setSelectedVessel] = useState("");
  const [msg, setMsg] = useState(null);

  const canDelete = ["Admin", "Sustainability Officer", "Manager"].includes(role);

  const loadAll = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [vs, a] = await Promise.all([
        api.get("/api/vessels", { headers }),
        api.get("/api/alerts/unread/count", { headers }),
      ]);
      setVessels(vs.data);
      setUnreadAlerts(a.data.unread);
    } catch (err) { console.log(err); }
  };

  const loadData = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const summaryUrl = selectedVessel
        ? `/api/voyages/summary?vessel_id=${selectedVessel}`
        : "/api/voyages/summary";
      const voyagesUrl = selectedVessel
        ? `/api/voyages/by-vessel/${selectedVessel}`
        : "/api/voyages";

      const [s, v] = await Promise.all([
        api.get(summaryUrl, { headers }),
        api.get(voyagesUrl, { headers }),
      ]);
      setSummary(s.data);
      setVoyages(v.data);
    } catch (err) { console.log(err); }
  };

  useEffect(() => { loadAll(); }, [token]);
  useEffect(() => { loadData(); }, [token, selectedVessel]);

  const deleteVoyage = async (id) => {
    if (!window.confirm(`Delete voyage #${id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/voyages/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setMsg({ type: "ok", text: `Voyage #${id} deleted` });
      loadData();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed to delete voyage" });
    }
  };

  const recentVoyages = voyages.slice(0, 8);
  const barData = {
    labels: recentVoyages.map((x) => x.vessel_name ? `${x.vessel_name} #${x.id}` : `#${x.id}`),
    datasets: [{
      label: "CO2 (tonnes)",
      data: recentVoyages.map((x) => Number(x.co2_tons)),
      backgroundColor: "rgba(11, 31, 59, 0.75)",
      borderRadius: 6,
    }],
  };

  const fuelGroups = {};
  voyages.forEach((v) => {
    const ft = v.fuel_type || "Unknown";
    fuelGroups[ft] = (fuelGroups[ft] || 0) + Number(v.co2_tons);
  });
  const doughnutData = {
    labels: Object.keys(fuelGroups),
    datasets: [{
      data: Object.values(fuelGroups).map((v) => Number(v.toFixed(2))),
      backgroundColor: ["#0b1f3b", "#1a6b4a", "#c47a1a", "#4a3080", "#8a1f1f"],
      borderWidth: 0,
    }],
  };

  const selectedVesselObj = vessels.find((v) => String(v.id) === String(selectedVessel));

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="h1">Dashboard</h1>
          <div className="muted">
            {selectedVesselObj ? `Viewing: ${selectedVesselObj.name} (${selectedVesselObj.imo_number})` : "Fleet-wide emissions overview"}
          </div>
        </div>
        {unreadAlerts > 0 && (
          <a href="/alerts" style={{
            padding: "8px 14px", borderRadius: 999,
            background: "#fde2e2", color: "#8a1f1f", fontWeight: 700, fontSize: 14,
          }}>
            {unreadAlerts} alert{unreadAlerts !== 1 ? "s" : ""}
          </a>
        )}
      </div>

      {msg?.type === "err" && <div className="alert" style={{ marginTop: 12 }}>{msg.text}</div>}
      {msg?.type === "ok" && <div className="notice" style={{ marginTop: 12 }}>{msg.text}</div>}

      {/* Vessel filter */}
      <div className="card" style={{ marginTop: 12, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ margin: 0, whiteSpace: "nowrap" }}>Filter by vessel:</label>
          <select
            value={selectedVessel}
            onChange={(e) => setSelectedVessel(e.target.value)}
            style={{ maxWidth: 400, flex: 1 }}
          >
            <option value="">All vessels (fleet-wide)</option>
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>{v.name} ({v.imo_number})</option>
            ))}
          </select>
          {selectedVessel && (
            <button className="btn btn-ghost" onClick={() => setSelectedVessel("")}>Clear</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "16px 0" }}>
        <div className="stat card">
          <div className="stat-k">{selectedVessel ? "Vessel" : "Vessels"}</div>
          <div className="stat-v">{selectedVessel ? 1 : vessels.length}</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Voyages</div>
          <div className="stat-v">{summary?.voyages_count ?? "—"}</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total CO2</div>
          <div className="stat-v">{summary ? Number(summary.total_co2).toFixed(1) : "—"} t</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total Fuel</div>
          <div className="stat-v">{summary ? Number(summary.total_fuel).toFixed(1) : "—"} t</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="h2">CO2 by Recent Voyage</h2>
          <div style={{ height: 280 }}>
            <Bar data={barData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { x: { ticks: { maxRotation: 45 } } },
            }} />
          </div>
        </div>
        <div className="card">
          <h2 className="h2">CO2 by Fuel Type</h2>
          <div style={{ height: 280, display: "flex", justifyContent: "center" }}>
            <Doughnut data={doughnutData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: "bottom" } },
            }} />
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="stat card">
          <div className="stat-k">Total NOx</div>
          <div className="stat-v">{summary ? Number(summary.total_nox).toFixed(2) : "—"} t</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total SOx</div>
          <div className="stat-v">{summary ? Number(summary.total_sox).toFixed(2) : "—"} t</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="h2">Recent Voyages</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th><th>Vessel</th><th>Route</th><th>Date</th>
              <th>Days</th><th>Fuel (t)</th><th>CO2 (t)</th>
              {canDelete && <th></th>}
            </tr>
          </thead>
          <tbody>
            {voyages.slice(0, 10).map((v) => (
              <tr key={v.id}>
                <td>#{v.id}</td>
                <td>{v.vessel_name}</td>
                <td>{v.departure_port || "—"} → {v.arrival_port || "—"}</td>
                <td>{v.voyage_date || "—"}</td>
                <td>{v.duration_days || "—"}</td>
                <td>{v.fuel_tons}</td>
                <td>{v.co2_tons}</td>
                {canDelete && (
                  <td>
                    <button className="btn btn-ghost" style={{ color: "#8a1f1f", fontSize: 12 }} onClick={() => deleteVoyage(v.id)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {voyages.length === 0 && (
              <tr><td colSpan={canDelete ? 8 : 7} className="muted">No voyages recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
