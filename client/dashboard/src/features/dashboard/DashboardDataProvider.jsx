/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getDashboardSummary as apiGetDashboardSummary,
  getProductKpis as apiGetProductKpis,
  getTrafficSourceSplit as apiGetTrafficSourceSplit,
  getOrderSplit as apiGetOrderSplit,
  getPaymentSalesSplit as apiGetPaymentSalesSplit,
  getPaymentSplitSummary as apiGetPaymentSplitSummary,
  getPaymentSplitTrend as apiGetPaymentSplitTrend,
  getHourlyTrend as apiGetHourlyTrend,
  getDailyTrend as apiGetDailyTrend,
  getMonthlyTrend as apiGetMonthlyTrend,
  getWebPerformanceSummary as apiGetWebPerformanceSummary,
} from "../../lib/api.js";

const DashboardDataContext = createContext(null);

function stableSerialize(value) {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// Requests are grouped into priority tiers so the page's ~15-20 simultaneous
// calls don't all compete for the shared per-brand DB connection pool at
// once. A tier-N request waits for tier (N-1)'s first request to settle (or
// a safety timeout, so a stuck/erroring earlier tier can never block later
// ones forever) before it fires. This only affects *when* a request starts —
// each widget's own loading UI is unchanged.
const TIER_MAX_WAIT_MS = 4000;

export function DashboardDataProvider({ children }) {
  const cacheRef = useRef(new Map());
  const inflightRef = useRef(new Map());
  const tierGatesRef = useRef({});
  const [activeRequests, setActiveRequests] = useState(0);
  const [lastError, setLastError] = useState(null);

  const waitForTier = useCallback(async (tier) => {
    const gate = tierGatesRef.current[tier];
    if (!gate) return;
    await Promise.race([
      gate,
      new Promise((resolve) => setTimeout(resolve, TIER_MAX_WAIT_MS)),
    ]);
  }, []);

  const requestResource = useCallback(
    (namespace, params, fetcher, tier = 1) => {
      const resourceKey = `${namespace}:${stableSerialize(params || {})}`;

      if (cacheRef.current.has(resourceKey)) {
        return Promise.resolve(cacheRef.current.get(resourceKey));
      }

      if (inflightRef.current.has(resourceKey)) {
        return inflightRef.current.get(resourceKey);
      }

      setActiveRequests((count) => count + 1);
      const request = (async () => {
        if (tier > 1) {
          await waitForTier(tier - 1);
        }
        return fetcher(params || {});
      })()
        .then((result) => {
          cacheRef.current.set(resourceKey, result);
          setLastError(null);
          return result;
        })
        .catch((error) => {
          setLastError(error);
          throw error;
        })
        .finally(() => {
          inflightRef.current.delete(resourceKey);
          setActiveRequests((count) => Math.max(0, count - 1));
        });

      if (!tierGatesRef.current[tier]) {
        tierGatesRef.current[tier] = request.catch(() => {});
      }

      inflightRef.current.set(resourceKey, request);
      return request;
    },
    [waitForTier],
  );

  // Tier 1 — KPI cards, loads first.
  const getDashboardSummary = useCallback(
    (params) =>
      requestResource("dashboard-summary", params, apiGetDashboardSummary, 1),
    [requestResource],
  );

  // Tier 2 — trend graph, loads once the KPI cards' request has settled.
  const getHourlyTrend = useCallback(
    (params) => requestResource("hourly-trend", params, apiGetHourlyTrend, 2),
    [requestResource],
  );
  const getDailyTrend = useCallback(
    (params) => requestResource("daily-trend", params, apiGetDailyTrend, 2),
    [requestResource],
  );
  const getMonthlyTrend = useCallback(
    (params) => requestResource("monthly-trend", params, apiGetMonthlyTrend, 2),
    [requestResource],
  );

  // Tier 3 — everything else (includes the confirmed-slow Payment Split
  // family), loads once the trend graph's request has settled.
  const getProductKpis = useCallback(
    (params) => requestResource("product-kpis", params, apiGetProductKpis, 3),
    [requestResource],
  );
  const getTrafficSourceSplit = useCallback(
    (params) =>
      requestResource(
        "traffic-source-split",
        params,
        apiGetTrafficSourceSplit,
        3,
      ),
    [requestResource],
  );
  const getOrderSplit = useCallback(
    (params) => requestResource("order-split", params, apiGetOrderSplit, 3),
    [requestResource],
  );
  const getPaymentSalesSplit = useCallback(
    (params) =>
      requestResource(
        "payment-sales-split",
        params,
        apiGetPaymentSalesSplit,
        3,
      ),
    [requestResource],
  );
  const getPaymentSplitSummary = useCallback(
    (params) =>
      requestResource(
        "payment-split-summary",
        params,
        apiGetPaymentSplitSummary,
        3,
      ),
    [requestResource],
  );
  const getPaymentSplitTrend = useCallback(
    (params) =>
      requestResource(
        "payment-split-trend",
        params,
        apiGetPaymentSplitTrend,
        3,
      ),
    [requestResource],
  );
  const getWebPerformanceSummary = useCallback(
    (params) =>
      requestResource(
        "web-performance-summary",
        params,
        apiGetWebPerformanceSummary,
        3,
      ),
    [requestResource],
  );

  const api = useMemo(
    () => ({
      getDashboardSummary,
      getProductKpis,
      getTrafficSourceSplit,
      getOrderSplit,
      getPaymentSalesSplit,
      getPaymentSplitSummary,
      getPaymentSplitTrend,
      getHourlyTrend,
      getDailyTrend,
      getMonthlyTrend,
      getWebPerformanceSummary,
      isLoading: activeRequests > 0,
      activeRequests,
      lastError,
    }),
    [
      activeRequests,
      getDailyTrend,
      getDashboardSummary,
      getHourlyTrend,
      getMonthlyTrend,
      getOrderSplit,
      getPaymentSalesSplit,
      getPaymentSplitSummary,
      getPaymentSplitTrend,
      getProductKpis,
      getTrafficSourceSplit,
      getWebPerformanceSummary,
      lastError,
    ],
  );

  return (
    <DashboardDataContext.Provider value={api}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardDataApi() {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new Error("useDashboardDataApi must be used within DashboardDataProvider");
  }
  return context;
}
