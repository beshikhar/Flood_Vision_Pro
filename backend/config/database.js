/**
 * FloodVision Pro – database.js
 * ─────────────────────────────
 * PostGIS / PostgreSQL connection framework.
 *
 * Currently operates as a clean mock/placeholder so the rest of the
 * application runs without a live database.  When you are ready to
 * connect a real PostGIS instance:
 *
 *   1. `npm install pg`  (or `npm install pg-pool`)
 *   2. Fill in the DB_* variables in your .env file
 *   3. Uncomment the pg-pool block below and remove the mock object.
 *
 * The interface exported here (`db.query`) mirrors the pg-pool API so
 * every controller that calls `db.query(sql, params)` will work
 * identically after the swap.
 */

"use strict";

require("dotenv").config();

// ── Production PostGIS connection (uncomment when ready) ─────────────────────
//
// const { Pool } = require("pg");
//
// const pool = new Pool({
//   host:     process.env.DB_HOST     || "localhost",
//   port:     parseInt(process.env.DB_PORT || "5432", 10),
//   database: process.env.DB_NAME     || "floodvision",
//   user:     process.env.DB_USER     || "postgres",
//   password: process.env.DB_PASSWORD || "",
//   max: 10,                  // max pool size
//   idleTimeoutMillis: 30000,
//   connectionTimeoutMillis: 2000,
// });
//
// pool.on("error", (err) => {
//   console.error("[DB] Unexpected client error:", err.message);
// });
//
// const db = {
//   query: (text, params) => pool.query(text, params),
//   getClient: () => pool.connect(),
// };
//
// module.exports = db;

// ── Mock / placeholder database object ───────────────────────────────────────

const mockDb = {
  /**
   * Mock query – logs the intent and resolves with an empty result set.
   * Replace with the real pool.query() call when PostGIS is available.
   *
   * @param {string} text   - SQL query string
   * @param {Array}  params - Parameterised values
   * @returns {Promise<{rows: Array, rowCount: number}>}
   */
  query: async (text, params = []) => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[DB Mock] Query intercepted:");
      console.log("  SQL   :", text.trim().slice(0, 120));
      console.log("  Params:", params);
    }
    return { rows: [], rowCount: 0 };
  },

  /**
   * Mock client checkout – useful for transaction stubs.
   */
  getClient: async () => ({
    query: async (text, params) => mockDb.query(text, params),
    release: () => {},
  }),

  /** Runtime flag so controllers can branch behaviour if needed. */
  isMock: true,
};

console.log(
  "[DB] Running with MOCK database adapter. " +
    "Set up PostGIS and uncomment the pool block in config/database.js when ready."
);

module.exports = mockDb;
