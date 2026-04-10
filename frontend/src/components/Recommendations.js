import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Recommendations({ token }) {
  const [vessels, setVessels] = useState([]);
  const [selectedVessel, setSelectedVessel] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/vessels", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setVessels(r.data))
      .catch(console.log);
  }, [token]);

  const generate = async () => {
    if (!selectedVessel) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post(
        `/api/recommendations/generate/${selectedVessel}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to generate recommendations");
    }
    setLoading(false);
  };

  const categoryColor = {
    Propulsion: "#0b1f3b",
    Hull: "#1a6b4a",
    Fuel: "#8a4d0f",
    Operations: "#4a3080",
  };

  return (
    <div className="container">
      <h1 className="h1">Technology Recommendations</h1>
      <p className="muted">
        Select a vessel to generate emission-reduction technology recommendations based on its
        characteristics and voyage performance data.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div>
            <label>Select Vessel</label>
            <select value={selectedVessel} onChange={(e) => setSelectedVessel(e.target.value)}>
              <option value="">Choose a vessel</option>
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.imo_number}) — {v.vessel_type || "Unknown type"}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn" onClick={generate} disabled={!selectedVessel || loading}>
              {loading ? "Analysing..." : "Generate Recommendations"}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {result && (
        <>
          {/* Vessel stats summary */}
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat card">
              <div className="stat-k">Total Voyages</div>
              <div className="stat-v">{result.voyage_stats.total_voyages}</div>
            </div>
            <div className="stat card">
              <div className="stat-k">Total CO₂</div>
              <div className="stat-v">{result.voyage_stats.total_co2} t</div>
            </div>
            <div className="stat card">
              <div className="stat-k">Primary Fuel</div>
              <div className="stat-v">{result.voyage_stats.primary_fuel}</div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="card">
            <h2 className="h2">
              {result.recommendations.length} Recommendation{result.recommendations.length !== 1 ? "s" : ""} for {result.vessel.name}
            </h2>
            {result.recommendations.length > 0 && (
              <p className="muted" style={{ marginBottom: 16 }}>
                Combined potential emission reduction: up to {result.total_potential_reduction}%
              </p>
            )}

            {result.recommendations.length === 0 && (
              <p className="muted">No recommendations matched this vessel's profile. Add more voyage data for better analysis.</p>
            )}

            {result.recommendations.map((rec) => (
              <div key={rec.id} style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 16,
                marginBottom: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{rec.technology}</strong>
                    <span style={{
                      marginLeft: 10,
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: categoryColor[rec.category] || "#0b1f3b",
                      color: "#fff",
                      fontWeight: 700,
                    }}>
                      {rec.category}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 18,
                    fontWeight: 900,
                    color: "var(--navy)",
                  }}>
                    ~{rec.estimated_reduction_pct}%
                  </span>
                </div>
                <p style={{ margin: "0 0 6px", color: "var(--text)", lineHeight: 1.5 }}>{rec.description}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Source: {rec.source_reference}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
