import { useEffect, useState, useMemo } from "react";
import Grid from "@mui/material/Grid2";
import { Stack, Typography, Box, useTheme } from "@mui/material";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";
import { GlassChip } from "./ui/GlassChip.jsx";
import KPIStat from "./KPIStat.jsx";
import { getDashboardSummary, getProductKpis } from "../lib/api.js";
import { useInrCurrency } from "../lib/currency.js";
import useWebVitals from "../hooks/useWebVitals.js";

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfFloat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const nfPct = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 2,
});

export default function KPIs({
  query,
  selectedMetric,
  onSelectMetric,
  onLoaded,
  onFunnelData,
  productId,
  productLabel,
  utmOptions, // Prop from App
  showRow = null, // null for both, 1 for row 1, 2 for row 2
  compareMode = false,
  showWebVitals = true,
  showCiEvents = true,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [loading, setLoading] = useState(true);
  const [deltaLoading, setDeltaLoading] = useState(true);
  const [data, setData] = useState({});
  const [revenueMode, setRevenueMode] = useState("G"); // 'T' | 'G'
  const [atcMode, setAtcMode] = useState("R"); // 'R' (Rate) | 'S' (Sessions)
  const [checkoutMode, setCheckoutMode] = useState("C"); // 'C' (Count) | 'R' (Rate)
  const [cancellationMode, setCancellationMode] = useState("C"); // 'C' | 'R'
  const start = query?.start;
  const end = query?.end;
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;
  const scopedProductId = (productId || "").toString().trim();
  const isProductScoped = scopedProductId.length > 0;
  const utmSource = query?.utm_source;
  const utmMedium = query?.utm_medium;
  const utmCampaign = query?.utm_campaign;
  const salesChannel = query?.sales_channel;
  const deviceType = query?.device_type;
  const discountCode = query?.discount_code;
  const city = query?.city;
  const compareStart = query?.compare_start;
  const compareEnd = query?.compare_end;
  const { convertAmount, formatConvertedAmount } = useInrCurrency(brandKey, end);
  const webVitalsData = useWebVitals(query, "PERFORMANCE", {
    usePerformanceSummary: true,
  });

  const scopeLabel = useMemo(() => {
    if (!isProductScoped) return "All products";
    return productLabel || scopedProductId;
  }, [isProductScoped, productLabel, scopedProductId]);

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setData({});
      setLoading(false);
      setDeltaLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setDeltaLoading(true);

    if (isProductScoped) {
      const base = brandKey
        ? { start, end, brand_key: brandKey, product_id: scopedProductId }
        : { start, end, product_id: scopedProductId };

      getProductKpis(base)
        .then((resp) => {
          if (cancelled) return;
          if (resp.error) {
            setData({});
            setLoading(false);
            return;
          }

          const orders = { value: resp.total_orders ?? 0 };
          const sales = { value: resp.total_sales ?? 0 };
          const aovValue =
            orders.value > 0 ? resp.total_sales / orders.value : 0;

          const funnel = {
            total_sessions: resp.sessions ?? 0,
            total_atc_sessions: resp.sessions_with_cart_additions ?? 0,
            total_orders: orders.value,
          };

          const cvr = {
            cvr: resp.conversion_rate ?? 0,
            cvr_percent: resp.conversion_rate_pct ?? 0,
            total_orders: orders.value,
            total_sessions: funnel.total_sessions,
          };

          const aov = {
            aov: aovValue,
            total_sales: sales.value,
            total_orders: orders.value,
          };

          const returnsData = {
            cancelled_orders: resp.cancelled_orders ?? 0,
            refunded_orders: resp.refunded_orders ?? 0,
            cancelled_rate:
              orders.value > 0
                ? (resp.cancelled_orders ?? 0) / orders.value
                : 0,
            refunded_rate:
              orders.value > 0 ? (resp.refunded_orders ?? 0) / orders.value : 0,
          };

          setData((prev) => ({
            ...prev,
            orders,
            sales,
            aov,
            cvr,
            funnel,
            returnsData,
          }));
          setLoading(false);
          setDeltaLoading(false);
          if (typeof onLoaded === "function") {
            onLoaded(new Date());
          }
        })
        .catch(() => {
          setLoading(false);
          setDeltaLoading(false);
        });
    } else {
      const base = brandKey
        ? {
            start,
            end,
            brand_key: brandKey,
            align: "hour",
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            sales_channel: salesChannel,
            device_type: deviceType,
            discount_code: discountCode,
            city: query?.city,
          }
        : {
            start,
            end,
            align: "hour",
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            sales_channel: salesChannel,
            device_type: deviceType,
            discount_code: discountCode,
            city: query?.city,
          };
      if (compareStart && compareEnd) {
        base.compare_start = compareStart;
        base.compare_end = compareEnd;
        base._t = Date.now(); // cache-bust for compare mode
      }

      // Fetch summary first for fast value rendering (cache-backed)
      getDashboardSummary(base)
        .then((resp) => {
          if (cancelled) return;
          if (resp.error || !resp.metrics) {
            setData({});
            setLoading(false);
            return;
          }
          const m = resp.metrics || {};
          const orders = { value: m.total_orders?.value ?? 0 };
          const sales = { value: m.total_sales?.value ?? 0 };
          const aov = { aov: m.average_order_value?.value ?? 0 };
          const totalCiEvents = { value: m.total_ci_events?.value ?? 0 };
          const sessions = m.total_sessions?.value ?? 0;
          const atcSessions = m.total_atc_sessions?.value ?? 0;
          const unavailable = {
            sessions: !!m.total_sessions?.unavailable,
            atc: !!m.total_atc_sessions?.unavailable || !!m.atc_rate?.unavailable,
            ci:
              !!m.total_ci_events?.unavailable || !!m.checkout_rate?.unavailable,
            cvr: !!m.conversion_rate?.unavailable,
            returns: !!m.cancelled_orders?.unavailable || !!m.refunded_orders?.unavailable,
          };

          const returnsData = {
            cancelled_orders: m.cancelled_orders?.value ?? 0,
            refunded_orders: m.refunded_orders?.value ?? 0,
            cancelled_rate:
              orders.value > 0
                ? (m.cancelled_orders?.value ?? 0) / orders.value
                : 0,
            refunded_rate:
              orders.value > 0
                ? (m.refunded_orders?.value ?? 0) / orders.value
                : 0,
          };

          const cvrVal = m.conversion_rate?.value ?? 0;
          const cvr = {
            cvr: cvrVal / 100,
            cvr_percent: cvrVal,
            total_orders: orders.value,
            total_sessions: sessions,
          };
          const funnel = {
            total_sessions: sessions,
            total_atc_sessions: atcSessions,
            total_ci_events: m.total_ci_events?.value ?? 0,
            total_orders: orders.value,
          };

          const ordersDelta = {
            diff_pct: m.total_orders?.diff_pct ?? 0,
            direction: m.total_orders?.direction ?? "flat",
          };
          const salesDelta = {
            diff_pct: m.total_sales?.diff_pct ?? 0,
            direction: m.total_sales?.direction ?? "flat",
          };
          const aovDelta = {
            diff_pct: m.average_order_value?.diff_pct ?? 0,
            direction: m.average_order_value?.direction ?? "flat",
          };
          const cvrDelta = {
            diff_pct: m.conversion_rate?.diff_pct ?? 0,
            diff_pp: m.conversion_rate?.diff_pp,
            direction: m.conversion_rate?.direction ?? "flat",
          };
          const sessDelta = {
            diff_pct: m.total_sessions?.diff_pct ?? 0,
            direction: m.total_sessions?.direction ?? "flat",
          };
          const atcDelta = {
            diff_pct: m.total_atc_sessions?.diff_pct ?? 0,
            direction: m.total_atc_sessions?.direction ?? "flat",
          };
          const ciDelta = {
            diff_pct: m.total_ci_events?.diff_pct ?? 0,
            direction: m.total_ci_events?.direction ?? "flat",
          };
          const checkoutRateDelta = {
            diff_pct: m.checkout_rate?.diff_pct ?? 0,
            direction: m.checkout_rate?.direction ?? "flat",
          };
          const cancelledRateDelta = {
            diff_pct: m.cancelled_orders?.diff_pct ?? 0,
            direction: m.cancelled_orders?.direction ?? "flat",
          };
          const refundedRateDelta = {
            diff_pct: m.refunded_orders?.diff_pct ?? 0,
            direction: m.refunded_orders?.direction ?? "flat",
          };

          const atcRateDelta = {
            diff_pct: m.atc_rate?.diff_pct ?? 0,
            direction: m.atc_rate?.direction ?? "flat",
          };

          // Extract previous (compare) values when available
          const cmpOrders = m.total_orders?.previous ?? null;
          const cmpSales = m.total_sales?.previous ?? null;
          const cmpAov = m.average_order_value?.previous ?? null;
          const cmpCvr = m.conversion_rate?.previous ?? null;
          const cmpSessions = m.total_sessions?.previous ?? null;
          const cmpAtcSessions = m.total_atc_sessions?.previous ?? null;
          const cmpCiEvents = m.total_ci_events?.previous ?? null;
          const cmpCheckoutRate =
            m.checkout_rate?.previous != null
              ? m.checkout_rate.previous / 100
              : cmpSessions != null && cmpCiEvents != null && cmpSessions > 0
                ? cmpCiEvents / cmpSessions
                : null;
          const cmpAtcRate =
            m.atc_rate?.previous != null
              ? m.atc_rate.previous / 100
              : cmpSessions != null && cmpAtcSessions != null && cmpSessions > 0
                ? cmpAtcSessions / cmpSessions
                : null;
          const prevCancelledRate =
            cmpOrders > 0
              ? (m.cancelled_orders?.previous ?? 0) / cmpOrders
              : null;
          const prevRefundedRate =
            cmpOrders > 0
              ? (m.refunded_orders?.previous ?? 0) / cmpOrders
              : null;

          setData((prev) => ({
            ...prev,
            orders,
            sales,
            aov,
            total_ci_events: totalCiEvents,
            cvr,
            funnel,
            returnsData,
            ordersDelta,
            salesDelta,
            aovDelta,
            cvrDelta,
            sessDelta,
            atcDelta,
            ciDelta,
            checkoutRateDelta,
            atcRateDelta,
            cancelledRateDelta,
            refundedRateDelta,
            // Compare values
            prevOrders: cmpOrders,
            prevSales: cmpSales,
            prevAov: cmpAov,
            prevCvr: cmpCvr,
            prevSessions: cmpSessions,
            prevAtcSessions: cmpAtcSessions,
            prevCiEvents: cmpCiEvents,
            prevCheckoutRate: cmpCheckoutRate,
            prevAtcRate: cmpAtcRate,
            prevCancelledRate,
            prevRefundedRate,
            unavailable,
          }));
          setLoading(false);
          setDeltaLoading(false);
          if (typeof onLoaded === "function") {
            onLoaded(new Date());
          }
        })
        .catch(() => {
          if (cancelled) return;
          setLoading(false);
          setDeltaLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    start,
    end,
    brandKey,
    refreshKey,
    isProductScoped,
    scopedProductId,
    onLoaded,
    utmSource,
    utmMedium,
    utmCampaign,
    salesChannel,
    deviceType,
    discountCode,
    city,
    compareStart,
    compareEnd,
  ]);

  const totalSessions =
    data.cvr?.total_sessions || data.funnel?.total_sessions || 0;
  const totalAtcSessions = data.funnel?.total_atc_sessions || 0;
  const cvrDeltaValue = data.cvrDelta
    ? (data.cvrDelta.diff_pct ?? data.cvrDelta.diff_pp)
    : undefined;

  const formatUTM = (key, val, options) => {
    if (!val || !Array.isArray(val) || val.length === 0) return null;
    const allOptions = options?.[`utm_${key}`] || [];
    if (allOptions.length > 0 && val.length === allOptions.length) {
      return `${key}: all`;
    }
    return `${key}: ${val}`;
  };

  const activeFilters = [
    formatUTM("source", utmSource, utmOptions) && {
      label: formatUTM("source", utmSource, utmOptions),
      key: "source",
    },
    formatUTM("medium", utmMedium, utmOptions) && {
      label: formatUTM("medium", utmMedium, utmOptions),
      key: "medium",
    },
    formatUTM("campaign", utmCampaign, utmOptions) && {
      label: formatUTM("campaign", utmCampaign, utmOptions),
      key: "campaign",
    },
    discountCode && {
      label: `discount: ${discountCode}`,
      key: "discount",
    },
  ].filter(Boolean);

  // Emit funnel data to parent for FunnelChart (avoids redundant API call)
  useEffect(() => {
    if (typeof onFunnelData !== "function") return;
    if (!data.funnel) return;
    onFunnelData({
      stats: data.funnel,
      deltas: {
        sessions: data.sessDelta || null,
        atc: data.atcDelta || null,
        ci: data.ciDelta || null,
        orders: data.cvrDelta || null,
      },
      loading: loading || deltaLoading,
    });
  }, [
    data.funnel,
    data.sessDelta,
    data.atcDelta,
    data.ordersDelta,
    loading,
    deltaLoading,
    onFunnelData,
  ]);

  return (
    <>
      {/* Desktop-only Active Filters & Scope Label */}
      {(showRow === null || showRow === 1) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1.5, display: { xs: "none", md: "flex" } }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            Scope: {scopeLabel}
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {activeFilters.map((f) => (
              <GlassChip
                key={f.key}
                label={f.label}
                size="small"
                isDark={isDark}
                active={true}
                sx={{
                  maxWidth: 200,
                }}
              />
            ))}
            {isProductScoped && (
              <Typography variant="caption" color="text.secondary">
                Using product-level KPIs
              </Typography>
            )}
          </Box>
        </Stack>
      )}
      <Grid container spacing={2} columns={12}>
        {/* Row 1: Total Orders, Revenue, AOV, CVR (4 items) */}
        {(showRow === null || showRow === 1 || showRow === "mobile_top") && (
          <>
            <Grid
              size={{ xs: 6, sm: 6, md: 3 }}
              sx={{ order: { xs: 1, md: 0 } }}
            >
              <KPIStat
                label="Total Orders"
                value={data.orders?.value ?? 0}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) => nfInt.format(v)}
                delta={
                  data.ordersDelta
                    ? {
                        value: data.ordersDelta.diff_pct,
                        direction: data.ordersDelta.direction,
                      }
                    : undefined
                }
                onSelect={
                  onSelectMetric ? () => onSelectMetric("orders") : undefined
                }
                selected={selectedMetric === "orders"}
                compareValue={
                  compareMode && data.prevOrders != null
                    ? data.prevOrders
                    : undefined
                }
                compareFormatter={(v) => nfInt.format(v)}
              />
            </Grid>
            <Grid
              size={{ xs: 6, sm: 6, md: 3 }}
              sx={{ order: { xs: 2, md: 0 } }}
            >
              <KPIStat
                label={revenueMode === "G" ? "Gross Revenue" : "Net Revenue"}
                action={
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      bgcolor: "background.default",
                      borderRadius: 12,
                      p: 0.5,
                      cursor: "pointer",
                      zIndex: 2,
                      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                      border: "1px solid",
                      borderColor: "divider",
                      transition: "all 0.3s ease",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRevenueMode((prev) => (prev === "G" ? "N" : "G"));
                    }}
                  >
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 10,
                        bgcolor:
                          revenueMode === "G" ? "primary.main" : "transparent",
                        color:
                          revenueMode === "G"
                            ? "primary.contrastText"
                            : "text.secondary",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                        boxShadow:
                          revenueMode === "G"
                            ? "0 1px 2px rgba(0,0,0,0.2)"
                            : "none",
                      }}
                    >
                      G
                    </Box>
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 10,
                        bgcolor:
                          revenueMode === "N" ? "#3b82f6" : "transparent",
                        color: revenueMode === "N" ? "#fff" : "text.secondary",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                        boxShadow:
                          revenueMode === "N"
                            ? "0 1px 2px rgba(0,0,0,0.2)"
                            : "none",
                      }}
                    >
                      N
                    </Box>
                  </Box>
                }
                value={
                  revenueMode === "G"
                    ? convertAmount(data.sales?.value ?? 0)
                    : convertAmount(data.sales?.value ?? 0) / 1.18
                }
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) =>
                  formatConvertedAmount(v, { maximumFractionDigits: 0 })
                }
                delta={
                  data.salesDelta
                    ? {
                        value: data.salesDelta.diff_pct,
                        direction: data.salesDelta.direction,
                      }
                    : undefined
                }
                onSelect={
                  onSelectMetric ? () => onSelectMetric("sales") : undefined
                }
                selected={selectedMetric === "sales"}
                activeColor={revenueMode === "G" ? "#10b981" : "#3b82f6"}
                compareValue={
                  compareMode && data.prevSales != null
                    ? revenueMode === "G"
                      ? convertAmount(data.prevSales)
                      : convertAmount(data.prevSales) / 1.18
                    : undefined
                }
                compareFormatter={(v) =>
                  formatConvertedAmount(v, { maximumFractionDigits: 0 })
                }
              />
            </Grid>
            <Grid
              size={{ xs: 6, sm: 6, md: 3 }}
              sx={{ order: { xs: 3, md: 0 } }}
            >
              <KPIStat
                label="Average order value"
                value={convertAmount(data.aov?.aov ?? 0)}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) =>
                  formatConvertedAmount(v, { maximumFractionDigits: 0 })
                }
                delta={
                  data.aovDelta
                    ? {
                        value: data.aovDelta.diff_pct,
                        direction: data.aovDelta.direction,
                      }
                    : undefined
                }
                onSelect={
                  onSelectMetric ? () => onSelectMetric("aov") : undefined
                }
                selected={selectedMetric === "aov"}
                compareValue={
                  compareMode && data.prevAov != null
                    ? convertAmount(data.prevAov)
                    : undefined
                }
                compareFormatter={(v) =>
                  formatConvertedAmount(v, { maximumFractionDigits: 0 })
                }
              />
            </Grid>
            <Grid
              size={{ xs: 12, sm: 6, md: 3 }}
              sx={{ order: { xs: 7, md: 0 } }}
            >
              <KPIStat
                label={
                  cancellationMode === "C" ? "Cancellation Rate" : "Refund Rate"
                }
                centerOnMobile={true}
                action={
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      bgcolor: "background.default",
                      borderRadius: 12,
                      p: 0.5,
                      cursor: "pointer",
                      zIndex: 2,
                      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                      border: "1px solid",
                      borderColor: "divider",
                      transition: "all 0.3s ease",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCancellationMode((prev) => (prev === "C" ? "R" : "C"));
                    }}
                  >
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 10,
                        bgcolor:
                          cancellationMode === "C"
                            ? "error.main"
                            : "transparent",
                        color:
                          cancellationMode === "C"
                            ? "error.contrastText"
                            : "text.secondary",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                        boxShadow:
                          cancellationMode === "C"
                            ? "0 1px 2px rgba(0,0,0,0.2)"
                            : "none",
                      }}
                    >
                      C
                    </Box>
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 10,
                        bgcolor:
                          cancellationMode === "R"
                            ? "warning.main"
                            : "transparent",
                        color:
                          cancellationMode === "R" ? "#fff" : "text.secondary",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                        boxShadow:
                          cancellationMode === "R"
                            ? "0 1px 2px rgba(0,0,0,0.2)"
                            : "none",
                      }}
                    >
                      R
                    </Box>
                  </Box>
                }
                value={
                  cancellationMode === "C"
                    ? (data.returnsData?.cancelled_rate ?? 0)
                    : (data.returnsData?.refunded_rate ?? 0)
                }
                unavailable={data.unavailable?.returns}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) => nfPct.format(v)}
                delta={
                  cancellationMode === "C" && data.cancelledRateDelta
                    ? {
                        value: data.cancelledRateDelta.diff_pct,
                        direction: data.cancelledRateDelta.direction,
                      }
                    : cancellationMode === "R" && data.refundedRateDelta
                      ? {
                          value: data.refundedRateDelta.diff_pct,
                          direction: data.refundedRateDelta.direction,
                        }
                      : undefined
                }
                selected={false}
                activeColor={cancellationMode === "C" ? "#ef4444" : "#f59e0b"}
                invertDeltaColor={true}
                compareValue={
                  compareMode
                    ? cancellationMode === "C" && data.prevCancelledRate != null
                      ? data.prevCancelledRate
                      : cancellationMode === "R" &&
                          data.prevRefundedRate != null
                        ? data.prevRefundedRate
                        : undefined
                    : undefined
                }
                compareFormatter={(v) => nfPct.format(v)}
              />
            </Grid>
          </>
        )}

        {/* Row 2 split: Sessions, ATC, CI and Conversion */}
        {(showRow === null ||
          showRow === 2 ||
          showRow === "sessions_atc" ||
          showRow === "mobile_top") && (
          <>
            <Grid
              size={{ xs: 6, sm: 6, md: showCiEvents ? 3 : 4 }}
              sx={{ order: { xs: 5, md: 0 } }}
            >
              <KPIStat
                label="Total Sessions"
                value={totalSessions}
                unavailable={data.unavailable?.sessions}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) => nfInt.format(v)}
                delta={
                  data.sessDelta
                    ? {
                        value: data.sessDelta.diff_pct,
                        direction: data.sessDelta.direction,
                      }
                    : undefined
                }
                onSelect={
                  onSelectMetric && !data.unavailable?.sessions
                    ? () => onSelectMetric("sessions")
                    : undefined
                }
                selected={selectedMetric === "sessions"}
                compareValue={
                  compareMode && data.prevSessions != null
                    ? data.prevSessions
                    : undefined
                }
                compareFormatter={(v) => nfInt.format(v)}
              />
            </Grid>
            <Grid
              size={{ xs: 6, sm: 6, md: showCiEvents ? 3 : 4 }}
              sx={{ order: { xs: 6, md: 0 } }}
            >
              <KPIStat
                label={atcMode === "R" ? "ATC Rate" : "ATC Sessions"}
                action={
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      bgcolor: "background.default",
                      borderRadius: 12,
                      p: 0.5,
                      cursor: "pointer",
                      zIndex: 2,
                      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                      border: "1px solid",
                      borderColor: "divider",
                      transition: "all 0.3s ease",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextMode = atcMode === "R" ? "S" : "R";
                      setAtcMode(nextMode);
                      // Auto-update graph if the card is currently selected
                      if (
                        selectedMetric === "atc" ||
                        selectedMetric === "atc_rate"
                      ) {
                        if (typeof onSelectMetric === "function") {
                          onSelectMetric(nextMode === "R" ? "atc_rate" : "atc");
                        }
                      }
                    }}
                  >
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 10,
                        bgcolor:
                          atcMode === "R" ? "#f59e0b" : "transparent",
                        color:
                          atcMode === "R"
                            ? "#fff"
                            : "text.secondary",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                        boxShadow:
                          atcMode === "R"
                            ? "0 1px 2px rgba(0,0,0,0.2)"
                            : "none",
                      }}
                    >
                      R
                    </Box>
                    <Box
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 10,
                        bgcolor: atcMode === "S" ? "primary.main" : "transparent",
                        color: atcMode === "S" ? "primary.contrastText" : "text.secondary",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        transition: "all 0.2s ease",
                        boxShadow:
                          atcMode === "S"
                            ? "0 1px 2px rgba(0,0,0,0.2)"
                            : "none",
                      }}
                    >
                      S
                    </Box>
                  </Box>
                }
                value={
                  atcMode === "R"
                    ? totalSessions > 0
                      ? totalAtcSessions / totalSessions
                      : 0
                    : totalAtcSessions
                }
                unavailable={data.unavailable?.atc}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={
                  atcMode === "R"
                    ? (v) => nfPct.format(v)
                    : (v) => nfInt.format(v)
                }
                delta={
                  atcMode === "R" && data.atcRateDelta
                    ? {
                        value: data.atcRateDelta.diff_pct,
                        direction: data.atcRateDelta.direction,
                      }
                    : atcMode === "S" && data.atcDelta
                      ? {
                          value: data.atcDelta.diff_pct,
                          direction: data.atcDelta.direction,
                        }
                      : undefined
                }
                onSelect={
                  onSelectMetric && !data.unavailable?.atc
                    ? () => onSelectMetric(atcMode === "R" ? "atc_rate" : "atc")
                    : undefined
                }
                selected={
                  selectedMetric === "atc" || selectedMetric === "atc_rate"
                }
                activeColor={atcMode === "S" ? "#f59e0b" : "#10b981"}
                compareValue={
                  compareMode
                    ? atcMode === "R" && data.prevAtcRate != null
                      ? data.prevAtcRate
                      : atcMode === "S" && data.prevAtcSessions != null
                        ? data.prevAtcSessions
                        : undefined
                    : undefined
                }
                compareFormatter={
                  atcMode === "R"
                    ? (v) => nfPct.format(v)
                    : (v) => nfInt.format(v)
                }
              />
            </Grid>
            {showCiEvents && (
              <Grid
                size={{ xs: 12, sm: 6, md: 3 }}
                sx={{ order: { xs: 7, md: 0 } }}
              >
                <KPIStat
                  label={
                    checkoutMode === "R"
                      ? "Checkout Rate"
                      : "Checkout Initiated Events"
                  }
                  action={
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        bgcolor: "background.default",
                        borderRadius: 12,
                        p: 0.5,
                        cursor: "pointer",
                        zIndex: 2,
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
                        border: "1px solid",
                        borderColor: "divider",
                        transition: "all 0.3s ease",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextMode = checkoutMode === "R" ? "C" : "R";
                        setCheckoutMode(nextMode);
                        if (
                          selectedMetric === "ci_events" ||
                          selectedMetric === "checkout_rate"
                        ) {
                          if (typeof onSelectMetric === "function") {
                            onSelectMetric(
                              nextMode === "R" ? "checkout_rate" : "ci_events",
                            );
                          }
                        }
                      }}
                    >
                      <Box
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: 10,
                          bgcolor:
                            checkoutMode === "C"
                              ? "primary.main"
                              : "transparent",
                          color:
                            checkoutMode === "C"
                              ? "primary.contrastText"
                              : "text.secondary",
                          fontSize: "0.65rem",
                          fontWeight: 600,
                          transition: "all 0.2s ease",
                          boxShadow:
                            checkoutMode === "C"
                              ? "0 1px 2px rgba(0,0,0,0.2)"
                              : "none",
                        }}
                      >
                        C
                      </Box>
                      <Box
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: 10,
                          bgcolor:
                            checkoutMode === "R" ? "#10b981" : "transparent",
                          color:
                            checkoutMode === "R" ? "#fff" : "text.secondary",
                          fontSize: "0.65rem",
                          fontWeight: 600,
                          transition: "all 0.2s ease",
                          boxShadow:
                            checkoutMode === "R"
                              ? "0 1px 2px rgba(0,0,0,0.2)"
                              : "none",
                        }}
                      >
                        R
                      </Box>
                    </Box>
                  }
                  value={
                    checkoutMode === "R"
                      ? totalSessions > 0
                        ? (data.total_ci_events?.value ?? 0) / totalSessions
                        : 0
                      : data.total_ci_events?.value ?? 0
                  }
                  centerOnMobile={true}
                  unavailable={data.unavailable?.ci}
                  loading={loading}
                  deltaLoading={deltaLoading}
                  formatter={
                    checkoutMode === "R"
                      ? (v) => nfPct.format(v)
                      : (v) => nfInt.format(v)
                  }
                  delta={
                    checkoutMode === "R" && data.checkoutRateDelta
                      ? {
                          value: data.checkoutRateDelta.diff_pct,
                          direction: data.checkoutRateDelta.direction,
                        }
                      : checkoutMode === "C" && data.ciDelta
                        ? {
                            value: data.ciDelta.diff_pct,
                            direction: data.ciDelta.direction,
                          }
                        : undefined
                  }
                  onSelect={
                    onSelectMetric && !data.unavailable?.ci
                      ? () =>
                          onSelectMetric(
                            checkoutMode === "R"
                              ? "checkout_rate"
                              : "ci_events",
                          )
                      : undefined
                  }
                  selected={
                    selectedMetric === "ci_events" ||
                    selectedMetric === "checkout_rate"
                  }
                  activeColor={
                    checkoutMode === "R"
                      ? "#10b981"
                      : theme.palette.primary.main
                  }
                  compareValue={
                    compareMode
                      ? checkoutMode === "R" && data.prevCheckoutRate != null
                        ? data.prevCheckoutRate
                        : checkoutMode === "C" && data.prevCiEvents != null
                          ? data.prevCiEvents
                          : undefined
                      : undefined
                  }
                  compareFormatter={
                    checkoutMode === "R"
                      ? (v) => nfPct.format(v)
                      : (v) => nfInt.format(v)
                  }
                />
              </Grid>
            )}
          </>
        )}

        {/* Row 2 split: Conversion */}
        {(showRow === null ||
          showRow === 2 ||
          showRow === "web_perf_cvr" ||
          showRow === "mobile_top") && (
          <Grid
            size={{ xs: 6, sm: 6, md: showCiEvents ? 3 : 4 }}
            sx={{ order: { xs: 4, md: 0 } }}
          >
            <KPIStat
              label="Conversion Rate"
              value={data.cvr?.cvr ?? 0}
              unavailable={data.unavailable?.cvr}
              loading={loading}
              deltaLoading={deltaLoading}
              formatter={(v) => nfPct.format(v)}
              delta={
                typeof cvrDeltaValue === "number" && data.cvrDelta
                  ? {
                      value: cvrDeltaValue,
                      direction: data.cvrDelta.direction,
                    }
                  : undefined
              }
              onSelect={
                onSelectMetric && !data.unavailable?.cvr
                  ? () => onSelectMetric("cvr")
                  : undefined
              }
              selected={selectedMetric === "cvr"}
              compareValue={
                compareMode && data.prevCvr != null
                  ? data.prevCvr / 100
                  : undefined
              }
              compareFormatter={(v) => nfPct.format(v)}
            />
          </Grid>
        )}
        {(showRow === null || showRow === 2 || showRow === "mobile_top") &&
          showWebVitals && (
            <Grid
              size={{ xs: 12, sm: 6, md: 3 }}
              sx={{ order: { xs: 8, md: 0 } }}
            >
              <KPIStat
                label="Web Performance(Avg)"
                value={webVitalsData.performanceAvg ?? 0}
                loading={webVitalsData.loading}
                deltaLoading={webVitalsData.loading}
                formatter={(v) => nfFloat.format(v)}
                delta={
                  typeof webVitalsData.performanceChange === "number"
                    ? {
                        value: webVitalsData.performanceChange,
                        direction:
                          webVitalsData.performanceChange > 0
                            ? "up"
                            : webVitalsData.performanceChange < 0
                              ? "down"
                              : "flat",
                      }
                    : undefined
                }
                centerOnMobile={true}
              />
            </Grid>
          )}
      </Grid>
    </>
  );
}
