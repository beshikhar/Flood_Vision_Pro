/**
 * FloodVision Pro – api.js (Frontend utility)
 * ─────────────────────────────────────────────
 * Centralised API client for the Express backend.
 * All fetch calls route through here so base URL, error handling,
 * and timeout logic live in one place.
 */

const BASE_URL = "/api/v1"; // Vite proxies this to http://localhost:5000
const DEFAULT_TIMEOUT_MS = 12000;

/**
 * Internal fetch wrapper with timeout support.
 *
 * @param {string} path       - relative path e.g. "/predict-location?lat=..."
 * @param {RequestInit} opts  - standard fetch options
 * @returns {Promise<any>}    - parsed JSON body
 */
async function apiFetch(path, opts = {}) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: { Accept: "application/json", ...(opts.headers || {}) },
    });

    clearTimeout(timerId);

    const json = await res.json();

    if (!res.ok) {
      throw new Error(
        json?.error || `Server error ${res.status}: ${res.statusText}`
      );
    }

    return json;
  } catch (err) {
    clearTimeout(timerId);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection.");
    }
    throw err;
  }
}

// ── Public API functions ──────────────────────────────────────────────────────

/**
 * Fetch a live flood-risk prediction for given coordinates.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} [name] - optional human-readable label
 * @returns {Promise<FloodPrediction>}
 */
export async function fetchPrediction(lat, lon, name = "") {
  const params = new URLSearchParams({ lat, lon });
  if (name) params.set("name", name);
  return apiFetch(`/predict-location?${params.toString()}`);
}

/**
 * Fetch Indian district boundary GeoJSON from the backend proxy.
 *
 * @param {string} [state] - optional state name filter
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export async function fetchDistrictBoundaries(state = "") {
  const params = state ? `?state=${encodeURIComponent(state)}` : "";
  return apiFetch(`/stream-districts${params}`);
}

/**
 * Fetch the risk tier classification table.
 *
 * @returns {Promise<{tiers: RiskTier[]}>}
 */
export async function fetchRiskTiers() {
  return apiFetch("/risk-tiers");
}

/**
 * Ping the health endpoint.
 *
 * @returns {Promise<{status: string}>}
 */
export async function checkHealth() {
  return apiFetch("/health");
}
