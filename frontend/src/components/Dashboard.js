import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function Dashboard({ token }) {
  const [summary, setSummary] = useState(null);
  const [voyages, setVoyages] = useState([]);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    (async () => {
      const s = await api.get("/api/voyages/summary", { headers });
      setSummary(s.data);
      const v = await api.get("/api/voyages", { headers });
      setVoyages(v.data.slice(0, 6));
    })().catch(console.log);
  }, [token]);

  const data = {
    labels: voyages.map((x) => `#${x.id}`),
    datasets: [{ label: "CO₂ (tons)", data: voyages.map((x) => Number(x.co2_tons)) }],
  };

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="h1">Dashboard</h1>
        <div className="muted">Fleet emissions overview and recent voyages.</div>
      </div>

      <div className="grid-3">
        <div className="stat card">
          <div className="stat-k">Voyages</div>
          <div className="stat-v">{summary?.voyages_count ?? "-"}</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total CO₂</div>
          <div className="stat-v">{summary ? Number(summary.total_co2).toFixed(2) : "-"} t</div>
        </div>
        <div className="stat card">
          <div className="stat-k">Total NOx / SOx</div>
          <div className="stat-v">
            {summary ? `${Number(summary.total_nox).toFixed(2)} / ${Number(summary.total_sox).toFixed(2)} t` : "-"}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="h2">Recent CO₂ Emissions</h2>
        <div style={{ height: 260 }}>
          <Bar data={data} options={{ responsive: true, maintainAspectRatio: false }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="h2">Recent Voyages</h2>
        <table className="table">
          <thead><tr><th>ID</th><th>Vessel</th><th>Fuel</th><th>Fuel (t)</th><th>CO₂ (t)</th></tr></thead>
          <tbody>
            {voyages.map((v) => (
              <tr key={v.id}>
                <td>#{v.id}</td><td>{v.vessel_name}</td><td>{v.fuel_type}</td><td>{v.fuel_tons}</td><td>{v.co2_tons}</td>
              </tr>
            ))}
            {voyages.length === 0 && <tr><td colSpan="5" className="muted">No voyages yet. Add one to see analytics.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
