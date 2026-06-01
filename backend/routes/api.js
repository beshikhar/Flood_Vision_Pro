/**
 * FloodVision Pro – api.js (Router)
 * ──────────────────────────────────
 * Mounts all public API routes under the /api/v1 namespace.
 *
 * Routes:
 *  GET /api/v1/predict-location  – live rainfall + flood risk for a coordinate
 *  GET /api/v1/stream-districts  – Indian district boundary GeoJSON proxy
 *  GET /api/v1/health            – lightweight liveness probe
 *  GET /api/v1/risk-tiers        – expose the risk classification table
 */

"use strict";

const { Router } = require("express");
const {
  predictLocation,
  streamDistricts,
  RISK_TIERS,
} = require("../controllers/floodController");

const router = Router();

// ── GET /api/v1/health ────────────────────────────────────────────────────────
/**
 * Liveness probe for load-balancers, Docker HEALTHCHECK, and uptime monitors.
 */
router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "FloodVision Pro API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── GET /api/v1/risk-tiers ────────────────────────────────────────────────────
/**
 * Returns the complete risk classification table used by the risk engine.
 * Useful for the frontend to render legends and colourscales without
 * hardcoding values.
 */
router.get("/risk-tiers", (_req, res) => {
  const tiers = RISK_TIERS.map((t) => ({
    label: t.label,
    shortLabel: t.shortLabel,
    color: t.color,
    bgColor: t.bgColor,
    minMmHr: t.minMmHr,
    maxMmHr: t.maxMmHr === Infinity ? null : t.maxMmHr,
    description: t.description,
    imdClass: t.imdClass,
    actionRequired: t.actionRequired,
  }));

  res.status(200).json({
    success: true,
    source: "IMD (India Meteorological Department) rainfall classification",
    tiers,
  });
});

// ── GET /api/v1/predict-location ──────────────────────────────────────────────
/**
 * @query lat  {number} Latitude  (required) – decimal degrees, WGS-84
 * @query lon  {number} Longitude (required) – decimal degrees, WGS-84
 * @query name {string} Optional human-readable location label
 *
 * Returns live rainfall data + flood risk assessment.
 *
 * Example:
 *   /api/v1/predict-location?lat=25.5941&lon=85.1376&name=Patna%2C%20Bihar
 */
router.get("/predict-location", predictLocation);

// ── GET /api/v1/stream-districts ─────────────────────────────────────────────
/**
 * Streams Indian district boundary GeoJSON from DataMeet's open dataset.
 *
 * @query state {string} Optional – filter features by state name substring
 *                        e.g. ?state=kerala  →  only Kerala districts
 *
 * Example:
 *   /api/v1/stream-districts
 *   /api/v1/stream-districts?state=assam
 */
router.get("/stream-districts", streamDistricts);

// ── 404 catch-all for /api/v1/* ───────────────────────────────────────────────
router.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint not found.",
    hint: "Valid endpoints: /health, /risk-tiers, /predict-location, /stream-districts",
  });
});

module.exports = router;
