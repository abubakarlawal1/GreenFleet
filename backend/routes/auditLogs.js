const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

// ------------------------------------------------------------------
// GET /api/audit-logs — Admin views audit trail
// ------------------------------------------------------------------
router.get("/", authenticateToken, authorizeRoles("Admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.username
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT 200`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
