const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

// ------------------------------------------------------------------
// Green technology knowledge base
// Each rule checks vessel characteristics and emission data to suggest
// appropriate emission-reduction technologies
// Sources: IMO Fourth GHG Study 2020, DNV Maritime Forecast 2023
// ------------------------------------------------------------------
const TECHNOLOGY_DATABASE = [
  {
    technology: "Wind-Assisted Propulsion (Rotor Sails)",
    category: "Propulsion",
    description: "Flettner rotor sails use the Magnus effect to harness wind energy, reducing fuel consumption. Most effective on vessels with regular routes and sufficient deck space.",
    estimated_reduction_pct: 10,
    source_reference: "Norsepower (2023) — Rotor Sail Performance Validation, IMO MEPC 80",
    conditions: (vessel, stats) =>
      ["Bulk Carrier", "Tanker", "General Cargo", "Ro-Ro Ship"].includes(vessel.vessel_type) &&
      (vessel.gross_tonnage || 0) >= 20000,
  },
  {
    technology: "Hull Air Lubrication System",
    category: "Hull",
    description: "Injects micro-bubbles beneath the hull to reduce frictional resistance between the hull and seawater. Proven effective on flat-bottomed vessels operating at moderate speeds.",
    estimated_reduction_pct: 8,
    source_reference: "Samsung Heavy Industries (2022) — SAVER Air System Trial Results",
    conditions: (vessel, stats) =>
      ["Bulk Carrier", "Tanker", "Container Ship", "LNG Carrier"].includes(vessel.vessel_type) &&
      (vessel.avg_speed || 0) <= 18,
  },
  {
    technology: "Hull Coating Optimisation (Anti-Fouling)",
    category: "Hull",
    description: "Advanced silicone-based anti-fouling coatings reduce hull roughness and biofouling, lowering hydrodynamic drag and fuel consumption over time.",
    estimated_reduction_pct: 5,
    source_reference: "AkzoNobel / International Paint (2023) — Intersleek Performance Data",
    conditions: (vessel, stats) => true, // applicable to all vessels
  },
  {
    technology: "LNG Fuel Conversion (Dual-Fuel Engine)",
    category: "Fuel",
    description: "Converting to LNG as primary fuel significantly reduces CO₂, NOx, and SOx emissions compared to HFO/MDO. Requires engine modification and bunkering infrastructure access.",
    estimated_reduction_pct: 20,
    source_reference: "DNV (2023) — Maritime Forecast to 2050: Alternative Fuels Outlook",
    conditions: (vessel, stats) =>
      stats.primary_fuel !== "LNG" &&
      (vessel.gross_tonnage || 0) >= 15000,
  },
  {
    technology: "Biofuel Blending (B20-B30)",
    category: "Fuel",
    description: "Blending 20-30% biodiesel (FAME) with conventional marine fuel reduces net CO₂ without engine modifications. Drop-in solution suitable for existing fleet.",
    estimated_reduction_pct: 12,
    source_reference: "GoodFuels (2023) — Marine Biofuel Performance Report",
    conditions: (vessel, stats) =>
      ["HFO", "MDO", "MGO"].includes(stats.primary_fuel),
  },
  {
    technology: "Waste Heat Recovery System",
    category: "Operations",
    description: "Captures exhaust gas heat to generate electricity or supplement propulsion, improving overall energy efficiency of the vessel's power plant.",
    estimated_reduction_pct: 6,
    source_reference: "MAN Energy Solutions (2023) — Waste Heat Recovery for Two-Stroke Engines",
    conditions: (vessel, stats) =>
      (vessel.engine_type || "").toLowerCase().includes("stroke") &&
      (vessel.gross_tonnage || 0) >= 25000,
  },
  {
    technology: "Speed Reduction (Slow Steaming)",
    category: "Operations",
    description: "Reducing operational speed by 10-20% can cut fuel consumption significantly due to the cubic relationship between speed and resistance. Requires schedule adjustments.",
    estimated_reduction_pct: 15,
    source_reference: "IMO (2023) — EEXI Technical Guidelines, MEPC.1/Circ.896",
    conditions: (vessel, stats) =>
      (vessel.avg_speed || 0) > 14 &&
      stats.avg_co2_per_voyage > 100,
  },
  {
    technology: "Route Optimisation Software",
    category: "Operations",
    description: "Weather routing and voyage planning software optimises routes to minimise fuel consumption by avoiding adverse currents and weather patterns.",
    estimated_reduction_pct: 4,
    source_reference: "DTN / StormGeo (2023) — Fleet Performance Management Solutions",
    conditions: (vessel, stats) =>
      stats.total_voyages >= 2 &&
      stats.avg_distance > 200,
  },
  {
    technology: "Propeller Boss Cap Fins (PBCF)",
    category: "Propulsion",
    description: "Small fins attached to the propeller boss cap recover energy from the hub vortex, improving propulsive efficiency with minimal installation complexity.",
    estimated_reduction_pct: 3,
    source_reference: "MOL Techno-Trade (2022) — PBCF Efficiency Improvement Data",
    conditions: (vessel, stats) => (vessel.gross_tonnage || 0) >= 10000,
  },
  {
    technology: "Shore Power Connection (Cold Ironing)",
    category: "Operations",
    description: "Connecting to shore-side electricity supply while at berth eliminates auxiliary engine emissions during port stays. Requires compatible port infrastructure.",
    estimated_reduction_pct: 3,
    source_reference: "EU Alternative Fuels Infrastructure Regulation (AFIR) 2023",
    conditions: (vessel, stats) =>
      ["Container Ship", "Ro-Ro Ship", "LNG Carrier"].includes(vessel.vessel_type),
  },
];

// ------------------------------------------------------------------
// POST /api/recommendations/generate/:vesselId
// Generate recommendations for a specific vessel
// Roles: Admin, Sustainability Officer
// ------------------------------------------------------------------
router.post("/generate/:vesselId", authenticateToken, authorizeRoles("Admin", "Sustainability Officer"), async (req, res) => {
  const vesselId = req.params.vesselId;

  try {
    // Get vessel details
    const vesselResult = await pool.query("SELECT * FROM vessels WHERE id = $1", [vesselId]);
    if (vesselResult.rows.length === 0) {
      return res.status(404).json({ message: "Vessel not found" });
    }
    const vessel = vesselResult.rows[0];

    // Get voyage statistics for this vessel
    const statsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_voyages,
         COALESCE(AVG(co2_tons), 0) AS avg_co2_per_voyage,
         COALESCE(SUM(co2_tons), 0) AS total_co2,
         COALESCE(AVG(distance_nm), 0) AS avg_distance,
         COALESCE(AVG(fuel_tons), 0) AS avg_fuel_per_voyage,
         MODE() WITHIN GROUP (ORDER BY fuel_type) AS primary_fuel
       FROM voyages WHERE vessel_id = $1`,
      [vesselId]
    );
    const stats = statsResult.rows[0];

    // Clear previous recommendations for this vessel
    await pool.query("DELETE FROM recommendations WHERE vessel_id = $1", [vesselId]);

    // Evaluate each technology against the vessel's profile
    const matched = [];
    for (const tech of TECHNOLOGY_DATABASE) {
      if (tech.conditions(vessel, stats)) {
        const result = await pool.query(
          `INSERT INTO recommendations
            (vessel_id, technology, category, description, estimated_reduction_pct, source_reference, generated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [vesselId, tech.technology, tech.category, tech.description,
           tech.estimated_reduction_pct, tech.source_reference, req.user.id]
        );
        matched.push({
          id: result.rows[0].id,
          technology: tech.technology,
          category: tech.category,
          description: tech.description,
          estimated_reduction_pct: tech.estimated_reduction_pct,
          source_reference: tech.source_reference,
        });
      }
    }

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "GENERATE_RECOMMENDATIONS", "vessel", vesselId,
       JSON.stringify({ vessel_name: vessel.name, recommendations_count: matched.length })]
    );

    return res.json({
      vessel: { id: vessel.id, name: vessel.name, imo_number: vessel.imo_number },
      voyage_stats: {
        total_voyages: stats.total_voyages,
        avg_co2_per_voyage: Number(Number(stats.avg_co2_per_voyage).toFixed(2)),
        total_co2: Number(Number(stats.total_co2).toFixed(2)),
        primary_fuel: stats.primary_fuel || "N/A",
      },
      recommendations: matched,
      total_potential_reduction: matched.reduce((sum, r) => sum + r.estimated_reduction_pct, 0),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/recommendations/:vesselId
// Get stored recommendations for a vessel
// Roles: Admin, Sustainability Officer
// ------------------------------------------------------------------
router.get("/:vesselId", authenticateToken, authorizeRoles("Admin", "Sustainability Officer"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, v.name AS vessel_name, v.imo_number
       FROM recommendations r
       JOIN vessels v ON v.id = r.vessel_id
       WHERE r.vessel_id = $1
       ORDER BY r.estimated_reduction_pct DESC`,
      [req.params.vesselId]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/recommendations
// Get all recommendations across fleet
// Roles: Admin, Sustainability Officer
// ------------------------------------------------------------------
router.get("/", authenticateToken, authorizeRoles("Admin", "Sustainability Officer"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, v.name AS vessel_name, v.imo_number
       FROM recommendations r
       JOIN vessels v ON v.id = r.vessel_id
       ORDER BY r.generated_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
