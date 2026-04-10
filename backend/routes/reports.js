const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const PDFDocument = require("pdfkit");

// ------------------------------------------------------------------
// POST /api/reports/generate
// Generate a compliance report for a vessel over a date range
// Roles: Admin, Sustainability Officer
// ------------------------------------------------------------------
router.post("/generate", authenticateToken, authorizeRoles("Admin", "Sustainability Officer"), async (req, res) => {
  const { vessel_id, report_type, period_start, period_end } = req.body;

  if (!vessel_id || !period_start || !period_end) {
    return res.status(400).json({ message: "vessel_id, period_start, and period_end are required" });
  }

  try {
    // Get vessel info
    const vesselResult = await pool.query("SELECT * FROM vessels WHERE id = $1", [vessel_id]);
    if (vesselResult.rows.length === 0) {
      return res.status(404).json({ message: "Vessel not found" });
    }
    const vessel = vesselResult.rows[0];

    // Aggregate voyage data for the period
    const voyageResult = await pool.query(
      `SELECT
         COUNT(*)::int AS voyage_count,
         COALESCE(SUM(co2_tons), 0) AS total_co2,
         COALESCE(SUM(nox_tons), 0) AS total_nox,
         COALESCE(SUM(sox_tons), 0) AS total_sox,
         COALESCE(SUM(fuel_tons), 0) AS total_fuel,
         COALESCE(SUM(distance_nm), 0) AS total_distance,
         COALESCE(AVG(co2_tons), 0) AS avg_co2_per_voyage,
         MIN(voyage_date) AS first_voyage,
         MAX(voyage_date) AS last_voyage
       FROM voyages
       WHERE vessel_id = $1 AND voyage_date >= $2 AND voyage_date <= $3`,
      [vessel_id, period_start, period_end]
    );
    const stats = voyageResult.rows[0];

    // Get individual voyages for the breakdown
    const voyagesDetail = await pool.query(
      `SELECT id, departure_port, arrival_port, voyage_date, distance_nm,
              fuel_type, fuel_tons, co2_tons, nox_tons, sox_tons
       FROM voyages
       WHERE vessel_id = $1 AND voyage_date >= $2 AND voyage_date <= $3
       ORDER BY voyage_date ASC`,
      [vessel_id, period_start, period_end]
    );

    // Calculate EEOI (Energy Efficiency Operational Indicator)
    // EEOI = Total CO2 / (Total Distance × Gross Tonnage)
    // Unit: grams CO2 per tonne-nautical mile
    let eeoi = null;
    if (stats.total_distance > 0 && vessel.gross_tonnage > 0) {
      eeoi = (Number(stats.total_co2) * 1000000) / (Number(stats.total_distance) * Number(vessel.gross_tonnage));
      eeoi = Number(eeoi.toFixed(4));
    }

    // Determine compliance status based on EEOI thresholds
    // Reference: IMO MEPC.1/Circ.684 — Guidelines for EEOI Calculation
    let compliance_status = "Pending";
    if (eeoi !== null) {
      if (eeoi <= 15) compliance_status = "Compliant";
      else compliance_status = "Non-Compliant";
    }

    // Build the full report data object
    const reportData = {
      vessel: {
        name: vessel.name,
        imo_number: vessel.imo_number,
        vessel_type: vessel.vessel_type,
        flag_state: vessel.flag_state,
        gross_tonnage: vessel.gross_tonnage,
      },
      period: { start: period_start, end: period_end },
      summary: {
        voyage_count: stats.voyage_count,
        total_co2: Number(Number(stats.total_co2).toFixed(3)),
        total_nox: Number(Number(stats.total_nox).toFixed(3)),
        total_sox: Number(Number(stats.total_sox).toFixed(3)),
        total_fuel: Number(Number(stats.total_fuel).toFixed(3)),
        total_distance: Number(Number(stats.total_distance).toFixed(2)),
        avg_co2_per_voyage: Number(Number(stats.avg_co2_per_voyage).toFixed(3)),
        eeoi: eeoi,
      },
      voyages: voyagesDetail.rows,
      compliance_status: compliance_status,
    };

    // Save the report to database
    const insertResult = await pool.query(
      `INSERT INTO compliance_reports
        (vessel_id, report_type, period_start, period_end, total_co2, total_nox,
         total_sox, total_fuel, total_distance, compliance_status, report_data, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [vessel_id, report_type || "DCS", period_start, period_end,
       stats.total_co2, stats.total_nox, stats.total_sox, stats.total_fuel,
       stats.total_distance, compliance_status, JSON.stringify(reportData), req.user.id]
    );

    // Audit log
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [req.user.id, "GENERATE_REPORT", "compliance_report", insertResult.rows[0].id,
       JSON.stringify({ vessel_name: vessel.name, report_type: report_type || "DCS" })]
    );

    return res.status(201).json({
      message: "Compliance report generated",
      reportId: insertResult.rows[0].id,
      report: reportData,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/reports
// List all generated reports
// Roles: Admin, Sustainability Officer, Viewer (read-only)
// ------------------------------------------------------------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cr.id, cr.report_type, cr.period_start, cr.period_end,
              cr.total_co2, cr.compliance_status, cr.generated_at,
              v.name AS vessel_name, v.imo_number
       FROM compliance_reports cr
       JOIN vessels v ON v.id = cr.vessel_id
       ORDER BY cr.generated_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/reports/:id
// Get a single report with full data
// ------------------------------------------------------------------
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cr.*, v.name AS vessel_name, v.imo_number
       FROM compliance_reports cr
       JOIN vessels v ON v.id = cr.vessel_id
       WHERE cr.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Report not found" });

    const report = result.rows[0];
    // Parse the stored JSON report data
    if (report.report_data && typeof report.report_data === "string") {
      report.report_data = JSON.parse(report.report_data);
    }
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------------------------------------------
// GET /api/reports/:id/pdf — Download a compliance report as PDF
// ------------------------------------------------------------------
router.get("/:id/pdf", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cr.*, v.name AS vessel_name, v.imo_number
       FROM compliance_reports cr
       JOIN vessels v ON v.id = cr.vessel_id
       WHERE cr.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Report not found" });

    const report = result.rows[0];
    let data = report.report_data;
    if (typeof data === "string") data = JSON.parse(data);

    // Create PDF document
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=GreenFleet_Report_${report.id}.pdf`);
    doc.pipe(res);

    // --- Header ---
    doc.fontSize(22).font("Helvetica-Bold").text("GreenFleet", { align: "center" });
    doc.fontSize(10).font("Helvetica").text("Carbon Emission Management System for Maritime Vessels", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
    doc.moveDown(1);

    // --- Report title ---
    doc.fontSize(16).font("Helvetica-Bold")
      .text(`${report.report_type} Compliance Report`, { align: "center" });
    doc.moveDown(0.5);

    // --- Vessel details ---
    doc.fontSize(12).font("Helvetica-Bold").text("Vessel Information");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    doc.text(`Vessel Name: ${data.vessel?.name || report.vessel_name}`);
    doc.text(`IMO Number: ${data.vessel?.imo_number || report.imo_number}`);
    doc.text(`Vessel Type: ${data.vessel?.vessel_type || "N/A"}`);
    doc.text(`Flag State: ${data.vessel?.flag_state || "N/A"}`);
    doc.text(`Gross Tonnage: ${data.vessel?.gross_tonnage || "N/A"} GT`);
    doc.moveDown(1);

    // --- Reporting period ---
    doc.fontSize(12).font("Helvetica-Bold").text("Reporting Period");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    doc.text(`Start: ${report.period_start}`);
    doc.text(`End: ${report.period_end}`);
    doc.text(`Report Generated: ${new Date(report.generated_at).toLocaleString()}`);
    doc.moveDown(1);

    // --- Emission summary ---
    doc.fontSize(12).font("Helvetica-Bold").text("Emission Summary");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    doc.text(`Total Voyages: ${data.summary?.voyage_count || 0}`);
    doc.text(`Total Distance: ${data.summary?.total_distance || 0} nautical miles`);
    doc.text(`Total Fuel Consumed: ${data.summary?.total_fuel || 0} tonnes`);
    doc.moveDown(0.3);
    doc.text(`Total CO\u2082 Emissions: ${data.summary?.total_co2 || 0} tonnes`);
    doc.text(`Total NOx Emissions: ${data.summary?.total_nox || 0} tonnes`);
    doc.text(`Total SOx Emissions: ${data.summary?.total_sox || 0} tonnes`);
    doc.text(`Average CO\u2082 per Voyage: ${data.summary?.avg_co2_per_voyage || 0} tonnes`);
    doc.moveDown(0.5);
    doc.text(`EEOI (Energy Efficiency Operational Indicator): ${data.summary?.eeoi ?? "N/A"} g CO\u2082/t\u00b7nm`);
    doc.moveDown(1);

    // --- Compliance status ---
    const status = data.compliance_status || report.compliance_status || "Pending";
    doc.fontSize(12).font("Helvetica-Bold").text("Compliance Status");
    doc.moveDown(0.3);
    doc.fontSize(14).font("Helvetica-Bold");
    if (status === "Compliant") doc.fillColor("green");
    else if (status === "Non-Compliant") doc.fillColor("red");
    else doc.fillColor("orange");
    doc.text(status);
    doc.fillColor("black");
    doc.moveDown(1);

    // --- Voyage breakdown table ---
    if (data.voyages && data.voyages.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Voyage Breakdown");
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      const col = { date: 50, route: 120, dist: 260, fuel: 330, co2: 400, nox: 460, sox: 510 };

      doc.fontSize(8).font("Helvetica-Bold");
      doc.text("Date", col.date, tableTop);
      doc.text("Route", col.route, tableTop);
      doc.text("Dist (nm)", col.dist, tableTop);
      doc.text("Fuel (t)", col.fuel, tableTop);
      doc.text("CO2 (t)", col.co2, tableTop);
      doc.text("NOx (t)", col.nox, tableTop);
      doc.text("SOx (t)", col.sox, tableTop);

      doc.moveTo(50, tableTop + 14).lineTo(555, tableTop + 14).stroke("#cccccc");

      let y = tableTop + 20;
      doc.fontSize(8).font("Helvetica");

      for (const v of data.voyages) {
        if (y > 750) {
          doc.addPage();
          y = 50;
        }

        const route = `${v.departure_port || "-"} > ${v.arrival_port || "-"}`;

        doc.text(v.voyage_date || "-", col.date, y, { width: 65 });
        doc.text(route, col.route, y, { width: 130 });
        doc.text(String(v.distance_nm), col.dist, y);
        doc.text(String(v.fuel_tons), col.fuel, y);
        doc.text(String(v.co2_tons), col.co2, y);
        doc.text(String(v.nox_tons), col.nox, y);
        doc.text(String(v.sox_tons), col.sox, y);

        y += 16;
      }
    }

    // --- Footer ---
    doc.moveDown(2);
    doc.fontSize(8).font("Helvetica").fillColor("#999999");
    doc.text(
      "This report was generated by GreenFleet in alignment with IMO Data Collection System (DCS) and EEXI reporting guidelines. " +
      "Emission factors are based on the IMO Fourth GHG Study 2020.",
      50, doc.y, { width: 500, align: "center" }
    );

    doc.end();
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
