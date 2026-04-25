const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const multer = require("multer");
const csvParser = require("csv-parser");
const { Readable } = require("stream");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Emission factors - Source: IMO Fourth GHG Study 2020, Table 1
const CO2_FACTOR = { 
  HFO: 3.114, 
  VLSFO: 3.151, 
  MDO: 3.206, 
  MGO: 3.206, 
  LSMGO: 3.206, 
  LNG: 2.750 
};

// Convert various date formats to PostgreSQL-friendly yyyy-mm-dd
function normaliseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Already yyyy-mm-dd? Just return it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // dd/mm/yyyy or d/m/yyyy
  const slashMatch = trimmed.match(/^(\d{1,2})[/](\d{1,2})[/](\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // dd-mm-yyyy
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, d, m, y] = dashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Last resort: let JavaScript try
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null; 
}

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

const CO2_ALERT_THRESHOLD = 200;

// POST /api/voyages - Create voyage with auto-calculated emissions
router.post("/", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  const { vessel_id, departure_port, arrival_port, voyage_date, distance_nm, duration_days, fuel_type, fuel_tons } = req.body;

  if (!vessel_id || !distance_nm || !fuel_tons) {
    return res.status(400).json({ message: "vessel_id, distance_nm, and fuel_tons are required" });
  }
  if (Number(fuel_tons) <= 0 || Number(distance_nm) <= 0) {
    return res.status(400).json({ message: "fuel_tons and distance_nm must be positive numbers" });
  }

  const e = computeEmissions(fuel_type, fuel_tons);

  try {
    const result = await pool.query(
      `INSERT INTO voyages
        (vessel_id, departure_port, arrival_port, voyage_date, distance_nm, duration_days,
         fuel_type, fuel_tons, co2_tons, nox_tons, sox_tons, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [vessel_id, departure_port || null, arrival_port || null, voyage_date || null,
       distance_nm, duration_days || null, fuel_type || null, fuel_tons,
       e.co2_tons, e.nox_tons, e.sox_tons, req.user.id]
    );

    const voyageId = result.rows[0].id;

    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "CREATE_VOYAGE", "voyage", voyageId, JSON.stringify({ vessel_id, fuel_tons, co2_tons: e.co2_tons })]
    );

    if (e.co2_tons > CO2_ALERT_THRESHOLD) {
      await pool.query(
        `INSERT INTO alerts (vessel_id, voyage_id, alert_type, message, severity)
         VALUES ($1, $2, $3, $4, $5)`,
        [vessel_id, voyageId, "High Emission",
         `Voyage ${voyageId} produced ${e.co2_tons} tonnes of CO2, exceeding the ${CO2_ALERT_THRESHOLD}t threshold.`,
         e.co2_tons > 500 ? "Critical" : "High"]
      );
    }

    return res.status(201).json({ message: "Voyage created", voyageId, emissions: e });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/voyages - List all voyages
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

// GET /api/voyages/summary - Dashboard summary
// Supports optional ?vessel_id=X filter for per-vessel stats
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const vesselId = req.query.vessel_id;
    let query;
    let params = [];

    if (vesselId) {
      query = `SELECT
         COUNT(*)::int AS voyages_count,
         COALESCE(SUM(co2_tons), 0) AS total_co2,
         COALESCE(SUM(nox_tons), 0) AS total_nox,
         COALESCE(SUM(sox_tons), 0) AS total_sox,
         COALESCE(SUM(fuel_tons), 0) AS total_fuel,
         COALESCE(SUM(distance_nm), 0) AS total_distance
       FROM voyages WHERE vessel_id = $1`;
      params = [vesselId];
    } else {
      query = `SELECT
         COUNT(*)::int AS voyages_count,
         COALESCE(SUM(co2_tons), 0) AS total_co2,
         COALESCE(SUM(nox_tons), 0) AS total_nox,
         COALESCE(SUM(sox_tons), 0) AS total_sox,
         COALESCE(SUM(fuel_tons), 0) AS total_fuel,
         COALESCE(SUM(distance_nm), 0) AS total_distance
       FROM voyages`;
    }

    const result = await pool.query(query, params);
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/voyages/by-vessel/:vesselId
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

// DELETE /api/voyages/:id - Delete a voyage
router.delete("/:id", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM voyages WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Voyage not found" });

    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)",
      [req.user.id, "DELETE_VOYAGE", "voyage", req.params.id]
    );

    return res.json({ message: "Voyage deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// POST /api/voyages/import/csv - Bulk CSV import
router.post("/import/csv", authenticateToken, authorizeRoles("Admin", "Sustainability Officer", "Manager"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No CSV file uploaded. Use form field name 'file'." });

  const rows = [];
  const errors = [];

  try {
    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer.toString());
      stream.pipe(csvParser())
        .on("data", (row) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });
  } catch (err) {
    return res.status(400).json({ message: "Failed to parse CSV file", error: err.message });
  }

  if (rows.length === 0) return res.status(400).json({ message: "CSV file is empty or has no valid rows" });

  let imported = 0;
  let alertsCreated = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;

    // Accept either vessel_id or imo_number for vessel lookup
let vessel_id = parseInt(r.vessel_id);
const imoNumber = (r.imo_number || "").trim();

// If no vessel_id but imo_number is provided, look it up
if (!vessel_id && imoNumber) {
  try {
    const lookup = await pool.query(
      "SELECT id FROM vessels WHERE imo_number = $1",
      [imoNumber]
    );
    if (lookup.rows.length === 0) {
      errors.push(`Row ${rowNum}: vessel with IMO number "${imoNumber}" not found`);
      continue;
    }
    vessel_id = lookup.rows[0].id;
  } catch (err) {
    errors.push(`Row ${rowNum}: error looking up vessel by IMO: ${err.message}`);
    continue;
  }
}

const distance_nm = parseFloat(r.distance_nm);
const fuel_tons = parseFloat(r.fuel_tons);

if (!vessel_id || isNaN(distance_nm) || isNaN(fuel_tons)) {
  errors.push(`Row ${rowNum}: missing or invalid vessel_id/imo_number, distance_nm, or fuel_tons`);
  continue;
}

    const e = computeEmissions(r.fuel_type, fuel_tons);

    try {
      const result = await pool.query(
        `INSERT INTO voyages
          (vessel_id, departure_port, arrival_port, voyage_date, distance_nm, duration_days,
           fuel_type, fuel_tons, co2_tons, nox_tons, sox_tons, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [vessel_id, r.departure_port || null, r.arrival_port || null,
         normaliseDate(r.voyage_date), distance_nm, parseFloat(r.duration_days) || null,
         r.fuel_type || null, fuel_tons, e.co2_tons, e.nox_tons, e.sox_tons, req.user.id]
      );

      imported++;

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

  await pool.query(
    "INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)",
    [req.user.id, "IMPORT_CSV", "voyage", JSON.stringify({ total_rows: rows.length, imported, errors: errors.length })]
  );

  return res.json({
    message: `CSV import complete: ${imported} voyages imported, ${errors.length} errors`,
    imported,
    alerts_created: alertsCreated,
    total_rows: rows.length,
    errors: errors.slice(0, 20),
  });
});

module.exports = router;
