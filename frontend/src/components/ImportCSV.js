import React, { useState } from "react";
import { api } from "../api";

export default function ImportCSV({ token }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post("/api/voyages/import/csv", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Import failed");
    }
    setLoading(false);
  };

  return (
    <div className="container">
      <h1 className="h1">Import Voyages from CSV</h1>
      <p className="muted">
        Upload a CSV file to bulk-import voyage data. Emissions are calculated automatically for each row.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="h2">Required CSV Format</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Your CSV must include a header row with these column names:
        </p>
        <div style={{
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 12, fontFamily: "monospace", fontSize: 13,
          overflowX: "auto", marginBottom: 12,
        }}>
          vessel_id,departure_port,arrival_port,voyage_date,distance_nm,duration_hours,fuel_type,fuel_tons
          <br />
          1,Southampton,Rotterdam,2025-11-15,350,24,HFO,45
          <br />
          1,Rotterdam,Hamburg,2025-12-01,280,18,HFO,38
          <br />
          2,Felixstowe,Antwerp,2025-11-20,180,12,MDO,32
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Required columns: <strong>vessel_id</strong>, <strong>distance_nm</strong>, <strong>fuel_tons</strong>.
          Optional: departure_port, arrival_port, voyage_date, duration_hours, fuel_type (defaults to HFO).
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label>Select CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files[0])}
              style={{
                width: "100%", padding: 12, border: "1px solid var(--border)",
                borderRadius: 12, background: "#fff",
              }}
            />
          </div>
          <button className="btn" type="submit" disabled={!file || loading}>
            {loading ? "Importing..." : "Upload & Import"}
          </button>
        </form>
      </div>

      {error && <div className="alert">{error}</div>}

      {result && (
        <div className="card">
          <h2 className="h2">Import Results</h2>
          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat" style={{ border: "1px solid var(--border)", borderRadius: 14 }}>
              <div className="stat-k">Total Rows</div>
              <div className="stat-v">{result.total_rows}</div>
            </div>
            <div className="stat" style={{ border: "1px solid #b9e3c7", borderRadius: 14, background: "#d7f0df" }}>
              <div className="stat-k">Imported</div>
              <div className="stat-v" style={{ color: "#165a2a" }}>{result.imported}</div>
            </div>
            <div className="stat" style={{
              border: result.errors?.length > 0 ? "1px solid #f6c7c7" : "1px solid var(--border)",
              borderRadius: 14,
              background: result.errors?.length > 0 ? "#fde2e2" : "transparent",
            }}>
              <div className="stat-k">Errors</div>
              <div className="stat-v" style={{ color: result.errors?.length > 0 ? "#8a1f1f" : "var(--navy)" }}>
                {result.errors?.length || 0}
              </div>
            </div>
          </div>

          {result.alerts_created > 0 && (
            <div className="notice" style={{ marginBottom: 12 }}>
              {result.alerts_created} high-emission alert{result.alerts_created !== 1 ? "s" : ""} generated.
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div>
              <h2 className="h2" style={{ color: "#8a1f1f" }}>Errors</h2>
              {result.errors.map((err, i) => (
                <div key={i} style={{ fontSize: 13, color: "#8a1f1f", marginBottom: 4 }}>{err}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
