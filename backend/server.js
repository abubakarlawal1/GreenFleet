require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const vesselsRoutes = require("./routes/vessels");
const voyagesRoutes = require("./routes/voyages");
const recommendationsRoutes = require("./routes/recommendations");
const reportsRoutes = require("./routes/reports");
const alertsRoutes = require("./routes/alerts");
const auditLogsRoutes = require("./routes/auditLogs");

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/vessels", vesselsRoutes);
app.use("/api/voyages", voyagesRoutes);
app.use("/api/recommendations", recommendationsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/audit-logs", auditLogsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`GreenFleet API running on port ${PORT}`));
