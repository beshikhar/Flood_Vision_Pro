/**
 * FloodVision Pro – DashboardPanel.jsx
 * ──────────────────────────────────────
 * Left sidebar containing:
 *  • Coordinate search form (lat / lon inputs)
 *  • Quick-select chips for major Indian flood-prone cities
 *  • Animated risk gauge card
 *  • Current conditions data table
 *  • 24-hour forecast timeline strip
 *  • Error state display
 */

import React, { useState } from "react";
import {
  Search,
  MapPin,
  Droplets,
  Wind,
  Thermometer,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader,
  CloudRain,
} from "lucide-react";

// ── Quick-select locations ─────────────────────────────────────────────────────

const QUICK_LOCATIONS = [
  { name: "Patna",      state: "Bihar",       lat: 25.5941, lon: 85.1376 },
  { name: "Guwahati",   state: "Assam",       lat: 26.1445, lon: 91.7362 },
  { name: "Mumbai",     state: "Maharashtra", lat: 19.076,  lon: 72.8777 },
  { name: "Chennai",    state: "Tamil Nadu",  lat: 13.0827, lon: 80.2707 },
  { name: "Kolkata",    state: "W. Bengal",   lat: 22.5726, lon: 88.3639 },
  { name: "Kochi",      state: "Kerala",      lat: 9.9312,  lon: 76.2673 },
  { name: "Bhubaneswar",state: "Odisha",      lat: 20.2961, lon: 85.8245 },
  { name: "Srinagar",   state: "J&K",         lat: 34.0837, lon: 74.7973 },
];

// ── Helper: format hour from ISO timestamp ────────────────────────────────────

function fmtHour(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso?.slice(11, 16) || "—";
  }
}

// ── Sub-component: RiskGaugeCard ──────────────────────────────────────────────

function RiskGaugeCard({ risk }) {
  const { label, color, bgColor, percentage, description, actionRequired } = risk;

  return (
    <div className="card fade-in-up" style={{ borderColor: color + "55" }}>
      <div className="card-title">
        <Activity size={12} />
        RISK ASSESSMENT
      </div>

      {/* Gauge arc (SVG) */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <svg width="160" height="90" viewBox="0 0 160 90">
          {/* Track arc */}
          <path
            d="M 15 85 A 65 65 0 0 1 145 85"
            fill="none"
            stroke="#1e2d45"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Fill arc – percentage mapped to 0–180° */}
          {percentage > 0 && (() => {
            const angle = (percentage / 100) * Math.PI; // 0 → π
            const x = 80 - 65 * Math.cos(angle);
            const y = 85 - 65 * Math.sin(angle);
            const largeArc = angle > Math.PI / 2 ? 1 : 0;
            return (
              <path
                d={`M 15 85 A 65 65 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}`}
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
              />
            );
          })()}
          {/* Percentage text */}
          <text
            x="80"
            y="70"
            textAnchor="middle"
            fill={color}
            fontSize="24"
            fontWeight="700"
            fontFamily="IBM Plex Mono, monospace"
          >
            {percentage}%
          </text>
        </svg>
      </div>

      {/* Label badge */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <div className="risk-badge" style={{
          backgroundColor: color + "22",
          border: `1px solid ${color}66`,
          color: color,
        }}>
          {actionRequired ? (
            <AlertTriangle size={11} />
          ) : (
            <CheckCircle size={11} />
          )}
          {label}
        </div>
      </div>

      {/* Description */}
      <p style={{
        fontSize: 11,
        color: "#8ba4c0",
        lineHeight: 1.55,
        padding: "8px 10px",
        background: color + "0d",
        borderLeft: `3px solid ${color}`,
        borderRadius: "0 4px 4px 0",
      }}>
        {description}
      </p>
    </div>
  );
}

// ── Sub-component: ConditionsCard ─────────────────────────────────────────────

function ConditionsCard({ conditions, location }) {
  const rows = [
    {
      icon: <Droplets size={12} />,
      label: "Precipitation",
      value: `${conditions.precipitationMmHr} mm/hr`,
    },
    {
      icon: <CloudRain size={12} />,
      label: "Rain + Showers",
      value: `${(conditions.rainMmHr + conditions.showersMmHr).toFixed(3)} mm/hr`,
    },
    {
      icon: <Wind size={12} />,
      label: "Wind Speed",
      value: `${conditions.windSpeedKmh} km/h`,
    },
    {
      icon: <Droplets size={12} />,
      label: "Rel. Humidity",
      value: `${conditions.relativeHumidityPct}%`,
    },
    ...(conditions.apparentTemperatureC !== null
      ? [{
          icon: <Thermometer size={12} />,
          label: "Feels Like",
          value: `${conditions.apparentTemperatureC?.toFixed(1)}°C`,
        }]
      : []),
    {
      icon: <MapPin size={12} />,
      label: "Elevation",
      value: location.elevationM !== null ? `${location.elevationM} m` : "—",
    },
  ];

  return (
    <div className="card fade-in-up">
      <div className="card-title">
        <CloudRain size={12} />
        CURRENT CONDITIONS
        <span style={{
          marginLeft: "auto",
          fontSize: 9,
          fontFamily: "IBM Plex Mono, monospace",
          color: "#2a3f5f",
        }}>
          {conditions.observedAt?.slice(11, 16)} IST
        </span>
      </div>

      {rows.map(({ icon, label, value }) => (
        <div key={label} className="stat-row">
          <span className="stat-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {icon} {label}
          </span>
          <span className="stat-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sub-component: ForecastCard ───────────────────────────────────────────────

function ForecastCard({ timeline }) {
  const slice = timeline.slice(0, 24);
  return (
    <div className="card fade-in-up">
      <div className="card-title">
        <Clock size={12} />
        24-HR FORECAST
      </div>
      <div className="forecast-scroll">
        {slice.map((tick, i) => (
          <div
            key={i}
            className="forecast-tick"
            title={`${tick.risk.label} · ${tick.precipMmHr} mm/hr`}
          >
            <span className="forecast-tick-time">{fmtHour(tick.time)}</span>
            <div
              className="forecast-tick-dot"
              style={{
                backgroundColor: tick.risk.color,
                boxShadow: `0 0 5px ${tick.risk.color}88`,
              }}
            />
            <span className="forecast-tick-val">{tick.precipMmHr.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: "#2a3f5f", fontFamily: "IBM Plex Mono, monospace" }}>
        Precipitation mm/hr · Source: Open-Meteo
      </div>
    </div>
  );
}

// ── Main Component: DashboardPanel ────────────────────────────────────────────

/**
 * @param {Object}   props
 * @param {Object}   props.data        - prediction response (null if none yet)
 * @param {boolean}  props.loading     - API call in-flight
 * @param {string}   props.error       - error message or null
 * @param {Function} props.onSearch    - (lat, lon, name) => void
 */
export default function DashboardPanel({ data, loading, error, onSearch }) {
  const [latInput, setLatInput] = useState("");
  const [lonInput, setLonInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  // ── Coordinate form submit ────────────────────────────────────────────────

  function handleCoordSubmit(e) {
    e.preventDefault();
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (isNaN(lat) || isNaN(lon)) return;
    onSearch(lat, lon, nameInput.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }

  // ── Quick-select click ────────────────────────────────────────────────────

  function handleChipClick(loc) {
    setLatInput(loc.lat.toString());
    setLonInput(loc.lon.toString());
    setNameInput(`${loc.name}, ${loc.state}`);
    onSearch(loc.lat, loc.lon, `${loc.name}, ${loc.state}`);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">

        {/* ── Search form ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">
            <Search size={12} />
            LOCATION SEARCH
          </div>

          <form onSubmit={handleCoordSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              className="search-input"
              type="text"
              placeholder="Location name (optional)"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                className="search-input"
                type="number"
                placeholder="Latitude"
                step="0.0001"
                min="-90"
                max="90"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                required
              />
              <input
                className="search-input"
                type="number"
                placeholder="Longitude"
                step="0.0001"
                min="-180"
                max="180"
                value={lonInput}
                onChange={(e) => setLonInput(e.target.value)}
                required
              />
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%" }}
            >
              {loading ? (
                <><Loader size={13} style={{ animation: "spin 0.7s linear infinite" }} /> Analysing…</>
              ) : (
                <><Search size={13} /> Analyse Risk</>
              )}
            </button>
          </form>
        </div>

        {/* ── Quick-select chips ───────────────────────────────────────── */}
        <div className="card">
          <div className="card-title">
            <MapPin size={12} />
            FLOOD-PRONE CITIES
          </div>
          <div className="chip-grid">
            {QUICK_LOCATIONS.map((loc) => (
              <button
                key={loc.name}
                className="chip"
                onClick={() => handleChipClick(loc)}
                disabled={loading}
              >
                <div className="chip-name">{loc.name}</div>
                <div className="chip-meta">{loc.state}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Error state ──────────────────────────────────────────────── */}
        {error && (
          <div className="error-box fade-in-up">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontWeight: 600 }}>
              <AlertTriangle size={13} /> Error
            </div>
            {error}
          </div>
        )}

        {/* ── Risk assessment ──────────────────────────────────────────── */}
        {data?.riskAssessment && (
          <RiskGaugeCard risk={data.riskAssessment} />
        )}

        {/* ── Current conditions ───────────────────────────────────────── */}
        {data?.currentConditions && data?.location && (
          <ConditionsCard
            conditions={data.currentConditions}
            location={data.location}
          />
        )}

        {/* ── 24-hour forecast timeline ─────────────────────────────────── */}
        {data?.forecastTimeline?.length > 0 && (
          <ForecastCard timeline={data.forecastTimeline} />
        )}

        {/* ── Data provenance footer ───────────────────────────────────── */}
        {data && (
          <div style={{
            fontSize: 10,
            color: "#2a3f5f",
            fontFamily: "IBM Plex Mono, monospace",
            lineHeight: 1.6,
            padding: "0 4px 4px",
          }}>
            ↗ Open-Meteo · IMD heuristic v1.0<br />
            ↗ DataMeet Census 2011 boundaries<br />
            Updated: {new Date(data.timestamp).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata", hour12: false,
            })} IST
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!data && !loading && !error && (
          <div style={{
            textAlign: "center",
            padding: "24px 12px",
            color: "#2a3f5f",
            fontSize: 12,
            fontFamily: "IBM Plex Mono, monospace",
            lineHeight: 1.7,
          }}>
            <CloudRain size={28} style={{ marginBottom: 10, opacity: 0.3 }} />
            <div>Select a city above or click<br />anywhere on the map to begin.</div>
          </div>
        )}

      </div>
    </aside>
  );
}
