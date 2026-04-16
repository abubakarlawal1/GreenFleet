import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function VoyageForm({ token }) {
  const navigate = useNavigate();
  const [vessels, setVessels] = useState([]);
  const [form, setForm] = useState({
    vessel_id: "", departure_port: "", arrival_port: "",
    voyage_date: "", distance_nm: "", duration_days: "",
    fuel_type: "HFO", fuel_tons: "",
  });
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get("/api/vessels", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setVessels(r.data))
      .catch(console.log);
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await api.post("/api/voyages", form, { headers: { Authorization: `Bearer ${token}` } });
      const em = res.data?.emissions;
      setMsg({
        type: "ok",
        text: `Voyage saved. Emissions: CO2 ${em?.co2_tons}t, NOx ${em?.nox_tons}t, SOx ${em?.sox_tons}t`,
      });
      setTimeout(() => navigate("/dashboard"), 1200);
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || err.message || "Failed" });
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 760, margin: "24px auto" }}>
        <h1 className="h1">Record Voyage</h1>
        <p className="muted">Enter voyage details. Emissions (CO2, NOx, SOx) are calculated automatically using IMO emission factors.</p>

        {msg?.type === "err" && <div className="alert">{msg.text}</div>}
        {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

        <form onSubmit={submit} className="grid-2">
          <div>
            <label>Vessel</label>
            <select value={form.vessel_id} onChange={set("vessel_id")} required>
              <option value="">Select vessel</option>
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.imo_number})</option>
              ))}
            </select>
          </div>
          <div>
            <label>Voyage Date</label>
            <input type="date" value={form.voyage_date} onChange={set("voyage_date")} />
          </div>

          <div>
            <label>Departure Port</label>
            <input value={form.departure_port} onChange={set("departure_port")} placeholder="e.g. Southampton" />
          </div>
          <div>
            <label>Arrival Port</label>
            <input value={form.arrival_port} onChange={set("arrival_port")} placeholder="e.g. Rotterdam" />
          </div>

          <div>
            <label>Distance (nautical miles)</label>
            <input type="number" value={form.distance_nm} onChange={set("distance_nm")} required />
          </div>
          <div>
            <label>Duration (days)</label>
            <input type="number" step="0.1" value={form.duration_days} onChange={set("duration_days")} placeholder="e.g. 3.5" />
          </div>

          <div>
            <label>Fuel Type</label>
            <select value={form.fuel_type} onChange={set("fuel_type")}>
              <option>HFO</option>
              <option>MDO</option>
              <option>MGO</option>
              <option>LNG</option>
            </select>
          </div>
          <div>
            <label>Fuel Consumed (tonnes)</label>
            <input type="number" step="0.001" value={form.fuel_tons} onChange={set("fuel_tons")} required />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <button className="btn" type="submit">Save Voyage</button>
          </div>
        </form>
      </div>
    </div>
  );
}
