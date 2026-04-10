const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { Parser } = require("json2csv");
const multer = require("multer");
const csvParser = require("csv-parser");
const { Readable } = require("stream");

// Multer stores uploaded CSV in memory (no disk needed for small files)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ------------------------------------------------------------------
// Emission factors (tonnes of emission per tonne of fuel burned)
// Source: IMO Fourth GHG Study 2020 — Table 1
// ------------------------------------------------------------------
const CO2_FACTOR = { HFO: 3.114, MDO: 3.206, MGO: 3.206, LNG: 2.750 };
const NOX_FACTOR = 0.07;
const SOX_FACTOR = 0.02;

function computeEmissions(fuel_type, fuel_tons) {
  const ft = Number(fuel_tons || 0);
  const factor = CO2_FACTOR[(fuel_type || "").toUpperCase()] || 3.114;
  return {
    co2_tons: Number((ft * factor).toFixed(3)),
    nox_tons: Number((ft * NOX_FACTOR).toFixed(3)),
    sox_tons: Number((ft * SOX_FACTOR).toFixed(3)),
  };
}

// Alert threshold: if CO2 exceeds this per voyage, flag it
const CO2_ALERT_THRESHOLD = 200;

// ------------------------------------------------------------------
// POST /api/voyages — Create a new voyage with auto-calculated emissions
// Roles: Admin, Sustainability Officer, Manager
// ------------------------------------------------------------------
router.post("/", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  const { vessel_id, departure_port, arrival_port, voyage_date, distance_nm, duration_hours, fuel_type, fuel_tons } = req.body;

  if (!vessel_id || !distance_nm || !fuel_tons) {
    return res.status(400).json({ message: "vessel_id, distance_nm, and fuel_tons are required" });
  }

  // Validate: no negative values
  if (Number(fuel_tons) <= 0 || Number(distance_nm) <= 0) {
    return res.status(400).json({ message: "fuel_tons and distance_nm must be positive numbers" });
  }

  const e = computeEmissions(fuel_type, fuel_tons);

  try {
    const result = await pool.query(
      `INSERT INTO voyages
        (vessel_id, departure_port, arrival_port, voyage_date, distance_nm, duration_hours,
         fuel_type, fuel_tons, co2_tons, nox_tons, sox_tons, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [vessel_id, departure_port || null, arrival_port || null, voyage_date || null,
       distance_nm, duration_hours || null, fuel_type || null, fuel_tons,
       e.co2_tons, e.nox_tons, e.sox_tons, req.user.id]
    );

    const voyageId = result.rows[0].id;

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "CREATE_VOYAGE", "voyage", voyageId, JSON.stringify({ vessel_id, fuel_tons, co2_tons: e.co2_tons })]
    );

    // Auto-generate alert if CO2 exceeds threshold
    if (e.co2_tons > CO2_ALERT_THRESHOLD) {
      await pool.query(
        `INSERT INTO alerts (vessel_id, voyage_id, alert_type, message, severity)
         VALUES ($1, $2, $3, $4, $5)`,
        [vessel_id, voyageId, "High Emission",
         `Voyage ${voyageId} produced ${e.co2_tons} tonnes of CO₂, exceeding the ${CO2_ALERT_THRESHOLD}t threshold.`,
         e.co2_tons > 500 ? "Critical" : "High"]
      );
    }

    return res.status(201).json({ message: "Voyage created", voyageId, emissions: e });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/voyages — List all voyages with vessel info
// ------------------------------------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, s.name AS vessel_name, s.imo_number
       FROM voyages v
       JOIN vessels s ON s.id = v.vessel_id
       ORDER BY v.id DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/voyages/summary — Dashboard summary statistics
// ------------------------------------------------------------------
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS voyages_count,
         COALESCE(SUM(co2_tons), 0) AS total_co2,
         COALESCE(SUM(nox_tons), 0) AS total_nox,
         COALESCE(SUM(sox_tons), 0) AS total_sox,
         COALESCE(SUM(fuel_tons), 0) AS total_fuel,
         COALESCE(SUM(distance_nm), 0) AS total_distance
       FROM voyages`
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/voyages/by-vessel/:vesselId — Voyages for a specific vessel
// ------------------------------------------------------------------
router.get("/by-vessel/:vesselId", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, s.name AS vessel_name, s.imo_number
       FROM voyages v
       JOIN vessels s ON s.id = v.vessel_id
       WHERE v.vessel_id = $1
       ORDER BY v.voyage_date DESC NULLS LAST`,
      [req.params.vesselId]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// PUT /api/voyages/:id — Update a voyage (recalculates emissions)
// ------------------------------------------------------------------
router.put("/:id", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  const { vessel_id, departure_port, arrival_port, voyage_date, distance_nm, duration_hours, fuel_type, fuel_tons } = req.body;

  if (!distance_nm || !fuel_tons) {
    return res.status(400).json({ message: "distance_nm and fuel_tons are required" });
  }

  const e = computeEmissions(fuel_type, fuel_tons);

  try {
    const result = await pool.query(
      `UPDATE voyages
       SET vessel_id = $1, departure_port = $2, arrival_port = $3, voyage_date = $4,
           distance_nm = $5, duration_hours = $6, fuel_type = $7, fuel_tons = $8,
           co2_tons = $9, nox_tons = $10, sox_tons = $11
       WHERE id = $12
       RETURNING id`,
      [vessel_id, departure_port || null, arrival_port || null, voyage_date || null,
       distance_nm, duration_hours || null, fuel_type || null, fuel_tons,
       e.co2_tons, e.nox_tons, e.sox_tons, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: "Voyage not found" });

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "UPDATE_VOYAGE", "voyage", req.params.id, JSON.stringify({ fuel_tons, co2_tons: e.co2_tons })]
    );

    return res.json({ message: "Voyage updated", voyageId: result.rows[0].id, emissions: e });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// DELETE /api/voyages/:id — Delete a voyage
// ------------------------------------------------------------------
router.delete("/:id", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM voyages WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Voyage not found" });

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)",
      [req.user.id, "DELETE_VOYAGE", "voyage", req.params.id]
    );

    return res.json({ message: "Voyage deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/voyages/export/csv — Export voyages as CSV
// Roles: Admin, Sustainability Officer, Manager
// ------------------------------------------------------------------
router.get("/export/csv", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.id, s.name AS vessel_name, s.imo_number, v.departure_port, v.arrival_port,
              v.voyage_date, v.distance_nm, v.duration_hours, v.fuel_type, v.fuel_tons,
              v.co2_tons, v.nox_tons, v.sox_tons, v.created_at
       FROM voyages v
       JOIN vessels s ON s.id = v.vessel_id
       ORDER BY v.id DESC`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No voyages to export" });
    }

    const fields = Object.keys(result.rows[0]);
    const parser = new Parser({ fields });
    const csv = parser.parse(result.rows);

    res.header("Content-Type", "text/csv");
    res.attachment("greenfleet_voyages.csv");
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// POST /api/voyages/import/csv — Bulk import voyages from CSV file
// Expected CSV columns: vessel_id, departure_port, arrival_port,
//   voyage_date, distance_nm, duration_hours, fuel_type, fuel_tons
// Roles: Admin, Sustainability Officer, Manager
// ------------------------------------------------------------------
router.post("/import/csv", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No CSV file uploaded. Use form field name 'file'." });
  }

  const rows = [];
  const errors = [];

  // Parse CSV from the uploaded buffer
  try {
    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer.toString());
      stream
        .pipe(csvParser())
        .on("data", (row) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });
  } catch (err) {
    return res.status(400).json({ message: "Failed to parse CSV file", error: err.message });
  }

  if (rows.length === 0) {
    return res.status(400).json({ message: "CSV file is empty or has no valid rows" });
  }

  let imported = 0;
  let alertsCreated = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // +2 because row 1 is the header

    // Validate required fields
    const vessel_id = parseInt(r.vessel_id);
    const distance_nm = parseFloat(r.distance_nm);
    const fuel_tons = parseFloat(r.fuel_tons);

    if (!vessel_id || isNaN(distance_nm) || isNaN(fuel_tons)) {
      errors.push(`Row ${rowNum}: missing or invalid vessel_id, distance_nm, or fuel_tons`);
      continue;
    }

    if (distance_nm <= 0 || fuel_tons <= 0) {
      errors.push(`Row ${rowNum}: distance_nm and fuel_tons must be positive`);
      continue;
    }

    const e = computeEmissions(r.fuel_type, fuel_tons);

    try {
      const result = await pool.query(
        `INSERT INTO voyages
          (vessel_id, departure_port, arrival_port, voyage_date, distance_nm, duration_hours,
           fuel_type, fuel_tons, co2_tons, nox_tons, sox_tons, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [vessel_id, r.departure_port || null, r.arrival_port || null,
         r.voyage_date || null, distance_nm, parseFloat(r.duration_hours) || null,
         r.fuel_type || null, fuel_tons, e.co2_tons, e.nox_tons, e.sox_tons, req.user.id]
      );

      imported++;

      // Auto-generate alert if needed
      if (e.co2_tons > CO2_ALERT_THRESHOLD) {
        await pool.query(
          `INSERT INTO alerts (vessel_id, voyage_id, alert_type, message, severity)
           VALUES ($1, $2, $3, $4, $5)`,
          [vessel_id, result.rows[0].id, "High Emission",
           `Imported voyage ${result.rows[0].id} produced ${e.co2_tons}t CO2, exceeding the ${CO2_ALERT_THRESHOLD}t threshold.`,
           e.co2_tons > 500 ? "Critical" : "High"]
        );
        alertsCreated++;
      }
    } catch (err) {
      errors.push(`Row ${rowNum}: ${err.message}`);
    }
  }

  // Audit log
  await pool.query(
    "INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)",
    [req.user.id, "IMPORT_CSV", "voyage", JSON.stringify({ total_rows: rows.length, imported, errors: errors.length })]
  );

  return res.json({
    message: `CSV import complete: ${imported} voyages imported, ${errors.length} errors`,
    imported,
    alerts_created: alertsCreated,
    total_rows: rows.length,
    errors: errors.slice(0, 20), // Return first 20 errors max
  });
});

module.exports = router;
