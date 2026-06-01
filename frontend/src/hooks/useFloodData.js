/**
 * FloodVision Pro – useFloodData.js
 * ───────────────────────────────────
 * Custom hook that encapsulates all async state management for flood
 * risk predictions. Components remain pure-presentational.
 *
 * Usage:
 *   const { data, loading, error, fetchLocation, clear } = useFloodData();
 */

import { useState, useCallback, useRef } from "react";
import { fetchPrediction } from "../utils/api";

export function useFloodData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ref to abort in-flight requests when a new one starts
  const abortRef = useRef(null);

  /**
   * Fetch a prediction for the supplied coordinates.
   *
   * @param {number} lat
   * @param {number} lon
   * @param {string} [name]
   */
  const fetchLocation = useCallback(async (lat, lon, name = "") => {
    // Cancel any previous in-flight request
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }

    setLoading(true);
    setError(null);

    let cancelled = false;
    abortRef.current = () => { cancelled = true; };

    try {
      const result = await fetchPrediction(lat, lon, name);
      if (!cancelled) {
        setData(result);
      }
    } catch (err) {
      if (!cancelled) {
        setError(err.message || "Failed to fetch flood risk data.");
        setData(null);
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, []);

  /** Reset state (e.g. when user clears the search) */
  const clear = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, fetchLocation, clear };
}
