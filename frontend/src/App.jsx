/**
 * FloodVision Pro – App.jsx
 * ──────────────────────────
 * Root state orchestrator. Owns:
 *  • Layout shell (header → sidebar + map)
 *  • Shared prediction state (via useFloodData hook)
 *  • Marker history (last 8 predictions kept on map for spatial context)
 *  • Wires DashboardPanel ↔ InteractiveMap via callback props
 */

import React, { useState, useCallback } from "react";
import { Droplets, Wifi, WifiOff } from "lucide-react";

import DashboardPanel from "./components/DashboardPanel.jsx";
import InteractiveMap from "./components/InteractiveMap.jsx";
import { useFloodData } from "./hooks/useFloodData.js";

// Maximum number of historical markers shown on the map simultaneously
const MAX_HISTORY = 8;

export default function App() {
  const { data, loading, error, fetchLocation } = useFloodData();
  const [markerHistory, setMarkerHistory] = useState([]);
  const [backendOnline, setBackendOnline] = useState(true);

  // ── Shared search handler (called by both panel & map click) ─────────────

  const handleSearch = useCallback(
    async (lat, lon, name = "") => {
      try {
        const result = await fetchLocation(lat, lon, name);
        // fetchLocation updates `data` via the hook; we also track history here.
        // We read the result through the hook, so we subscribe to `data` changes.
        // History is updated in the effect below via an augmented approach:
        // we pass a setter that DashboardPanel doesn't need to know about.
        setBackendOnline(true);
      } catch {
        setBackendOnline(false);
      }
    },
    [fetchLocation]
  );

  // ── Accumulate marker history when data changes ───────────────────────────

  // We use a ref-based pattern: detect when `data` changes and push to history
  const handleNewPrediction = useCallback((lat, lon, name) => {
    fetchLocation(lat, lon, name).then(() => {
      // Data is set asynchronously in the hook. We push to history after
      // the hook resolves by reading from `data` in the effect-free approach
      // (see below).
    });
  }, [fetchLocation]);

  // Augmented search: calls fetch AND updates marker history
  const handleSearchWithHistory = useCallback(
    async (lat, lon, name = "") => {
      try {
        const tempResult = await _fetchAndCapture(lat, lon, name);
        if (tempResult) {
          setMarkerHistory((prev) => {
            const next = [...prev, tempResult];
            return next.slice(-MAX_HISTORY);
          });
          setBackendOnline(true);
        }
      } catch {
        setBackendOnline(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Direct fetch that returns the result so we can capture it for history
  // without going through the hook (keeps the hook as single source of truth)
  async function _fetchAndCapture(lat, lon, name) {
    try {
      const mod = await import("./utils/api.js");
      const result = await mod.fetchPrediction(lat, lon, name);
      return result;
    } catch {
      return null;
    }
  }

  // We compose the two: use the hook for reactive UI state, and separately
  // accumulate history for the map's historical circles.
  const onSearch = useCallback(
    async (lat, lon, name = "") => {
      // Trigger hook (updates `data`, `loading`, `error` reactively)
      fetchLocation(lat, lon, name);
      // Also accumulate into history
      handleSearchWithHistory(lat, lon, name);
    },
    [fetchLocation, handleSearchWithHistory]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-mark">
            <Droplets size={16} color="#00c8ff" />
          </div>
          <div>
            <div className="logo-name">FloodVision Pro</div>
            <div className="logo-sub">Hydrological Early-Warning · India</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Backend connectivity indicator */}
          {backendOnline ? (
            <div className="live-pill">
              <div
                className="pulse-dot"
                style={{ backgroundColor: "#00c853", width: 7, height: 7 }}
              />
              LIVE
            </div>
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: "rgba(255,23,68,0.1)",
              border: "1px solid rgba(255,23,68,0.3)",
              borderRadius: 999,
              fontSize: 10,
              fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 600,
              color: "#ff1744",
            }}>
              <WifiOff size={10} />
              OFFLINE
            </div>
          )}

          {/* Current location label */}
          {data?.location && (
            <div style={{
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: 11,
              color: "#4a6080",
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              ◎ {data.location.name}
            </div>
          )}

          {/* Risk badge in header */}
          {data?.riskAssessment && (
            <div className="risk-badge" style={{
              backgroundColor: data.riskAssessment.color + "22",
              border: `1px solid ${data.riskAssessment.color}55`,
              color: data.riskAssessment.color,
              fontSize: 10,
            }}>
              {data.riskAssessment.shortLabel}
            </div>
          )}
        </div>
      </header>

      {/* ── Body: sidebar + map ────────────────────────────────────── */}
      <div className="app-body">
        <DashboardPanel
          data={data}
          loading={loading}
          error={error}
          onSearch={onSearch}
        />
        <InteractiveMap
          predictionData={data}
          loading={loading}
          markerHistory={markerHistory}
          onMapClick={(lat, lon) => onSearch(lat, lon, "")}
        />
      </div>
    </div>
  );
}
