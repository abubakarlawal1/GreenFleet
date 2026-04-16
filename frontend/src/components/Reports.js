import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Reports({ token, role }) {
  const [vessels, setVessels] = useState([]);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({ vessel_id: "", report_type: "DCS", period_start: "", period_end: "" });
  const [activeReport, setActiveReport] = useState(null);
  const [activeReportId, setActiveReportId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const canGenerate = ["Admin", "Sustainability Officer"].includes(role);
  const canDelete = ["Admin", "Sustainability Officer"].includes(role);

  const loadReports = () => {
    api.get("/api/reports", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setReports(r.data)).catch(console.log);
  };

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    api.get("/api/vessels", { headers }).then((r) => setVessels(r.data)).catch(console.log);
    loadReports();
  }, [token]);

  const generate = async (e) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await api.post("/api/reports/generate", form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveReport(res.data.report);
      setActiveReportId(res.data.reportId);
      setMsg({ type: "ok", text: `Report generated (ID: ${res.data.reportId})` });
      loadReports();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed" });
    }
    setLoading(false);
  };

  const viewReport = async (id) => {
    try {
      const res = await api.get(`/api/reports/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setActiveReport(res.data.report_data);
      setActiveReportId(id);
    } catch (err) { console.log(err); }
  };

  const deleteReport = async (id) => {
    if (!window.confirm(`Delete report #${id}?`)) return;
    try {
      await api.delete(`/api/reports/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setMsg({ type: "ok", text: "Report deleted" });
      if (activeReportId === id) { setActiveReport(null); setActiveReportId(null); }
      loadReports();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed to delete" });
    }
  };

  const downloadPdf = (id) => {
    const baseUrl = process.env.REACT_APP_API_URL || "";
    const url = `${baseUrl}/api/reports/${id}/pdf`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `GreenFleet_Report_${id}.pdf`;
        a.click();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch((err) => console.log("PDF download error:", err));
  };

  const statusStyle = (status) => ({
    padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
    background: status === "Compliant" ? "#d7f0df" : status === "Non-Compliant" ? "#fde2e2" : "#fef3cd",
    color: status === "Compliant" ? "#165a2a" : status === "Non-Compliant" ? "#8a1f1f" : "#856404",
  });

  return (
    <div className="container">
      <h1 className="h1">Compliance Reports</h1>
      <p className="muted">Generate IMO DCS and EEXI compliance reports for individual vessels.</p>

      {canGenerate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="h2">Generate New Report</h2>
          {msg?.type === "err" && <div className="alert">{msg.text}</div>}
          {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

          <form onSubmit={generate} className="grid-2">
            <div>
              <label>Vessel</label>
              <select value={form.vessel_id} onChange={(e) => setForm({ ...form, vessel_id: e.target.value })} required>
                <option value="">Select vessel</option>
                {vessels.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.imo_number})</option>)}
              </select>
            </div>
            <div>
              <label>Report Type</label>
              <select value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value })}>
                <option value="DCS">IMO DCS</option>
                <option value="EEXI">EEXI</option>
                <option value="Fleet Summary">Fleet Summary</option>
              </select>
            </div>
            <div>
              <label>Period Start</label>
              <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} required />
            </div>
            <div>
              <label>Period End</label>
              <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} required />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="btn" type="submit" disabled={loading}>{loading ? "Generating..." : "Generate Report"}</button>
            </div>
          </form>
        </div>
      )}

      {activeReport && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="h2" style={{ margin: 0 }}>{activeReport.vessel?.name} — Compliance Report</h2>
            <button className="btn btn-ghost" onClick={() => downloadPdf(activeReportId)}>Download PDF</button>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div>
              <p className="muted" style={{ margin: "0 0 4px" }}>IMO Number: {activeReport.vessel?.imo_number}</p>
              <p className="muted" style={{ margin: "0 0 4px" }}>Vessel Type: {activeReport.vessel?.vessel_type || "N/A"}</p>
              <p className="muted" style={{ margin: "0 0 4px" }}>Flag State: {activeReport.vessel?.flag_state || "N/A"}</p>
              <p className="muted" style={{ margin: 0 }}>Gross Tonnage: {activeReport.vessel?.gross_tonnage || "N/A"} GT</p>
            </div>
            <div>
              <p className="muted" style={{ margin: "0 0 4px" }}>Period: {activeReport.period?.start} to {activeReport.period?.end}</p>
              <p className="muted" style={{ margin: "0 0 4px" }}>Voyages: {activeReport.summary?.voyage_count}</p>
              <p className="muted" style={{ margin: "0 0 4px" }}>EEOI: {activeReport.summary?.eeoi ?? "N/A"} g CO2/t·nm</p>
              <p style={{ margin: 0 }}><span style={statusStyle(activeReport.compliance_status)}>{activeReport.compliance_status}</span></p>
            </div>
          </div>

          <div className="grid-3" style={{ marginBottom: 16 }}>
            <div className="stat" style={{ border: "1px solid var(--border)", borderRadius: 14 }}>
              <div className="stat-k">Total CO2</div><div className="stat-v">{activeReport.summary?.total_co2} t</div>
            </div>
            <div className="stat" style={{ border: "1px solid var(--border)", borderRadius: 14 }}>
              <div className="stat-k">Total NOx</div><div className="stat-v">{activeReport.summary?.total_nox} t</div>
            </div>
            <div className="stat" style={{ border: "1px solid var(--border)", borderRadius: 14 }}>
              <div className="stat-k">Total SOx</div><div className="stat-v">{activeReport.summary?.total_sox} t</div>
            </div>
          </div>

          {activeReport.voyages && activeReport.voyages.length > 0 && (
            <>
              <h2 className="h2">Voyage Breakdown</h2>
              <table className="table">
                <thead><tr><th>Date</th><th>Route</th><th>Distance (nm)</th><th>Fuel (t)</th><th>CO2 (t)</th><th>NOx (t)</th><th>SOx (t)</th></tr></thead>
                <tbody>
                  {activeReport.voyages.map((v) => (
                    <tr key={v.id}>
                      <td>{v.voyage_date || "\u2014"}</td>
                      <td>{v.departure_port || "\u2014"} \u2192 {v.arrival_port || "\u2014"}</td>
                      <td>{v.distance_nm}</td><td>{v.fuel_tons}</td>
                      <td>{v.co2_tons}</td><td>{v.nox_tons}</td><td>{v.sox_tons}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="h2">Previous Reports</h2>
        {reports.length === 0 && <p className="muted">No reports generated yet.</p>}
        <table className="table">
          <thead><tr><th>ID</th><th>Vessel</th><th>Type</th><th>Period</th><th>CO2</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>#{r.id}</td>
                <td>{r.vessel_name}</td>
                <td>{r.report_type}</td>
                <td>{r.period_start} — {r.period_end}</td>
                <td>{Number(r.total_co2).toFixed(2)} t</td>
                <td><span style={statusStyle(r.compliance_status)}>{r.compliance_status}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost" style={{ marginRight: 4 }} onClick={() => viewReport(r.id)}>View</button>
                  <button className="btn btn-ghost" style={{ marginRight: 4 }} onClick={() => downloadPdf(r.id)}>PDF</button>
                  {canDelete && (
                    <button onClick={() => deleteReport(r.id)} title="Delete report"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 4 }}>
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
