const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

// ------------------------------------------------------------------
// POST /api/vessels — Create a new vessel (Admin, Sustainability Officer, Manager)
// ------------------------------------------------------------------
router.post("/", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  const { name, imo_number, vessel_type, flag_state, gross_tonnage, fuel_type, engine_type, fuel_capacity, avg_speed } = req.body;

  if (!name || !imo_number) {
    return res.status(400).json({ message: "Vessel name and IMO number are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO vessels (name, imo_number, vessel_type, flag_state, gross_tonnage, fuel_type, engine_type, fuel_capacity, avg_speed, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [name, imo_number, vessel_type || null, flag_state || null, gross_tonnage || null,
       fuel_type || null, engine_type || null, fuel_capacity || null, avg_speed || null, req.user.id]
    );

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "CREATE_VESSEL", "vessel", result.rows[0].id, JSON.stringify({ name, imo_number })]
    );

    return res.status(201).json({ message: "Vessel created", vesselId: result.rows[0].id });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ message: "A vessel with this IMO number already exists" });
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/vessels — List all vessels (all authenticated users)
// ------------------------------------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM vessels ORDER BY id DESC");
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/vessels/:id — Get a single vessel by ID
// ------------------------------------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM vessels WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Vessel not found" });
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// PUT /api/vessels/:id — Update a vessel (Admin, Sustainability Officer, Manager)
// ------------------------------------------------------------------
router.put("/:id", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  const { name, imo_number, vessel_type, flag_state, gross_tonnage, fuel_type, engine_type, fuel_capacity, avg_speed } = req.body;

  try {
    const result = await pool.query(
      `UPDATE vessels
       SET name = $1, imo_number = $2, vessel_type = $3, flag_state = $4, gross_tonnage = $5,
           fuel_type = $6, engine_type = $7, fuel_capacity = $8, avg_speed = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING id, name`,
      [name, imo_number, vessel_type || null, flag_state || null, gross_tonnage || null,
       fuel_type || null, engine_type || null, fuel_capacity || null, avg_speed || null, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Vessel not found" });

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "UPDATE_VESSEL", "vessel", req.params.id, JSON.stringify({ name, imo_number })]
    );

    return res.json({ message: "Vessel updated", vessel: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ message: "A vessel with this IMO number already exists" });
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// DELETE /api/vessels/:id — Delete a vessel (Admin, Sustainability Officer, Manager)
// ------------------------------------------------------------------
router.delete("/:id", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM vessels WHERE id = $1 RETURNING id, name",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Vessel not found" });

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "DELETE_VESSEL", "vessel", req.params.id, JSON.stringify({ deletedVessel: result.rows[0].name })]
    );

    return res.json({ message: "Vessel deleted", vessel: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
