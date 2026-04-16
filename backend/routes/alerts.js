const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

// GET /api/alerts — List all alerts
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, v.name AS vessel_name, v.imo_number
       FROM alerts a
       LEFT JOIN vessels v ON v.id = a.vessel_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/alerts/unread/count
router.get("/unread/count", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM alerts WHERE is_read = FALSE");
    return res.json({ unread: result.rows[0].count });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// PUT /api/alerts/:id/read — Mark one alert as read
router.put("/:id/read", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE alerts SET is_read = TRUE WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Alert not found" });
    return res.json({ message: "Alert marked as read" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// DELETE /api/alerts — Clear all alerts (Admin only)
router.delete("/", authenticateToken, authorizeRoles("Admin"), async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM alerts RETURNING id");
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)",
      [req.user.id, "CLEAR_ALERTS", "alert", JSON.stringify({ deleted_count: result.rowCount })]
    );
    return res.json({ message: `${result.rowCount} alerts cleared` });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
