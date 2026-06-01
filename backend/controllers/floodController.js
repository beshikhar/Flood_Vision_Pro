/**
 * FloodVision Pro – floodController.js
 * ─────────────────────────────────────
 * Core controller handling:
 *   • Live rainfall ingest from Open-Meteo API (streaming, no local files)
 *   • Heuristic flood-risk calculation engine
 *   • Indian district boundary streaming from DataMeet GeoJSON
 *   • Structured, colour-coded risk response objects
 */

"use strict";

const axios = require("axios");
require("dotenv").config();

// ── Constants ─────────────────────────────────────────────────────────────────

const OPEN_METEO_BASE_URL =
  process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast";

const DISTRICT_GEOJSON_URL =
  process.env.DISTRICT_GEOJSON_URL ||
  "https://raw.githubusercontent.com/datameet/maps/master/Districts/Census_2011/2011_Dist.geojson";

/**
 * Open-Meteo variables we request.
 * - precipitation        : Total liquid precipitation (mm/hr)
 * - rain                 : Rainfall component (mm/hr)
 * - showers              : Showery rain (mm/hr)
 * - windspeed_10m        : Wind speed at 10 m (km/h) – amplifies flood risk
 * - relativehumidity_2m  : RH% – saturated soil proxy
 * - apparent_temperature : Feels-like °C
 */
const OPEN_METEO_HOURLY_VARS = [
  "precipitation",
  "rain",
  "showers",
  "windspeed_10m",
  "relativehumidity_2m",
  "apparent_temperature",
].join(",");

// ── Risk Calculation Engine ───────────────────────────────────────────────────

/**
 * RISK TIER TABLE
 * ───────────────────────────────────────────────────────────────────────────
 * Derived from IMD (India Meteorological Department) classification:
 *   Light rain    : < 2.5 mm/hr
 *   Moderate      : 2.5 – 7.5 mm/hr
 *   Heavy         : 7.5 – 15.5 mm/hr
 *   Very Heavy    : 15.5 – 64.4 mm/hr
 *   Extremely Heavy : > 64.4 mm/hr
 *
 * We augment with wind speed and relative-humidity multipliers for a
 * composite "effective precipitation" figure before scoring.
 */
const RISK_TIERS = [
  {
    minMmHr: 0,
    maxMmHr: 2.5,
    label: "NORMAL",
    shortLabel: "Normal",
    color: "#00C853",        // vivid green
    bgColor: "#E8F5E9",
    description: "No significant rainfall. River levels nominal.",
    imdClass: "Light / No Rain",
    actionRequired: false,
  },
  {
    minMmHr: 2.5,
    maxMmHr: 7.5,
    label: "ALERT MONITORING",
    shortLabel: "Alert",
    color: "#FFD600",        // amber-yellow
    bgColor: "#FFFDE7",
    description:
      "Moderate rainfall detected. Monitor water levels. Drainage capacity may be stressed in low-lying areas.",
    imdClass: "Moderate Rain",
    actionRequired: false,
  },
  {
    minMmHr: 7.5,
    maxMmHr: 15.5,
    label: "ELEVATED RISK",
    shortLabel: "Elevated",
    color: "#FFA500",        // orange
    bgColor: "#FFF3E0",
    description:
      "Heavy rainfall. Possible waterlogging in urban areas. Flash flood risk in hilly terrain.",
    imdClass: "Heavy Rain",
    actionRequired: true,
  },
  {
    minMmHr: 15.5,
    maxMmHr: 64.4,
    label: "CRITICAL WARNING",
    shortLabel: "Critical",
    color: "#FF1744",        // vivid red
    bgColor: "#FFEBEE",
    description:
      "Very heavy to extremely heavy rain. High flood probability. Immediate precautionary measures advised.",
    imdClass: "Very Heavy / Extremely Heavy Rain",
    actionRequired: true,
  },
  {
    minMmHr: 64.4,
    maxMmHr: Infinity,
    label: "CATASTROPHIC",
    shortLabel: "Catastrophic",
    color: "#6A1B9A",        // deep purple
    bgColor: "#F3E5F5",
    description:
      "Unprecedented rainfall intensity. Severe flooding imminent. Evacuation protocols should be activated.",
    imdClass: "Catastrophic",
    actionRequired: true,
  },
];

/**
 * calculateRiskPercentage
 * ────────────────────────
 * Maps raw Open-Meteo measurements to a structured risk object.
 *
 * Algorithm:
 *  1. Compute a "composite rain rate" by applying wind and humidity
 *     multipliers to the raw precipitation reading.
 *  2. Locate the matching RISK_TIER.
 *  3. Derive a continuous 0–100 risk percentage within the tier's range
 *     for smooth UI rendering (progress bars, gauge fills, etc.).
 *
 * @param {number} precipMmHr       - Precipitation (mm/hr)
 * @param {number} rainMmHr         - Rain component (mm/hr)
 * @param {number} showersMmHr      - Showers component (mm/hr)
 * @param {number} windSpeedKmh     - Wind speed (km/h)
 * @param {number} relativeHumidity - Relative humidity (%)
 * @returns {RiskAssessment}
 */
function calculateRiskPercentage(
  precipMmHr = 0,
  rainMmHr = 0,
  showersMmHr = 0,
  windSpeedKmh = 0,
  relativeHumidity = 50
) {
  // ── Step 1: Composite effective rain rate ──────────────────────────────────

  // Use the maximum of available rain readings as the primary signal
  const rawRainRate = Math.max(precipMmHr, rainMmHr, showersMmHr, 0);

  // Wind multiplier: high wind drives rain horizontally, increasing
  // effective surface runoff. Capped at +30% uplift.
  const windMultiplier = 1 + Math.min((windSpeedKmh / 100) * 0.3, 0.3);

  // Humidity multiplier: soil near saturation has minimal infiltration
  // capacity, so more rain ends up as surface runoff.
  // RH >= 90% → +20% uplift; RH <= 40% → no uplift.
  const humidityFactor = Math.max(0, (relativeHumidity - 40) / 50); // 0→1
  const humidityMultiplier = 1 + humidityFactor * 0.2;

  const effectiveRainRate = rawRainRate * windMultiplier * humidityMultiplier;

  // ── Step 2: Tier lookup ────────────────────────────────────────────────────

  const tier =
    RISK_TIERS.find(
      (t) => effectiveRainRate >= t.minMmHr && effectiveRainRate < t.maxMmHr
    ) || RISK_TIERS[RISK_TIERS.length - 1];

  // ── Step 3: Continuous percentage within tier ──────────────────────────────

  let percentage;
  if (tier.maxMmHr === Infinity) {
    // Last tier – cap at 100%
    percentage = 100;
  } else {
    const range = tier.maxMmHr - tier.minMmHr;
    const offset = effectiveRainRate - tier.minMmHr;
    const tierStart = (RISK_TIERS.indexOf(tier) / RISK_TIERS.length) * 100;
    const tierWidth = 100 / RISK_TIERS.length;
    percentage = Math.min(
      100,
      Math.round(tierStart + (offset / range) * tierWidth)
    );
  }

  return {
    label: tier.label,
    shortLabel: tier.shortLabel,
    color: tier.color,
    bgColor: tier.bgColor,
    percentage,
    description: tier.description,
    imdClass: tier.imdClass,
    actionRequired: tier.actionRequired,
    inputs: {
      rawRainRate: +rawRainRate.toFixed(3),
      effectiveRainRate: +effectiveRainRate.toFixed(3),
      windSpeedKmh,
      relativeHumidity,
    },
  };
}

// ── Helper: fetch current hour index ─────────────────────────────────────────

/**
 * Returns the index in Open-Meteo's hourly arrays that corresponds to
 * the current UTC hour (closest past or present reading).
 *
 * @param {string[]} timeArray - ISO-8601 timestamps from Open-Meteo
 * @returns {number}
 */
function getCurrentHourIndex(timeArray) {
  const now = new Date();
  // Round down to the current hour
  const currentHourISO = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours()
    )
  )
    .toISOString()
    .slice(0, 16); // "YYYY-MM-DDTHH:MM"

  let idx = timeArray.findIndex((t) => t === currentHourISO);

  // If exact match not found (timezone edge), fall back to closest past hour
  if (idx === -1) {
    const nowMs = now.getTime();
    let best = 0;
    for (let i = 0; i < timeArray.length; i++) {
      const ts = new Date(timeArray[i]).getTime();
      if (ts <= nowMs) best = i;
      else break;
    }
    idx = best;
  }

  return idx;
}

// ── Controller: predictLocation ───────────────────────────────────────────────

/**
 * GET /api/v1/predict-location?lat=<lat>&lon=<lon>&name=<optional>
 *
 * Fetches live weather from Open-Meteo for the given coordinates, runs the
 * risk engine, and returns a structured flood-risk assessment.
 */
async function predictLocation(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const locationName = req.query.name
      ? decodeURIComponent(req.query.name)
      : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    // ── Input validation ───────────────────────────────────────────────────
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        success: false,
        error: "Invalid coordinates. Supply numeric ?lat= and ?lon= query params.",
      });
    }

    // Rough India bounding box guard (not strict – still allows border areas)
    if (lat < 6 || lat > 38 || lon < 67 || lon > 98) {
      return res.status(422).json({
        success: false,
        error:
          "Coordinates appear to be outside the Indian subcontinent. " +
          "This service is calibrated for India only.",
      });
    }

    // ── Live Open-Meteo fetch ──────────────────────────────────────────────
    const openMeteoURL =
      `${OPEN_METEO_BASE_URL}` +
      `?latitude=${lat}` +
      `&longitude=${lon}` +
      `&hourly=${OPEN_METEO_HOURLY_VARS}` +
      `&timezone=Asia%2FKolkata` +      // IST
      `&forecast_days=3`;               // 72-hour window

    const { data: weatherData } = await axios.get(openMeteoURL, {
      timeout: 10000,
      headers: { "Accept-Encoding": "gzip" },
    });

    const hourly = weatherData.hourly;
    const currentIdx = getCurrentHourIndex(hourly.time);

    // Extract current readings
    const precipitation = hourly.precipitation?.[currentIdx] ?? 0;
    const rain = hourly.rain?.[currentIdx] ?? 0;
    const showers = hourly.showers?.[currentIdx] ?? 0;
    const windSpeed = hourly.windspeed_10m?.[currentIdx] ?? 0;
    const humidity = hourly.relativehumidity_2m?.[currentIdx] ?? 50;
    const apparentTemp = hourly.apparent_temperature?.[currentIdx] ?? null;

    // Build 24-hour forecast timeline (next 24 hourly buckets)
    const forecastHorizon = 24;
    const forecastTimeline = [];
    for (let i = currentIdx; i < currentIdx + forecastHorizon && i < hourly.time.length; i++) {
      const risk = calculateRiskPercentage(
        hourly.precipitation?.[i] ?? 0,
        hourly.rain?.[i] ?? 0,
        hourly.showers?.[i] ?? 0,
        hourly.windspeed_10m?.[i] ?? 0,
        hourly.relativehumidity_2m?.[i] ?? 50
      );
      forecastTimeline.push({
        time: hourly.time[i],
        precipMmHr: hourly.precipitation?.[i] ?? 0,
        risk: {
          label: risk.label,
          shortLabel: risk.shortLabel,
          color: risk.color,
          percentage: risk.percentage,
        },
      });
    }

    // ── Risk assessment for current conditions ─────────────────────────────
    const risk = calculateRiskPercentage(
      precipitation,
      rain,
      showers,
      windSpeed,
      humidity
    );

    // ── Compose response ───────────────────────────────────────────────────
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      location: {
        name: locationName,
        latitude: lat,
        longitude: lon,
        timezone: weatherData.timezone,
        elevationM: weatherData.elevation ?? null,
      },
      currentConditions: {
        precipitationMmHr: +precipitation.toFixed(3),
        rainMmHr: +rain.toFixed(3),
        showersMmHr: +showers.toFixed(3),
        windSpeedKmh: +windSpeed.toFixed(1),
        relativeHumidityPct: humidity,
        apparentTemperatureC: apparentTemp,
        observedAt: hourly.time[currentIdx],
      },
      riskAssessment: risk,
      forecastTimeline,
      meta: {
        dataSource: "Open-Meteo API (open-source, no key required)",
        openMeteoURL,
        riskEngine: "FloodVision Pro IMD-calibrated heuristic v1.0",
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    // Surface upstream API errors distinctly
    if (err.response) {
      return res.status(502).json({
        success: false,
        error: "Upstream weather API returned an error.",
        upstream: {
          status: err.response.status,
          message: err.response.data?.reason || err.response.statusText,
        },
      });
    }
    if (err.code === "ECONNABORTED") {
      return res.status(504).json({
        success: false,
        error: "Request to Open-Meteo timed out. Please retry.",
      });
    }
    next(err);
  }
}

// ── Controller: streamDistricts ───────────────────────────────────────────────

/**
 * GET /api/v1/stream-districts
 *
 * Pipes the DataMeet Census 2011 Indian district boundary GeoJSON directly
 * to the client – no local file caching, always from the live GitHub URL.
 * Sets appropriate headers so the browser / Leaflet can consume it as JSON.
 *
 * Optional query param: ?state=<state_name>  (case-insensitive substring match)
 * to filter features by the STATE_NAME property in the GeoJSON.
 */
async function streamDistricts(req, res, next) {
  try {
    const stateFilter = req.query.state
      ? decodeURIComponent(req.query.state).toLowerCase()
      : null;

    const { data: geoJson } = await axios.get(DISTRICT_GEOJSON_URL, {
      timeout: 30000, // larger dataset – allow 30 s
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "User-Agent": "FloodVision-Pro/1.0",
      },
      // Keep full response in memory (< 10 MB) – small enough to filter
      responseType: "json",
    });

    // Optional state-level filter
    let features = geoJson.features || [];
    if (stateFilter) {
      features = features.filter((f) => {
        const stateName = (
          f.properties?.STATE_NAME ||
          f.properties?.state_name ||
          ""
        ).toLowerCase();
        return stateName.includes(stateFilter);
      });
    }

    const filtered = { ...geoJson, features };

    res.set({
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600", // cache 1 hour downstream
      "X-FloodVision-Source": DISTRICT_GEOJSON_URL,
      "X-FloodVision-FeatureCount": features.length.toString(),
    });

    return res.status(200).json(filtered);
  } catch (err) {
    if (err.response) {
      return res.status(502).json({
        success: false,
        error: "Failed to fetch district boundaries from upstream source.",
        upstream: { status: err.response.status },
      });
    }
    next(err);
  }
}

module.exports = {
  predictLocation,
  streamDistricts,
  // Export for unit testing
  calculateRiskPercentage,
  getCurrentHourIndex,
  RISK_TIERS,
};
