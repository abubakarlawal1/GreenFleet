require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const vesselsRoutes = require("./routes/vessels");
const voyagesRoutes = require("./routes/voyages");

const app = express();

// Allow requests from your deployed frontend and localhost for development
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json());

// Health check endpoint — useful for Vercel and monitoring
app.get("/api/health", (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/vessels", vesselsRoutes);
app.use("/api/voyages", voyagesRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`GreenFleet API running on port ${PORT}`));
