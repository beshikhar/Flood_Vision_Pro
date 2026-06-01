# FloodVision Pro 🌊
### Live Predictive Hydrological Early-Warning Dashboard — India

A full-stack, production-ready geospatial early-warning system that fetches **live rainfall data directly from the Open-Meteo API**, runs a calibrated IMD-based flood-risk engine on the backend, and renders an interactive dark-mode Leaflet map on the frontend — with no local dataset files and no paid API keys required.

---

## Architecture Overview

```
floodvision-pro/
├── backend/          Node.js + Express API server
│   ├── config/       PostGIS connection framework (mock-ready)
│   ├── controllers/  Risk engine + live API integration
│   ├── routes/       REST route definitions
│   └── server.js     App entry point
└── frontend/         React + Vite SPA
    └── src/
        ├── components/   InteractiveMap, DashboardPanel
        ├── hooks/        useFloodData (async state management)
        └── utils/        API client
```

**Data flow:**
```
Open-Meteo API ──► Backend risk engine ──► REST API ──► React frontend ──► Leaflet map
DataMeet GeoJSON ─► /stream-districts ──────────────────────────────────────────────►
```

---

## Prerequisites

| Tool    | Minimum Version |
|---------|----------------|
| Node.js | 18.x           |
| npm     | 9.x            |

No database, no API keys, no Docker required for local development.

---

## Quick Start

### 1. Clone / unzip the project

```bash
cd floodvision-pro
```

### 2. Start the Backend

```bash
cd backend

# Copy environment configuration
cp .env.example .env

# Install dependencies
npm install

# Start in development mode (auto-restart with nodemon)
npm run dev

# ─ OR ─ start in production mode
npm start
```

The API will be available at **http://localhost:5000**

Verify it is running:
```bash
curl http://localhost:5000/api/v1/health
```

Expected output:
```json
{
  "status": "ok",
  "service": "FloodVision Pro API",
  "version": "1.0.0"
}
```

### 3. Start the Frontend

Open a **new terminal** in the project root:

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Open **http://localhost:5173** in your browser.

> The Vite dev server automatically proxies all `/api` requests to the backend at `localhost:5000`, so no CORS configuration is needed during local development.

---

## API Endpoints

### `GET /api/v1/health`
Liveness probe for uptime monitoring.

### `GET /api/v1/risk-tiers`
Returns the complete IMD-calibrated flood risk classification table.

### `GET /api/v1/predict-location`
Fetches live rainfall from Open-Meteo and returns a structured flood-risk assessment.

**Query Parameters:**

| Param | Type   | Required | Description |
|-------|--------|----------|-------------|
| `lat` | number | ✅       | Latitude (WGS-84 decimal degrees) |
| `lon` | number | ✅       | Longitude (WGS-84 decimal degrees) |
| `name`| string | ❌       | Human-readable location label (URL-encoded) |

**Example request:**
```
GET /api/v1/predict-location?lat=25.5941&lon=85.1376&name=Patna%2C%20Bihar
```

**Example response (abbreviated):**
```json
{
  "success": true,
  "location": {
    "name": "Patna, Bihar",
    "latitude": 25.5941,
    "longitude": 85.1376,
    "timezone": "Asia/Kolkata",
    "elevationM": 55
  },
  "currentConditions": {
    "precipitationMmHr": 6.2,
    "rainMmHr": 5.9,
    "windSpeedKmh": 18.4,
    "relativeHumidityPct": 88
  },
  "riskAssessment": {
    "label": "ALERT MONITORING",
    "color": "#FFD600",
    "percentage": 47,
    "description": "Moderate rainfall detected...",
    "actionRequired": false,
    "inputs": {
      "rawRainRate": 6.2,
      "effectiveRainRate": 7.18
    }
  },
  "forecastTimeline": [ ... ]
}
```

### `GET /api/v1/stream-districts`
Streams the DataMeet Census 2011 Indian district boundary GeoJSON.

**Query Parameters:**

| Param   | Type   | Required | Description |
|---------|--------|----------|-------------|
| `state` | string | ❌       | Filter by state name (case-insensitive substring match) |

**Example:**
```
GET /api/v1/stream-districts?state=kerala
```

---

## Risk Classification Engine

The `calculateRiskPercentage` function in `backend/controllers/floodController.js` implements a composite flood-risk model:

| Tier | Label | Rain Rate | IMD Class | Color |
|------|-------|-----------|-----------|-------|
| 0 | NORMAL | < 2.5 mm/hr | Light/No Rain | `#00C853` |
| 1 | ALERT MONITORING | 2.5–7.5 mm/hr | Moderate | `#FFD600` |
| 2 | ELEVATED RISK | 7.5–15.5 mm/hr | Heavy | `#FFA500` |
| 3 | CRITICAL WARNING | 15.5–64.4 mm/hr | Very Heavy | `#FF1744` |
| 4 | CATASTROPHIC | > 64.4 mm/hr | Catastrophic | `#6A1B9A` |

**Composite multipliers applied before tier lookup:**
- **Wind multiplier**: High wind speed increases effective runoff (up to +30% uplift)
- **Humidity multiplier**: Saturated soils reduce infiltration (up to +20% uplift at RH ≥ 90%)

---

## Data Sources

| Source | Description | License |
|--------|-------------|---------|
| [Open-Meteo](https://open-meteo.com) | Live hourly rainfall, wind, humidity forecasts | Free & open, no key |
| [DataMeet Maps](https://github.com/datameet/maps) | Census 2011 Indian district boundaries (GeoJSON) | Open Data Commons |

---

## Production Build

### Backend
```bash
cd backend
NODE_ENV=production npm start
```

Update `ALLOWED_ORIGINS` in `.env` to your production frontend domain.

### Frontend
```bash
cd frontend
npm run build
# Static files output to frontend/dist/
```

Serve `dist/` with Nginx, Caddy, or any static host. Point the `/api` proxy to your backend.

---

## Connecting a Real PostGIS Database

1. Install the pg driver:
   ```bash
   cd backend && npm install pg
   ```
2. Fill in the `DB_*` environment variables in `.env`
3. Open `backend/config/database.js`, uncomment the `pg-pool` block, and remove the mock export
4. The `db.query(sql, params)` interface is already wired — all controllers work unchanged

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | HTTP server port |
| `NODE_ENV` | `development` | Environment flag |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allow-list (comma-separated) |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com/v1/forecast` | Open-Meteo base URL |
| `DISTRICT_GEOJSON_URL` | DataMeet GitHub raw URL | District boundary source |
| `DB_*` | (commented out) | PostGIS credentials |

---

## Directory Listing

```
floodvision-pro/
├── backend/
│   ├── config/
│   │   └── database.js          ← PostGIS connection framework (mock active)
│   ├── controllers/
│   │   └── floodController.js   ← Risk engine + Open-Meteo + DataMeet integration
│   ├── routes/
│   │   └── api.js               ← REST route definitions
│   ├── .env.example             ← Environment config template
│   ├── package.json
│   └── server.js                ← Express entry point (CORS, helmet, rate-limit)
├── frontend/
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── DashboardPanel.jsx   ← Sidebar: search, chips, risk cards, forecast
│   │   │   └── InteractiveMap.jsx   ← React-Leaflet map, ChangeMapView, hazard circles
│   │   ├── hooks/
│   │   │   └── useFloodData.js      ← Async state management hook
│   │   ├── utils/
│   │   │   └── api.js               ← Fetch wrapper / API client
│   │   ├── App.jsx                  ← Root orchestrator
│   │   ├── index.css                ← Design system + Leaflet overrides
│   │   └── main.jsx                 ← ReactDOM entry
│   ├── index.html
│   ├── package.json
│   └── vite.config.js               ← Dev proxy + build config
└── README.md
```

---

## License

MIT — built for open disaster-risk research and public safety applications.
#   F l o o d _ V i s i o n _ P r o  
 