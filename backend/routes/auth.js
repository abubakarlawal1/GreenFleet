const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

const ALLOWED_ROLES = ["Admin", "Sustainability Officer", "Manager", "Viewer"];

// ------------------------------------------------------------------
// POST /api/auth/bootstrap — Create first Admin (only if no users exist)
// ------------------------------------------------------------------
router.post("/bootstrap", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    const countResult = await pool.query("SELECT COUNT(*) AS total FROM users");
    if (parseInt(countResult.rows[0].total) > 0) {
      return res.status(400).json({ message: "Bootstrap disabled: users already exist" });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, 'Admin') RETURNING id",
      [username, email || null, hash]
    );

    return res.status(201).json({
      message: "Admin created",
      userId: result.rows[0].id,
      role: "Admin",
    });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ message: "Username or email already exists" });
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/login — Authenticate user and return JWT
// ------------------------------------------------------------------
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const role = (user.role || "").trim();
    const token = jwt.sign(
      { id: user.id, role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    // Log the login action
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)",
      [user.id, "LOGIN", "user", JSON.stringify({ username: user.username })]
    );

    return res.json({ token, role, username: user.username });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/auth/me — Get current user info from token
// ------------------------------------------------------------------
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/users — Admin creates a new user
// ------------------------------------------------------------------
router.post("/users", authenticateToken, authorizeRoles("Admin"), async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ message: "Username, password, and role are required" });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: `Role must be one of: ${ALLOWED_ROLES.join(", ")}` });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id",
      [username, email || null, hash, role]
    );

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "CREATE_USER", "user", result.rows[0].id, JSON.stringify({ username, role })]
    );

    return res.status(201).json({
      message: "User created",
      userId: result.rows[0].id,
      username,
      role,
    });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ message: "Username or email already exists" });
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/auth/users — Admin lists all users
// ------------------------------------------------------------------
router.get("/users", authenticateToken, authorizeRoles("Admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, created_at FROM users ORDER BY id ASC"
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// PUT /api/auth/users/:id — Admin updates a user's role
// ------------------------------------------------------------------
router.put("/users/:id", authenticateToken, authorizeRoles("Admin"), async (req, res) => {
  const { role } = req.body;
  const userId = req.params.id;

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: `Role must be one of: ${ALLOWED_ROLES.join(", ")}` });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, role",
      [role, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "UPDATE_USER_ROLE", "user", userId, JSON.stringify({ newRole: role })]
    );

    return res.json({ message: "User role updated", user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// DELETE /api/auth/users/:id — Admin deletes a user
// ------------------------------------------------------------------
router.delete("/users/:id", authenticateToken, authorizeRoles("Admin"), async (req, res) => {
  const userId = req.params.id;

  // Prevent admin from deleting themselves
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id, username",
      [userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "DELETE_USER", "user", userId, JSON.stringify({ deletedUser: result.rows[0].username })]
    );

    return res.json({ message: "User deleted", user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
