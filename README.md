# FloodVision Pro

A full-stack hydrological early-warning system for the Indian subcontinent. The backend ingests live hourly weather data from the Open-Meteo forecast API, applies a composite flood-risk scoring model calibrated against IMD (India Meteorological Department) rainfall classifications, and exposes the result as a REST API. The frontend renders the assessments on an interactive Leaflet map with a real-time analytical sidebar.

No paid API keys are required. No local dataset files are bundled or cached to disk.

---

## System Architecture

```
floodvision-pro/
├── backend/
│   ├── config/
│   │   └── database.js          PostGIS/pg-pool connection framework (mock active by default)
│   ├── controllers/
│   │   └── floodController.js   Risk engine, Open-Meteo integration, DataMeet GeoJSON proxy
│   ├── routes/
│   │   └── api.js               Route definitions for all /api/v1/* endpoints
│   ├── .env.example
│   ├── package.json
│   └── server.js                Express entry point — CORS, Helmet, rate-limiting, morgan
└── frontend/
    ├── public/
    │   └── favicon.svg
    ├── src/
    │   ├── components/
    │   │   ├── DashboardPanel.jsx   Sidebar: location search, quick-selects, risk cards, forecast strip
    │   │   └── InteractiveMap.jsx   React-Leaflet map, ChangeMapView utility, hazard circle layers
    │   ├── hooks/
    │   │   └── useFloodData.js      Async state management with in-flight request cancellation
    │   ├── utils/
    │   │   └── api.js               Centralised fetch client with timeout handling
    │   ├── App.jsx                  Root state orchestrator, marker history accumulation
    │   ├── index.css                Design system tokens, Leaflet CSS overrides
    │   └── main.jsx                 ReactDOM entry point
    ├── index.html
    ├── package.json
    └── vite.config.js               Build config and dev-server /api proxy
```

Request flow:

```
Client browser
    |
    v
React frontend (Vite, port 5173)
    |  /api/*  [proxied in dev; reverse-proxied in prod]
    v
Express backend (port 5000)
    |                        |
    v                        v
Open-Meteo API          DataMeet GitHub (raw GeoJSON)
(live weather)          (district boundaries)
```

---

## Technology Choices

**Open-Meteo** is used as the weather data source because it is a stateless, keyless REST API with no usage tiers or authentication surface area to manage. Each prediction request hits Open-Meteo directly from the backend with the target coordinates, which keeps the system horizontally scalable without any session or credential state.

**DataMeet Census 2011 GeoJSON** is used for Indian district boundaries because it provides administratively accurate polygons aligned to Indian census units — the correct granularity for district-level flood advisories. The boundaries are fetched on demand from the upstream GitHub raw URL and optionally filtered server-side, avoiding any need to bundle or version a multi-megabyte vector dataset locally.

**React-Leaflet** is used on the frontend rather than a heavier WebGL mapping library because the primary rendering requirement is circle overlays and popups at the district scale, not sub-metre terrain rendering. Leaflet's SVG/Canvas renderer handles this with minimal bundle weight.

**PostGIS** is the intended production database for persisting historical predictions, alert logs, and spatial queries against district boundaries. The current codebase ships with a drop-in mock adapter so the application runs without a database during development. The swap is a one-file change — see the database section below.

---

## Prerequisites

| Dependency | Minimum version |
|------------|----------------|
| Node.js    | 18.x            |
| npm        | 9.x             |

No Docker, no database, and no API credentials are required for local development.

---

## Setup and Running

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev        # nodemon — restarts on file changes
# or
npm start          # plain node
```

The API server starts on port 5000 by default. Confirm it is running:

```bash
curl http://localhost:5000/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "FloodVision Pro API",
  "version": "1.0.0",
  "timestamp": "...",
  "uptime": 4.2
}
```

### Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on port 5173. All requests to `/api/*` are proxied to `localhost:5000` by the Vite dev-server configuration, so no CORS changes are needed during local development.

Open `http://localhost:5173` in a browser.

---

## API Reference

All endpoints are mounted under `/api/v1`.

### GET /api/v1/health

Liveness probe. Returns process uptime and service metadata.

---

### GET /api/v1/risk-tiers

Returns the complete risk classification table used by the scoring engine. Intended for frontend legend rendering and colourscale generation without hardcoding values in the client.

---

### GET /api/v1/predict-location

Fetches live hourly weather for a coordinate pair from Open-Meteo, applies the composite risk model, and returns a structured assessment with a 24-hour forecast timeline.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `lat`     | number | yes      | Latitude in WGS-84 decimal degrees |
| `lon`     | number | yes      | Longitude in WGS-84 decimal degrees |
| `name`    | string | no       | URL-encoded human-readable location label |

Example request:

```
GET /api/v1/predict-location?lat=25.5941&lon=85.1376&name=Patna%2C%20Bihar
```

Response schema (abbreviated):

```json
{
  "success": true,
  "timestamp": "2024-08-01T10:00:00.000Z",
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
    "showersMmHr": 0.3,
    "windSpeedKmh": 18.4,
    "relativeHumidityPct": 88,
    "observedAt": "2024-08-01T10:00"
  },
  "riskAssessment": {
    "label": "ALERT MONITORING",
    "shortLabel": "Alert",
    "color": "#FFD600",
    "bgColor": "#FFFDE7",
    "percentage": 47,
    "description": "Moderate rainfall detected. Monitor water levels...",
    "imdClass": "Moderate Rain",
    "actionRequired": false,
    "inputs": {
      "rawRainRate": 6.2,
      "effectiveRainRate": 7.18,
      "windSpeedKmh": 18.4,
      "relativeHumidity": 88
    }
  },
  "forecastTimeline": [
    {
      "time": "2024-08-01T10:00",
      "precipMmHr": 6.2,
      "risk": { "label": "ALERT MONITORING", "color": "#FFD600", "percentage": 47 }
    }
  ]
}
```

---

### GET /api/v1/stream-districts

Fetches the DataMeet Census 2011 Indian district boundary GeoJSON from the upstream source and returns it to the client. Applies optional server-side filtering by state name.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `state`   | string | no       | Case-insensitive substring match against `STATE_NAME` property |

Example request:

```
GET /api/v1/stream-districts?state=assam
```

The response is a standard GeoJSON `FeatureCollection`. Response headers include `X-FloodVision-FeatureCount` with the number of features returned after filtering.

---

## Risk Calculation Logic

The scoring function `calculateRiskPercentage` in `floodController.js` implements the following:

### Step 1 — Effective rain rate

Raw precipitation is adjusted by two multipliers before tier classification:

```
effectiveRainRate = max(precipitation, rain, showers)
                  * windMultiplier
                  * humidityMultiplier
```

Wind multiplier: high wind drives rain at angles that increase surface runoff. The multiplier scales linearly with wind speed up to a maximum uplift of 30%:

```
windMultiplier = 1 + min((windSpeedKmh / 100) * 0.3, 0.3)
```

Humidity multiplier: soil near saturation has reduced infiltration capacity, increasing effective runoff. The multiplier applies uplift of up to 20% when relative humidity exceeds 40%:

```
humidityFactor  = max(0, (relativeHumidity - 40) / 50)   // 0 to 1
humidityMultiplier = 1 + humidityFactor * 0.2
```

### Step 2 — Tier classification

The effective rain rate is matched against five tiers derived from IMD rainfall classification:

| Tier | Label             | Effective rate (mm/hr) | IMD class               | Hex colour |
|------|-------------------|------------------------|-------------------------|------------|
| 0    | NORMAL            | < 2.5                  | Light / No Rain         | `#00C853`  |
| 1    | ALERT MONITORING  | 2.5 – 7.5              | Moderate Rain           | `#FFD600`  |
| 2    | ELEVATED RISK     | 7.5 – 15.5             | Heavy Rain              | `#FFA500`  |
| 3    | CRITICAL WARNING  | 15.5 – 64.4            | Very Heavy Rain         | `#FF1744`  |
| 4    | CATASTROPHIC      | > 64.4                 | Catastrophic            | `#6A1B9A`  |

### Step 3 — Continuous percentage

A continuous 0–100 percentage is derived from the position of the effective rain rate within the matched tier's range. This value drives progress bars and gauge fills in the frontend without step discontinuities at tier boundaries.

---

## Environment Variables

All variables are read by `dotenv` from `backend/.env`. Copy `backend/.env.example` to get started.

| Variable               | Default                                      | Description |
|------------------------|----------------------------------------------|-------------|
| `PORT`                 | `5000`                                       | HTTP server listen port |
| `NODE_ENV`             | `development`                                | Controls logging format and CORS policy |
| `ALLOWED_ORIGINS`      | `http://localhost:5173,http://localhost:3000` | Comma-separated CORS origin allowlist (enforced in production only) |
| `OPEN_METEO_BASE_URL`  | `https://api.open-meteo.com/v1/forecast`     | Open-Meteo API base URL |
| `DISTRICT_GEOJSON_URL` | DataMeet raw GitHub URL                      | District boundary GeoJSON source |
| `DB_HOST`              | (commented out)                              | PostgreSQL host — uncomment to enable PostGIS |
| `DB_PORT`              | (commented out)                              | PostgreSQL port |
| `DB_NAME`              | (commented out)                              | Database name |
| `DB_USER`              | (commented out)                              | Database user |
| `DB_PASSWORD`          | (commented out)                              | Database password |

---

## Production Build

### Backend

```bash
cd backend
NODE_ENV=production npm start
```

Set `ALLOWED_ORIGINS` in `.env` to the production frontend domain before deploying. The rate limiter is configured to allow 60 requests per minute per IP by default; adjust in `server.js` as needed.

### Frontend

```bash
cd frontend
npm run build
# Output: frontend/dist/
```

Serve `dist/` as static files. In production, configure a reverse proxy (Nginx, Caddy) to route requests with the `/api` prefix to the backend service.

---

## Connecting a PostGIS Database

The mock database adapter in `backend/config/database.js` exposes the same `db.query(sql, params)` interface as `pg-pool`, so switching to a live database requires only the following:

1. Install the driver:
   ```bash
   cd backend && npm install pg
   ```
2. Fill in the `DB_*` variables in `.env`.
3. In `backend/config/database.js`, uncomment the `pg-pool` block and remove the mock export at the bottom of the file.

No controller code needs to change.

---

## Data Sources

| Source | URL | Licence |
|--------|-----|---------|
| Open-Meteo | https://open-meteo.com | CC BY 4.0 |
| DataMeet Census 2011 district boundaries | https://github.com/datameet/maps | Open Data Commons ODbL |

---

## Licence

MIT
