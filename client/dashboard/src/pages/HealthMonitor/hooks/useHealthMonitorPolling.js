import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_INTERVAL_MS = 45 * 1000;

// Shared polling driver for the Health Monitor panel — one interval feeds
// the status banner + KPI row + service grid, instead of every consumer
// running its own setInterval and refetching independently.
export function useHealthMonitorPolling(fetchFn, intervalMs = DEFAULT_INTERVAL_MS) {
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const refresh = useCallback(async () => {
    await fetchFnRef.current();
    setLastUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    const intervalId = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [refresh, intervalMs]);

  return { lastUpdatedAt, refresh };
}
