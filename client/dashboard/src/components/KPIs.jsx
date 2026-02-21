import { useEffect, useState, useMemo } from "react";
import Grid from "@mui/material/Grid2";
import { Stack, Typography, Box, useTheme, useMediaQuery } from "@mui/material";
import { GlassChip } from "./ui/GlassChip.jsx";
import KPIStat from "./KPIStat.jsx";
import {
  getDashboardSummary,
  getProductKpis,
} from "../lib/api.js";
import useWebVitals from "../hooks/useWebVitals.js";

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfMoney = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const nfMoney2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0, // Changed to 0 decimals per design image
});
const nfPct = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 2,
});
const nfFloat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

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
  showWebVitals = true,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(true);
  const [deltaLoading, setDeltaLoading] = useState(true);
  const [data, setData] = useState({});
  const [revenueMode, setRevenueMode] = useState('T'); // 'T' | 'N'
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
  const compare = query?.compare;

  // Web Vitals Hook
  const webVitalsData = useWebVitals(query, 'Performance');

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
          const aovValue = orders.value > 0 ? resp.total_sales / orders.value : 0;

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

          setData((prev) => ({ ...prev, orders, sales, aov, cvr, funnel }));
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
        ? { start, end, brand_key: brandKey, align: "hour", utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, sales_channel: salesChannel, device_type: deviceType, compare }
        : { start, end, align: "hour", utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, sales_channel: salesChannel, device_type: deviceType, compare };

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
          const sessions = m.total_sessions?.value ?? 0;
          const atcSessions = m.total_atc_sessions?.value ?? 0;

          const cvrVal = m.conversion_rate?.value ?? 0;
          const cvr = {
            cvr: cvrVal / 100,
            cvr_percent: cvrVal,
            total_orders: orders.value,
            total_sessions: sessions
          };
          const funnel = {
            total_sessions: sessions,
            total_atc_sessions: atcSessions,
            total_orders: orders.value
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

          setData((prev) => ({
            ...prev,
            orders,
            sales,
            aov,
            cvr,
            funnel,
            ordersDelta,
            salesDelta,
            aovDelta,
            cvrDelta,
            sessDelta,
            atcDelta,
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
  }, [start, end, brandKey, refreshKey, isProductScoped, scopedProductId, onLoaded, utmSource, utmMedium, utmCampaign, salesChannel, deviceType, compare]);

  const totalSessions = data.cvr?.total_sessions || data.funnel?.total_sessions || 0;
  const totalAtcSessions = data.funnel?.total_atc_sessions || 0;
  const cvrDeltaValue = data.cvrDelta
    ? data.cvrDelta.diff_pct ?? data.cvrDelta.diff_pp
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
    formatUTM('source', utmSource, utmOptions) && { label: formatUTM('source', utmSource, utmOptions), key: 'source' },
    formatUTM('medium', utmMedium, utmOptions) && { label: formatUTM('medium', utmMedium, utmOptions), key: 'medium' },
    formatUTM('campaign', utmCampaign, utmOptions) && { label: formatUTM('campaign', utmCampaign, utmOptions), key: 'campaign' }
  ].filter(Boolean);

  // Emit funnel data to parent for FunnelChart (avoids redundant API call)
  useEffect(() => {
    if (typeof onFunnelData !== 'function') return;
    if (!data.funnel) return;
    onFunnelData({
      stats: data.funnel,
      deltas: {
        sessions: data.sessDelta || null,
        atc: data.atcDelta || null,
        orders: data.cvrDelta || null,
      },
      loading: loading || deltaLoading,
    });
  }, [data.funnel, data.sessDelta, data.atcDelta, data.ordersDelta, loading, deltaLoading, onFunnelData]);

  return (
    <>
      {/* Desktop-only Active Filters & Scope Label */}
      {(showRow === null || showRow === 1) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1.5, display: { xs: 'none', md: 'flex' } }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            Scope: {scopeLabel}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeFilters.map(f => (
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
        {(showRow === null || showRow === 1) && (
          <>
            <Grid size={{ xs: 6, sm: 6, md: 3 }}>
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
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 3 }}>
              <KPIStat
                label={revenueMode === 'T' ? "Total Revenue" : "Net Revenue"}
                action={
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      bgcolor: 'background.default',
                      borderRadius: 12,
                      p: 0.5,
                      cursor: 'pointer',
                      zIndex: 2,
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
                      border: '1px solid',
                      borderColor: 'divider',
                      transition: 'all 0.3s ease'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRevenueMode(prev => prev === 'T' ? 'N' : 'T');
                    }}
                  >
                    <Box sx={{
                      px: 1, py: 0.25,
                      borderRadius: 10,
                      bgcolor: revenueMode === 'T' ? 'primary.main' : 'transparent',
                      color: revenueMode === 'T' ? 'primary.contrastText' : 'text.secondary',
                      fontSize: '0.65rem', fontWeight: 600,
                      transition: 'all 0.2s ease',
                      boxShadow: revenueMode === 'T' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                    }}>T</Box>
                    <Box sx={{
                      px: 1, py: 0.25,
                      borderRadius: 10,
                      bgcolor: revenueMode === 'N' ? '#3b82f6' : 'transparent',
                      color: revenueMode === 'N' ? '#fff' : 'text.secondary',
                      fontSize: '0.65rem', fontWeight: 600,
                      transition: 'all 0.2s ease',
                      boxShadow: revenueMode === 'N' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                    }}>N</Box>
                  </Box>
                }
                value={revenueMode === 'T' ? (data.sales?.value ?? 0) : ((data.sales?.value ?? 0) / 1.18)}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) => nfMoney.format(v)}
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
                activeColor={revenueMode === 'T' ? '#10b981' : '#3b82f6'}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 3 }}>
              <KPIStat
                label="Average order value"
                value={data.aov?.aov ?? 0}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) => nfMoney2.format(v)}
                delta={
                  data.aovDelta
                    ? {
                      value: data.aovDelta.diff_pct,
                      direction: data.aovDelta.direction,
                    }
                    : undefined
                }
                onSelect={onSelectMetric ? () => onSelectMetric("aov") : undefined}
                selected={selectedMetric === "aov"}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 3 }}>
              {isMobile ? (
                /* Original CVR position for mobile Row 1 */
                <KPIStat
                  label="Conversion Rate"
                  value={data.cvr?.cvr ?? 0}
                  loading={loading}
                  deltaLoading={deltaLoading}
                  formatter={(v) => nfPct.format(v)}
                  delta={
                    typeof cvrDeltaValue === "number" && data.cvrDelta
                      ? { value: cvrDeltaValue, direction: data.cvrDelta.direction }
                      : undefined
                  }
                  onSelect={onSelectMetric ? () => onSelectMetric("cvr") : undefined}
                  selected={selectedMetric === "cvr"}
                />
              ) : (
                /* New Web Performance position for desktop Row 1 */
                showWebVitals ? (
                  <KPIStat
                    label="Web Performance(Avg)"
                    value={webVitalsData.performanceAvg ?? 0}
                    loading={webVitalsData.loading}
                    deltaLoading={webVitalsData.loading}
                    formatter={(v) => nfFloat.format(v)}
                    delta={
                      webVitalsData.performanceChange !== null
                        ? {
                          value: webVitalsData.performanceChange,
                          direction: webVitalsData.performanceChange > 0 ? 'up' : 'down'
                        }
                        : undefined
                    }
                    selected={false}
                  />
                ) : (
                  <KPIStat
                    label="Conversion Rate"
                    value={data.cvr?.cvr ?? 0}
                    loading={loading}
                    deltaLoading={deltaLoading}
                    formatter={(v) => nfPct.format(v)}
                    delta={
                      typeof cvrDeltaValue === "number" && data.cvrDelta
                        ? { value: cvrDeltaValue, direction: data.cvrDelta.direction }
                        : undefined
                    }
                    onSelect={onSelectMetric ? () => onSelectMetric("cvr") : undefined}
                    selected={selectedMetric === "cvr"}
                  />
                )
              )}
            </Grid>
          </>
        )}

        {/* Row 2 split: Sessions and ATC */}
        {(showRow === null || showRow === 2 || showRow === 'sessions_atc') && (
          <>
            <Grid size={{ xs: 6, sm: 4, md: showWebVitals ? 4 : 6 }}>
              <KPIStat
                label="Total Sessions"
                value={totalSessions}
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
                  onSelectMetric ? () => onSelectMetric("sessions") : undefined
                }
                selected={selectedMetric === "sessions"}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: showWebVitals ? 4 : 6 }}>
              <KPIStat
                label="ATC Sessions"
                value={totalAtcSessions}
                loading={loading}
                deltaLoading={deltaLoading}
                formatter={(v) => nfInt.format(v)}
                delta={
                  data.atcDelta
                    ? {
                      value: data.atcDelta.diff_pct,
                      direction: data.atcDelta.direction,
                    }
                    : undefined
                }
                onSelect={onSelectMetric ? () => onSelectMetric("atc") : undefined}
                selected={selectedMetric === "atc"}
              />
            </Grid>
          </>
        )}

        {/* Row 2 split: Web Performance (Mobile) or CVR (Desktop) */}
        {(showRow === null || showRow === 2 || showRow === 'web_perf_cvr') && (showWebVitals || isMobile) && (
          <>
            <Grid size={{ xs: 12, sm: 4, md: 4 }}>
              {isMobile ? (
                /* Original Web Performance position for mobile Row 2 */
                showWebVitals ? (
                  <KPIStat
                    label="Web Performance(Avg)"
                    value={webVitalsData.performanceAvg ?? 0}
                    loading={webVitalsData.loading}
                    deltaLoading={webVitalsData.loading}
                    formatter={(v) => nfFloat.format(v)}
                    delta={
                      webVitalsData.performanceChange !== null
                        ? {
                          value: webVitalsData.performanceChange,
                          direction: webVitalsData.performanceChange > 0 ? 'up' : 'down'
                        }
                        : undefined
                    }
                    selected={false}
                    centerOnMobile={true}
                  />
                ) : null
              ) : (
                /* New CVR position for desktop Row 2 */
                showWebVitals ? (
                  <KPIStat
                    label="Conversion Rate"
                    value={data.cvr?.cvr ?? 0}
                    loading={loading}
                    deltaLoading={deltaLoading}
                    formatter={(v) => nfPct.format(v)}
                    delta={
                      typeof cvrDeltaValue === "number" && data.cvrDelta
                        ? { value: cvrDeltaValue, direction: data.cvrDelta.direction }
                        : undefined
                    }
                    onSelect={onSelectMetric ? () => onSelectMetric("cvr") : undefined}
                    selected={selectedMetric === "cvr"}
                  />
                ) : null
              )}
            </Grid>
          </>
        )}
      </Grid>
    </>
  );
}
