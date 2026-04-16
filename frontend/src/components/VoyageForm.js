import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function VoyageForm({ token }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("manual");
  const [vessels, setVessels] = useState([]);

  const [form, setForm] = useState({
    vessel_id: "", departure_port: "", arrival_port: "",
    voyage_date: "", distance_nm: "", duration_days: "",
    fuel_type: "HFO", fuel_tons: "",
  });
  const [msg, setMsg] = useState(null);

  const [file, setFile] = useState(null);
  const [csvResult, setCsvResult] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState("");

  useEffect(() => {
    api.get("/api/vessels", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setVessels(r.data)).catch(console.log);
  }, [token]);

  const submitManual = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await api.post("/api/voyages", form, { headers: { Authorization: `Bearer ${token}` } });
      const em = res.data?.emissions;
      setMsg({ type: "ok", text: `Voyage saved. Emissions: CO2 ${em?.co2_tons}t, NOx ${em?.nox_tons}t, SOx ${em?.sox_tons}t` });
      setTimeout(() => navigate("/dashboard"), 1200);
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || err.message || "Failed" });
    }
  };

  const submitCSV = async (e) => {
    e.preventDefault();
    if (!file) return;
    setCsvLoading(true);
    setCsvError("");
    setCsvResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/api/voyages/import/csv", formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      setCsvResult(res.data);
    } catch (err) {
      setCsvError(err.response?.data?.message || "Import failed");
    }
    setCsvLoading(false);
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const tabStyle = (t) => ({
    padding: "10px 20px", border: "none",
    borderBottom: tab === t ? "3px solid var(--navy)" : "3px solid transparent",
    background: "none", fontWeight: 700, fontSize: 15, cursor: "pointer",
    color: tab === t ? "var(--navy)" : "var(--muted)",
  });

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 760, margin: "24px auto" }}>
        <h1 className="h1">Add Voyage</h1>
        <p className="muted">Record voyage data manually or import in bulk from a CSV file.</p>

        <div style={{ borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          <button style={tabStyle("manual")} onClick={() => setTab("manual")}>Manual Entry</button>
          <button style={tabStyle("csv")} onClick={() => setTab("csv")}>CSV Import</button>
        </div>

        {tab === "manual" && (
          <>
            {msg?.type === "err" && <div className="alert">{msg.text}</div>}
            {msg?.type === "ok" && <div className="notice">{msg.text}</div>}
            <form onSubmit={submitManual} className="grid-2">
              <div>
                <label>Vessel</label>
                <select value={form.vessel_id} onChange={set("vessel_id")} required>
                  <option value="">Select vessel</option>
                  {vessels.map((v) => (<option key={v.id} value={v.id}>{v.name} ({v.imo_number})</option>))}
                </select>
              </div>
              <div><label>Voyage Date</label><input type="date" value={form.voyage_date} onChange={set("voyage_date")} /></div>
              <div><label>Departure Port</label><input value={form.departure_port} onChange={set("departure_port")} placeholder="e.g. Southampton" /></div>
              <div><label>Arrival Port</label><input value={form.arrival_port} onChange={set("arrival_port")} placeholder="e.g. Rotterdam" /></div>
              <div><label>Distance (nautical miles)</label><input type="number" value={form.distance_nm} onChange={set("distance_nm")} required /></div>
              <div><label>Duration (days)</label><input type="number" step="0.1" value={form.duration_days} onChange={set("duration_days")} placeholder="e.g. 3.5" /></div>
              <div>
                <label>Fuel Type</label>
                <select value={form.fuel_type} onChange={set("fuel_type")}>
                  <option>HFO</option><option>MDO</option><option>MGO</option><option>LNG</option>
                </select>
              </div>
              <div><label>Fuel Consumed (tonnes)</label><input type="number" step="0.001" value={form.fuel_tons} onChange={set("fuel_tons")} required /></div>
              <div style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Save Voyage</button></div>
            </form>
          </>
        )}

        {tab === "csv" && (
          <>
            <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, fontFamily: "monospace", fontSize: 13, overflowX: "auto", marginBottom: 12 }}>
              vessel_id,departure_port,arrival_port,voyage_date,distance_nm,duration_days,fuel_type,fuel_tons<br/>
              1,Southampton,Rotterdam,2025-11-15,350,2,HFO,45<br/>
              1,Rotterdam,Hamburg,2025-12-01,280,1.5,HFO,38<br/>
              2,Felixstowe,Antwerp,2025-11-20,180,1,MDO,32
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Required: <strong>vessel_id</strong>, <strong>distance_nm</strong>, <strong>fuel_tons</strong>. Optional: departure_port, arrival_port, voyage_date, duration_days, fuel_type.
            </p>
            <form onSubmit={submitCSV}>
              <div style={{ marginBottom: 12 }}>
                <label>Select CSV File</label>
                <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])}
                  style={{ width: "100%", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }} />
              </div>
              <button className="btn" type="submit" disabled={!file || csvLoading}>{csvLoading ? "Importing..." : "Upload & Import"}</button>
            </form>

            {csvError && <div className="alert" style={{ marginTop: 12 }}>{csvError}</div>}

            {csvResult && (
              <div style={{ marginTop: 16 }}>
                <div className="grid-3">
                  <div className="stat" style={{ border: "1px solid var(--border)", borderRadius: 14 }}>
                    <div className="stat-k">Total Rows</div><div className="stat-v">{csvResult.total_rows}</div>
                  </div>
                  <div className="stat" style={{ border: "1px solid #b9e3c7", borderRadius: 14, background: "#d7f0df" }}>
                    <div className="stat-k">Imported</div><div className="stat-v" style={{ color: "#165a2a" }}>{csvResult.imported}</div>
                  </div>
                  <div className="stat" style={{ border: csvResult.errors?.length > 0 ? "1px solid #f6c7c7" : "1px solid var(--border)", borderRadius: 14, background: csvResult.errors?.length > 0 ? "#fde2e2" : "transparent" }}>
                    <div className="stat-k">Errors</div>
                    <div className="stat-v" style={{ color: csvResult.errors?.length > 0 ? "#8a1f1f" : "var(--navy)" }}>{csvResult.errors?.length || 0}</div>
                  </div>
                </div>
                {csvResult.alerts_created > 0 && (
                  <div className="notice" style={{ marginTop: 12 }}>{csvResult.alerts_created} high-emission alert{csvResult.alerts_created !== 1 ? "s" : ""} generated.</div>
                )}
                {csvResult.errors && csvResult.errors.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {csvResult.errors.map((err, i) => (<div key={i} style={{ fontSize: 13, color: "#8a1f1f", marginBottom: 4 }}>{err}</div>))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
