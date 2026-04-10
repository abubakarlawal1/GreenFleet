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

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    (async () => {
      const [s, v, vs, a] = await Promise.all([
        api.get("/api/voyages/summary", { headers }),
        api.get("/api/voyages", { headers }),
        api.get("/api/vessels", { headers }),
        api.get("/api/alerts/unread/count", { headers }),
      ]);
      setSummary(s.data);
      setVoyages(v.data);
      setVessels(vs.data);
      setUnreadAlerts(a.data.unread);
    })().catch(console.log);
  }, [token]);

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

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 className="h1">Dashboard</h1>
          <div className="muted">Fleet emissions overview and performance analytics.</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "16px 0" }}>
        <div className="stat card">
          <div className="stat-k">Vessels</div>
          <div className="stat-v">{vessels.length}</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Voyages</div>
          <div className="stat-v">{summary?.voyages_count ?? "\u2014"}</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total CO2</div>
          <div className="stat-v">{summary ? Number(summary.total_co2).toFixed(1) : "\u2014"} t</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total Fuel</div>
          <div className="stat-v">{summary ? Number(summary.total_fuel).toFixed(1) : "\u2014"} t</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="h2">CO2 by Recent Voyage</h2>
          <div style={{ height: 280 }}>
            <Bar data={barData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { x: { ticks: { maxRotation: 45 } } },
            }} />
          </div>
        </div>
        <div className="card">
          <h2 className="h2">CO2 by Fuel Type</h2>
          <div style={{ height: 280, display: "flex", justifyContent: "center" }}>
            <Doughnut data={doughnutData} options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: "bottom" } },
            }} />
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="stat card">
          <div className="stat-k">Total NOx</div>
          <div className="stat-v">{summary ? Number(summary.total_nox).toFixed(2) : "\u2014"} t</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total SOx</div>
          <div className="stat-v">{summary ? Number(summary.total_sox).toFixed(2) : "\u2014"} t</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="h2">Recent Voyages</h2>
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Vessel</th><th>Route</th><th>Date</th><th>Fuel (t)</th><th>CO2 (t)</th></tr>
          </thead>
          <tbody>
            {voyages.slice(0, 10).map((v) => (
              <tr key={v.id}>
                <td>#{v.id}</td>
                <td>{v.vessel_name}</td>
                <td>{v.departure_port || "\u2014"} \u2192 {v.arrival_port || "\u2014"}</td>
                <td>{v.voyage_date || "\u2014"}</td>
                <td>{v.fuel_tons}</td>
                <td>{v.co2_tons}</td>
              </tr>
            ))}
            {voyages.length === 0 && (
              <tr><td colSpan="6" className="muted">No voyages recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
