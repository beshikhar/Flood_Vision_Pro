/**
 * FloodVision Pro – InteractiveMap.jsx
 * ──────────────────────────────────────
 * React-Leaflet powered map with:
 *  • Dark satellite-style tile layer (CartoDB Dark Matter)
 *  • ChangeMapView utility: smooth fly-to on coordinate change
 *  • Live custom hazard circles coloured by risk level
 *  • Click-to-predict: click anywhere on map to fetch a prediction
 *  • Rich popup with risk details
 *  • Pristine custom SVG marker (no default Leaflet blue pin)
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

// ── Fix Leaflet's default icon path (broken in Vite/Webpack builds) ──────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Constants ─────────────────────────────────────────────────────────────────

const INDIA_CENTER = [20.5937, 78.9629];
const INDIA_ZOOM   = 5;

// CartoDB Dark Matter – clean dark base for geospatial data dashboards
const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>';

// ── Sub-component: ChangeMapView ──────────────────────────────────────────────

/**
 * ChangeMapView
 * ─────────────
 * A render-null component that listens for coordinate changes and smoothly
 * flies the Leaflet map to the new position using flyTo() with custom easing.
 *
 * @param {{ center: [number, number] | null, zoom?: number }} props
 */
function ChangeMapView({ center, zoom = 11 }) {
  const map = useMap();
  const prevCenter = useRef(null);

  useEffect(() => {
    if (!center) return;

    const [lat, lon] = center;
    const prev = prevCenter.current;

    // Avoid redundant animation on the same coordinate
    if (prev && Math.abs(prev[0] - lat) < 0.0001 && Math.abs(prev[1] - lon) < 0.0001) {
      return;
    }

    prevCenter.current = center;

    map.flyTo([lat, lon], zoom, {
      animate: true,
      duration: 1.4,          // seconds
      easeLinearity: 0.25,    // smooth deceleration
    });
  }, [center, zoom, map]);

  return null;
}

// ── Sub-component: MapClickHandler ────────────────────────────────────────────

/**
 * Translates map click events into coordinate callbacks passed up to the
 * parent orchestrator (App.jsx).
 */
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      onMapClick(
        parseFloat(lat.toFixed(5)),
        parseFloat(lng.toFixed(5))
      );
    },
  });
  return null;
}

// ── Sub-component: HazardPopupContent ────────────────────────────────────────

function HazardPopupContent({ data }) {
  const { location, riskAssessment, currentConditions } = data;

  return (
    <div style={{
      padding: "14px 16px",
      minWidth: "240px",
      fontFamily: "IBM Plex Sans, sans-serif",
    }}>
      {/* Location */}
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#e2eaf5",
        marginBottom: 10,
        borderBottom: "1px solid #1e2d45",
        paddingBottom: 8,
        lineHeight: 1.3,
      }}>
        {location.name}
        <div style={{
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 10,
          color: "#4a6080",
          marginTop: 3,
          fontWeight: 400,
        }}>
          {location.latitude.toFixed(4)}°N, {location.longitude.toFixed(4)}°E
          {location.elevationM ? ` · ${location.elevationM}m ASL` : ""}
        </div>
      </div>

      {/* Risk badge */}
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        backgroundColor: riskAssessment.color + "22",
        border: `1px solid ${riskAssessment.color}66`,
        marginBottom: 10,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: riskAssessment.color,
          boxShadow: `0 0 6px ${riskAssessment.color}`,
        }} />
        <span style={{
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 11,
          fontWeight: 600,
          color: riskAssessment.color,
          letterSpacing: "0.05em",
        }}>
          {riskAssessment.label}
        </span>
      </div>

      {/* Risk percentage bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 10, color: "#4a6080", fontFamily: "IBM Plex Mono, monospace" }}>
            RISK INDEX
          </span>
          <span style={{ fontSize: 10, color: "#8ba4c0", fontFamily: "IBM Plex Mono, monospace" }}>
            {riskAssessment.percentage}%
          </span>
        </div>
        <div style={{
          width: "100%",
          height: 5,
          background: "#0d1424",
          borderRadius: 999,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${riskAssessment.percentage}%`,
            height: "100%",
            background: riskAssessment.color,
            borderRadius: 999,
          }} />
        </div>
      </div>

      {/* Current conditions */}
      {[
        ["Precipitation", `${currentConditions.precipitationMmHr} mm/hr`],
        ["Wind Speed",    `${currentConditions.windSpeedKmh} km/h`],
        ["Humidity",      `${currentConditions.relativeHumidityPct}%`],
        ["Eff. Rain Rate",`${riskAssessment.inputs.effectiveRainRate} mm/hr`],
      ].map(([label, value]) => (
        <div key={label} style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 0",
          borderTop: "1px solid #1e2d45",
          fontSize: 11,
        }}>
          <span style={{ color: "#4a6080", fontFamily: "IBM Plex Mono, monospace" }}>
            {label}
          </span>
          <span style={{ color: "#e2eaf5", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 }}>
            {value}
          </span>
        </div>
      ))}

      {/* Description */}
      <div style={{
        marginTop: 10,
        padding: "8px 10px",
        background: riskAssessment.color + "11",
        borderLeft: `3px solid ${riskAssessment.color}`,
        borderRadius: "0 4px 4px 0",
        fontSize: 11,
        color: "#8ba4c0",
        lineHeight: 1.5,
      }}>
        {riskAssessment.description}
      </div>
    </div>
  );
}

// ── Main Component: InteractiveMap ────────────────────────────────────────────

/**
 * @param {Object}  props
 * @param {Object}  props.predictionData  - latest flood prediction response from API
 * @param {boolean} props.loading         - true while API call is in-flight
 * @param {Array}   props.markerHistory   - past predictions to keep on map
 * @param {Function}props.onMapClick      - (lat, lon) => void
 */
export default function InteractiveMap({
  predictionData,
  loading,
  markerHistory,
  onMapClick,
}) {
  // Derive fly-to target from the latest prediction
  const flyTarget = predictionData
    ? [predictionData.location.latitude, predictionData.location.longitude]
    : null;

  return (
    <div className="map-container">
      <MapContainer
        center={INDIA_CENTER}
        zoom={INDIA_ZOOM}
        style={{ width: "100%", height: "100%" }}
        zoomControl={true}
        attributionControl={true}
        preferCanvas={true}   // better perf for many circle markers
      >
        {/* Dark base tile layer */}
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          maxZoom={18}
          subdomains="abcd"
        />

        {/* Smooth fly-to on new prediction */}
        <ChangeMapView center={flyTarget} zoom={10} />

        {/* Click-to-predict */}
        <MapClickHandler onMapClick={onMapClick} />

        {/* Historical hazard circles (faded) */}
        {markerHistory.map((item, idx) => {
          const { latitude, longitude } = item.location;
          const { color } = item.riskAssessment;
          const age = markerHistory.length - 1 - idx; // 0 = newest (excluded here)
          if (idx === markerHistory.length - 1) return null; // current shown below

          return (
            <React.Fragment key={`hist-${idx}`}>
              {/* Outer glow ring */}
              <CircleMarker
                center={[latitude, longitude]}
                radius={22}
                pathOptions={{
                  color: color,
                  weight: 1,
                  opacity: Math.max(0.05, 0.25 - age * 0.06),
                  fillColor: color,
                  fillOpacity: Math.max(0.02, 0.1 - age * 0.025),
                }}
              />
              {/* Inner dot */}
              <CircleMarker
                center={[latitude, longitude]}
                radius={5}
                pathOptions={{
                  color: color,
                  weight: 1.5,
                  opacity: Math.max(0.1, 0.4 - age * 0.1),
                  fillColor: color,
                  fillOpacity: Math.max(0.05, 0.2 - age * 0.05),
                }}
              />
            </React.Fragment>
          );
        })}

        {/* Current / latest prediction hazard marker */}
        {predictionData && (() => {
          const { latitude, longitude } = predictionData.location;
          const { color, percentage } = predictionData.riskAssessment;
          // Scale circle radius (12–40px) with risk percentage
          const outerRadius = 12 + (percentage / 100) * 28;

          return (
            <React.Fragment>
              {/* Outermost translucent halo */}
              <CircleMarker
                center={[latitude, longitude]}
                radius={outerRadius + 14}
                pathOptions={{
                  color: color,
                  weight: 0,
                  fillColor: color,
                  fillOpacity: 0.06,
                }}
              />
              {/* Middle glow ring */}
              <CircleMarker
                center={[latitude, longitude]}
                radius={outerRadius}
                pathOptions={{
                  color: color,
                  weight: 1.5,
                  opacity: 0.5,
                  fillColor: color,
                  fillOpacity: 0.12,
                  dashArray: percentage > 50 ? null : "4 4",
                }}
              />
              {/* Core dot – clickable popup */}
              <CircleMarker
                center={[latitude, longitude]}
                radius={9}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  opacity: 0.9,
                  fillColor: color,
                  fillOpacity: 1,
                }}
              >
                <Popup
                  maxWidth={280}
                  className="fv-popup"
                  closeButton={true}
                >
                  <HazardPopupContent data={predictionData} />
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })()}
      </MapContainer>

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          background: "rgba(13, 20, 36, 0.92)",
          border: "1px solid #1e2d45",
          borderRadius: 8,
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          backdropFilter: "blur(8px)",
        }}>
          <div className="spinner" />
          <span style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 12,
            color: "#00c8ff",
          }}>
            Fetching live data…
          </span>
        </div>
      )}

      {/* Map hint */}
      {!predictionData && !loading && (
        <div style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 400,
          background: "rgba(13, 20, 36, 0.82)",
          border: "1px solid #1e2d45",
          borderRadius: 8,
          padding: "7px 14px",
          backdropFilter: "blur(6px)",
          pointerEvents: "none",
        }}>
          <span style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: 11,
            color: "#4a6080",
          }}>
            Click anywhere on the map to analyse flood risk
          </span>
        </div>
      )}
    </div>
  );
}
