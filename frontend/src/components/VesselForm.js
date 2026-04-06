import React, { useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

export default function VesselForm({ token }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", imo_number: "", vessel_type: "", flag_state: "",
    gross_tonnage: "", fuel_type: "HFO", engine_type: "",
    fuel_capacity: "", avg_speed: "",
  });
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post("/api/vessels", form, { headers: { Authorization: `Bearer ${token}` } });
      setMsg({ type: "ok", text: "Vessel registered successfully." });
      setTimeout(() => navigate("/dashboard"), 600);
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || err.message || "Failed" });
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 760, margin: "24px auto" }}>
        <h1 className="h1">Register Vessel</h1>
        <p className="muted">Add a new vessel to the fleet registry.</p>

        {msg?.type === "err" && <div className="alert">{msg.text}</div>}
        {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

        <form onSubmit={submit} className="grid-2">
          <div>
            <label>Vessel Name</label>
            <input value={form.name} onChange={set("name")} required />
          </div>
          <div>
            <label>IMO Number</label>
            <input value={form.imo_number} onChange={set("imo_number")} placeholder="e.g. IMO9876543" required />
          </div>

          <div>
            <label>Vessel Type</label>
            <select value={form.vessel_type} onChange={set("vessel_type")}>
              <option value="">Select type</option>
              <option>Bulk Carrier</option>
              <option>Container Ship</option>
              <option>Tanker</option>
              <option>General Cargo</option>
              <option>Ro-Ro Ship</option>
              <option>LNG Carrier</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label>Flag State</label>
            <input value={form.flag_state} onChange={set("flag_state")} placeholder="e.g. United Kingdom" />
          </div>

          <div>
            <label>Gross Tonnage (GT)</label>
            <input type="number" value={form.gross_tonnage} onChange={set("gross_tonnage")} placeholder="e.g. 45000" />
          </div>
          <div>
            <label>Default Fuel Type</label>
            <select value={form.fuel_type} onChange={set("fuel_type")}>
              <option>HFO</option>
              <option>MDO</option>
              <option>MGO</option>
              <option>LNG</option>
            </select>
          </div>

          <div>
            <label>Engine Type</label>
            <input value={form.engine_type} onChange={set("engine_type")} placeholder="e.g. 2-Stroke Diesel" />
          </div>
          <div>
            <label>Fuel Capacity (tonnes)</label>
            <input type="number" value={form.fuel_capacity} onChange={set("fuel_capacity")} />
          </div>

          <div>
            <label>Average Speed (knots)</label>
            <input type="number" step="0.1" value={form.avg_speed} onChange={set("avg_speed")} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <button className="btn" type="submit">Save Vessel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
