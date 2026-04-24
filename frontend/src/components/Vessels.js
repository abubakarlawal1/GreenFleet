import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";

export default function Vessels({ token, role }) {
  const [vessels, setVessels] = useState([]);
  const [msg, setMsg] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const canWrite = ["Admin", "Sustainability Officer", "Manager"].includes(role);

  const load = () => {
    api.get("/api/vessels", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setVessels(r.data))
      .catch((err) => setMsg({ type: "err", text: err.response?.data?.message || "Failed to load vessels" }));
  };

  useEffect(() => { load(); }, [token]);

  const startEdit = (v) => {
    setEditingId(v.id);
    setEditForm({
      name: v.name || "",
      imo_number: v.imo_number || "",
      vessel_type: v.vessel_type || "",
      flag_state: v.flag_state || "",
      gross_tonnage: v.gross_tonnage || "",
      fuel_type: v.fuel_type || "HFO",
      engine_type: v.engine_type || "",
      fuel_capacity: v.fuel_capacity || "",
      avg_speed: v.avg_speed || "",
    });
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/api/vessels/${id}`, editForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg({ type: "ok", text: "Vessel updated" });
      setEditingId(null);
      load();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed to update vessel" });
    }
  };

  const deleteVessel = async (id, name) => {
    if (!window.confirm(`Delete vessel "${name}"? This will also delete all its voyages. This cannot be undone.`)) return;
    try {
      await api.delete(`/api/vessels/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg({ type: "ok", text: "Vessel deleted" });
      load();
    } catch (err) {
      setMsg({ type: "err", text: err.response?.data?.message || "Failed to delete vessel" });
    }
  };

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="h1">Vessels</h1>
        {canWrite && <Link to="/vessels/new" className="btn btn-ghost">+ Add Vessel</Link>}
      </div>
      <p className="muted">Registered vessels in the fleet.</p>

      {msg?.type === "err" && <div className="alert">{msg.text}</div>}
      {msg?.type === "ok" && <div className="notice">{msg.text}</div>}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>IMO</th><th>Type</th><th>Flag</th>
              <th>GT</th><th>Fuel</th><th>Engine</th>
              {canWrite && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {vessels.map((v) => (
              editingId === v.id ? (
                <tr key={v.id}>
                  <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ padding: 4 }} /></td>
                  <td><input value={editForm.imo_number} onChange={(e) => setEditForm({ ...editForm, imo_number: e.target.value })} style={{ padding: 4 }} /></td>
                  <td>
                    <select value={editForm.vessel_type} onChange={(e) => setEditForm({ ...editForm, vessel_type: e.target.value })} style={{ padding: 4 }}>
                      <option value="">—</option>
                      <option>Bulk Carrier</option>
                      <option>Container Ship</option>
                      <option>Tanker</option>
                      <option>General Cargo</option>
                      <option>Ro-Ro Ship</option>
                      <option>LNG Carrier</option>
                      <option>Other</option>
                    </select>
                  </td>
                  <td><input value={editForm.flag_state} onChange={(e) => setEditForm({ ...editForm, flag_state: e.target.value })} style={{ padding: 4 }} /></td>
                  <td><input type="number" value={editForm.gross_tonnage} onChange={(e) => setEditForm({ ...editForm, gross_tonnage: e.target.value })} style={{ padding: 4, width: 80 }} /></td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 4 }}>
                      {["HFO", "VLSFO", "MDO", "MGO", "LSMGO", "LNG"].map((fuel) => {
                        const selected = (editForm.fuel_type || "").split(",").filter(Boolean);
                        const isChecked = selected.includes(fuel);
                        return (
                          <label key={fuel} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                let updated;
                                if (e.target.checked) {
                                  updated = [...selected, fuel];
                                } else {
                                  updated = selected.filter((f) => f !== fuel);
                                }
                                setEditForm({ ...editForm, fuel_type: updated.join(",") });
                              }}
                              style={{ transform: "scale(0.85)" }}
                            />
                            {fuel}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td><input value={editForm.engine_type} onChange={(e) => setEditForm({ ...editForm, engine_type: e.target.value })} style={{ padding: 4 }} /></td>
                  {canWrite && (
                    <td>
                      <button className="btn btn-ghost" style={{ marginRight: 4 }} onClick={() => saveEdit(v.id)}>Save</button>
                      <button className="btn btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  )}
                </tr>
              ) : (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong></td>
                  <td>{v.imo_number}</td>
                  <td>{v.vessel_type || "—"}</td>
                  <td>{v.flag_state || "—"}</td>
                  <td>{v.gross_tonnage || "—"}</td>
                  <td>{v.fuel_type ? v.fuel_type.split(",").join(", ") : "—"}</td>
                  <td>{v.engine_type || "—"}</td>
                  {canWrite && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost" style={{ marginRight: 4 }} onClick={() => startEdit(v)}>Edit</button>
                      <button className="btn btn-ghost" style={{ color: "#8a1f1f" }} onClick={() => deleteVessel(v.id, v.name)}>Delete</button>
                    </td>
                  )}
                </tr>
              )
            ))}
            {vessels.length === 0 && <tr><td colSpan={canWrite ? 8 : 7} className="muted">No vessels registered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
