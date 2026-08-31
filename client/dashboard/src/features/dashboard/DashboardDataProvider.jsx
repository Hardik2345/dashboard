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

export function DashboardDataProvider({ children }) {
  const cacheRef = useRef(new Map());
  const inflightRef = useRef(new Map());
  const [activeRequests, setActiveRequests] = useState(0);
  const [lastError, setLastError] = useState(null);

  const requestResource = useCallback(async (namespace, params, fetcher) => {
    const resourceKey = `${namespace}:${stableSerialize(params || {})}`;

    if (cacheRef.current.has(resourceKey)) {
      return cacheRef.current.get(resourceKey);
    }

    if (inflightRef.current.has(resourceKey)) {
      return inflightRef.current.get(resourceKey);
    }

    setActiveRequests((count) => count + 1);
    const request = Promise.resolve()
      .then(() => fetcher(params || {}))
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

    inflightRef.current.set(resourceKey, request);
    return request;
  }, []);

  const getDashboardSummary = useCallback(
    (params) =>
      requestResource("dashboard-summary", params, apiGetDashboardSummary),
    [requestResource],
  );
  const getProductKpis = useCallback(
    (params) => requestResource("product-kpis", params, apiGetProductKpis),
    [requestResource],
  );
  const getTrafficSourceSplit = useCallback(
    (params) =>
      requestResource("traffic-source-split", params, apiGetTrafficSourceSplit),
    [requestResource],
  );
  const getOrderSplit = useCallback(
    (params) => requestResource("order-split", params, apiGetOrderSplit),
    [requestResource],
  );
  const getPaymentSalesSplit = useCallback(
    (params) =>
      requestResource("payment-sales-split", params, apiGetPaymentSalesSplit),
    [requestResource],
  );
  const getPaymentSplitSummary = useCallback(
    (params) =>
      requestResource("payment-split-summary", params, apiGetPaymentSplitSummary),
    [requestResource],
  );
  const getPaymentSplitTrend = useCallback(
    (params) =>
      requestResource("payment-split-trend", params, apiGetPaymentSplitTrend),
    [requestResource],
  );
  const getHourlyTrend = useCallback(
    (params) => requestResource("hourly-trend", params, apiGetHourlyTrend),
    [requestResource],
  );
  const getDailyTrend = useCallback(
    (params) => requestResource("daily-trend", params, apiGetDailyTrend),
    [requestResource],
  );
  const getMonthlyTrend = useCallback(
    (params) => requestResource("monthly-trend", params, apiGetMonthlyTrend),
    [requestResource],
  );
  const getWebPerformanceSummary = useCallback(
    (params) =>
      requestResource(
        "web-performance-summary",
        params,
        apiGetWebPerformanceSummary,
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
