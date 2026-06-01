/**
 * FloodVision Pro – server.js
 * ────────────────────────────
 * Main Express application entry point.
 *
 * Responsibilities:
 *  • Configure middleware stack (security, logging, CORS, body parsing)
 *  • Mount API router at /api/v1
 *  • Register global error handler
 *  • Start HTTP server
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const apiRouter = require("./routes/api");

// ── App initialisation ────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT || "5000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

// ── CORS ──────────────────────────────────────────────────────────────────────

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// In development allow all origins; in production restrict to the allowlist.
const corsOptions = {
  origin:
    NODE_ENV === "production"
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`CORS: origin '${origin}' not allowed`));
          }
        }
      : "*",
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // pre-flight

// ── Security headers (Helmet) ─────────────────────────────────────────────────

app.use(
  helmet({
    // Allow Leaflet tiles from CDN inside the browser
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ── Request logging ───────────────────────────────────────────────────────────

app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// ── Body parsing ──────────────────────────────────────────────────────────────

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60,             // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please slow down and retry in a moment.",
  },
});

app.use("/api/", apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/api/v1", apiRouter);

// Root redirect
app.get("/", (_req, res) => {
  res.json({
    service: "FloodVision Pro – Hydrological Early-Warning API",
    version: "1.0.0",
    docs: "/api/v1/health",
    endpoints: [
      "GET /api/v1/health",
      "GET /api/v1/risk-tiers",
      "GET /api/v1/predict-location?lat=<lat>&lon=<lon>&name=<optional>",
      "GET /api/v1/stream-districts?state=<optional>",
    ],
  });
});

// ── Global error handler ──────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message =
    NODE_ENV === "production" && status === 500
      ? "An internal server error occurred."
      : err.message || "Unknown error";

  if (status >= 500) {
    console.error("[ERROR]", err);
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// ── 404 fallback (non-API routes) ────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found." });
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   FloodVision Pro – Hydrological Early-Warning API   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  ▸ Environment : ${NODE_ENV}`);
  console.log(`  ▸ Listening   : http://localhost:${PORT}`);
  console.log(`  ▸ Health      : http://localhost:${PORT}/api/v1/health`);
  console.log(`  ▸ Predict     : http://localhost:${PORT}/api/v1/predict-location?lat=28.6&lon=77.2`);
  console.log("──────────────────────────────────────────────────────");
});

module.exports = app; // exported for integration tests
