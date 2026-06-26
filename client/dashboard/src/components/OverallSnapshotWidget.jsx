import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Card,
  CardContent,
  FormControl,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { getOverallSnapshot } from "../lib/api.js";
import { resolveBrandCurrency } from "../lib/currency.js";

const MAX_VISIBLE_METRICS = 2;
const MAX_VISIBLE_BRANDS = 6;
const DEFAULT_SELECTED_METRICS = ["cvr", "net_revenue"];

const METRIC_CATALOG = [
  {
    id: "net_revenue",
    summaryKey: "total_sales",
    label: "Net Revenue",
    kind: "currency",
    getValue: (metric) => Number(metric?.value || 0) / 1.18,
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "cvr",
    summaryKey: "conversion_rate",
    label: "CVR",
    kind: "percent",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "gross_revenue",
    summaryKey: "total_sales",
    label: "Gross Revenue",
    kind: "currency",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "aov",
    summaryKey: "average_order_value",
    label: "AOV",
    kind: "currency",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "orders",
    summaryKey: "total_orders",
    label: "Orders",
    kind: "number",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "sessions",
    summaryKey: "total_sessions",
    label: "Sessions",
    kind: "number",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "atc_rate",
    summaryKey: "atc_rate",
    label: "ATC Rate",
    kind: "percent",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "checkout_rate",
    summaryKey: "checkout_rate",
    label: "Checkout Rate",
    kind: "percent",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
  {
    id: "ci_events",
    summaryKey: "total_ci_events",
    label: "Checkout Initiated",
    kind: "number",
    getValue: (metric) => Number(metric?.value || 0),
    getDelta: (metric) => Number(metric?.diff_pct || 0),
    getDirection: (metric) => metric?.direction || "flat",
  },
];

const METRIC_BY_ID = Object.fromEntries(
  METRIC_CATALOG.map((metric) => [metric.id, metric]),
);

function formatCurrency(value, brandKey) {
  const currency = resolveBrandCurrency(brandKey);
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatMetricValue(metricConfig, rawMetric, brandKey) {
  if (!rawMetric || rawMetric.unavailable) return "--";
  const value = metricConfig.getValue(rawMetric);
  if (metricConfig.kind === "currency") return formatCurrency(value, brandKey);
  if (metricConfig.kind === "percent") return formatPercent(value);
  return formatNumber(value);
}

function formatDelta(metricConfig, rawMetric) {
  if (!rawMetric || rawMetric.unavailable) return null;
  const value = metricConfig.getDelta(rawMetric);
  const direction = metricConfig.getDirection(rawMetric);
  return {
    direction,
    label: `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`,
  };
}

function getMetricSortValue(metricConfig, metrics) {
  const rawMetric = metrics?.[metricConfig.summaryKey];
  if (!rawMetric || rawMetric.unavailable) return Number.NEGATIVE_INFINITY;
  return metricConfig.getValue(rawMetric);
}

function SnapshotMetricBlock({ metricConfig, rawMetric, brandKey }) {
  const delta = formatDelta(metricConfig, rawMetric);
  const tone =
    delta?.direction === "up"
      ? "success.main"
      : delta?.direction === "down"
        ? "error.main"
        : "text.secondary";

  return (
    <Stack spacing={0.75} sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontWeight: 800,
          color: "text.secondary",
          fontSize: { xs: "0.68rem", md: "0.75rem" },
        }}
      >
        {metricConfig.label}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: "1.35rem", md: "1.5rem" },
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}
      >
        {formatMetricValue(metricConfig, rawMetric, brandKey)}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 800, color: tone }}>
        {delta ? `${delta.label} vs previous` : "No comparison data"}
      </Typography>
    </Stack>
  );
}

function SnapshotCardSkeleton() {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: "26px",
        borderColor: "rgba(255,255,255,0.08)",
        bgcolor: "rgba(255,255,255,0.03)",
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={2.2}>
          <Skeleton variant="rounded" width="100%" height={66} />
          <Skeleton variant="rounded" width="100%" height={110} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function normalizeBrandOption(brand) {
  const brandKey =
    typeof brand === "string"
      ? brand.toString().trim().toUpperCase()
      : (brand?.brand_key || brand?.key || "").toString().trim().toUpperCase();
  if (!brandKey) return null;

  return {
    brand_key: brandKey,
    brand_name:
      (brand?.brand_name || brand?.name || brandKey).toString().trim() || brandKey,
  };
}

export default function OverallSnapshotWidget({
  query,
  brands = [],
  brandsLoading = false,
  onBrandSelect,
}) {
  const [selectedMetrics, setSelectedMetrics] = useState(DEFAULT_SELECTED_METRICS);
  const [selectedBrandKeys, setSelectedBrandKeys] = useState([]);
  const [sortMetric, setSortMetric] = useState(DEFAULT_SELECTED_METRICS[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshot, setSnapshot] = useState({ brands: [], metric_keys: [] });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    getOverallSnapshot({
      start: query?.start,
      end: query?.end,
      compare_start: query?.compare_start,
      compare_end: query?.compare_end,
      utm_source: query?.utm_source,
      utm_medium: query?.utm_medium,
      utm_campaign: query?.utm_campaign,
      utm_term: query?.utm_term,
      utm_content: query?.utm_content,
      sales_channel: query?.sales_channel,
      device_type: query?.device_type,
      discount_code: query?.discount_code,
      brand_keys: (Array.isArray(brands) ? brands : [])
        .map((brand) => (typeof brand === "string" ? brand : brand?.key))
        .filter(Boolean),
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        setSnapshot({
          brands: Array.isArray(response?.brands) ? response.brands : [],
          metric_keys: Array.isArray(response?.metric_keys) ? response.metric_keys : [],
        });
        setError(!!response?.error);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          setSnapshot({ brands: [], metric_keys: [] });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    brands,
    query?.compare_end,
    query?.compare_start,
    query?.device_type,
    query?.discount_code,
    query?.end,
    query?.sales_channel,
    query?.start,
    query?.utm_campaign,
    query?.utm_content,
    query?.utm_medium,
    query?.utm_term,
    query?.utm_source,
  ]);

  const availableMetrics = useMemo(() => {
    const backendKeys = new Set(snapshot.metric_keys || []);
    return METRIC_CATALOG.filter(
      (metric) =>
        metric.id === "net_revenue" ||
        metric.id === "gross_revenue" ||
        backendKeys.has(metric.summaryKey),
    );
  }, [snapshot.metric_keys]);

  useEffect(() => {
    if (loading && (snapshot.metric_keys || []).length === 0) {
      return;
    }

    const allowedMetricIds = new Set(availableMetrics.map((metric) => metric.id));
    setSelectedMetrics((prev) => {
      const fallback = DEFAULT_SELECTED_METRICS.filter((metricId) =>
        allowedMetricIds.has(metricId),
      );
      const filtered = prev.filter((metricId) => allowedMetricIds.has(metricId));
      const next = [...fallback];

      for (const metricId of filtered) {
        if (next.length >= MAX_VISIBLE_METRICS) break;
        if (!next.includes(metricId)) next.push(metricId);
      }

      for (const metricId of fallback) {
        if (next.length >= MAX_VISIBLE_METRICS) break;
        if (!next.includes(metricId)) next.push(metricId);
      }

      for (const metric of availableMetrics) {
        if (next.length >= MAX_VISIBLE_METRICS) break;
        if (!next.includes(metric.id)) next.push(metric.id);
      }
      return next.slice(0, MAX_VISIBLE_METRICS);
    });
  }, [availableMetrics, loading, snapshot.metric_keys]);

  useEffect(() => {
    if (!selectedMetrics.includes(sortMetric)) {
      setSortMetric(selectedMetrics[0] || "");
    }
  }, [selectedMetrics, sortMetric]);

  const orderedBrands = useMemo(() => {
    const metricConfig = METRIC_BY_ID[sortMetric] || METRIC_BY_ID[selectedMetrics[0]];
    const items = Array.isArray(snapshot.brands) ? [...snapshot.brands] : [];
    if (!metricConfig) return items;

    return items
      .sort((left, right) => {
        const leftValue = getMetricSortValue(metricConfig, left.metrics);
        const rightValue = getMetricSortValue(metricConfig, right.metrics);
        if (leftValue !== rightValue) return rightValue - leftValue;
        return String(left.brand_name || left.brand_key || "").localeCompare(
          String(right.brand_name || right.brand_key || ""),
        );
      });
  }, [selectedMetrics, snapshot.brands, sortMetric]);

  const allBrandOptions = useMemo(() => {
    const seen = new Set();
    const options = [];

    for (const brand of Array.isArray(brands) ? brands : []) {
      const normalized = normalizeBrandOption(brand);
      if (!normalized || seen.has(normalized.brand_key)) continue;
      seen.add(normalized.brand_key);
      options.push(normalized);
    }

    for (const brand of orderedBrands) {
      const normalized = normalizeBrandOption(brand);
      if (!normalized || seen.has(normalized.brand_key)) continue;
      seen.add(normalized.brand_key);
      options.push(normalized);
    }

    return options;
  }, [brands, orderedBrands]);

  useEffect(() => {
    setSelectedBrandKeys((prev) => {
      const availableKeys = allBrandOptions
        .map((brand) => brand.brand_key)
        .filter(Boolean);
      const availableSet = new Set(availableKeys);
      const kept = prev.filter((brandKey) => availableSet.has(brandKey));
      const next = [...kept];

      for (const brandKey of availableKeys) {
        if (next.length >= MAX_VISIBLE_BRANDS) break;
        if (!next.includes(brandKey)) next.push(brandKey);
      }

      const limited = next.slice(0, MAX_VISIBLE_BRANDS);
      const prevComparable =
        prev.length === limited.length &&
        prev.every((brandKey, index) => brandKey === limited[index]);

      return prevComparable ? prev : limited;
    });
  }, [allBrandOptions]);

  const visibleBrands = useMemo(() => {
    const snapshotByKey = new Map(
      orderedBrands.map((brand) => [brand.brand_key, brand]),
    );
    const fallbackByKey = new Map(
      allBrandOptions.map((brand) => [
        brand.brand_key,
        {
          brand_key: brand.brand_key,
          brand_name: brand.brand_name,
          status: "unavailable",
          metrics: null,
        },
      ]),
    );
    const activeKeys = selectedBrandKeys.length
      ? selectedBrandKeys
      : allBrandOptions.slice(0, MAX_VISIBLE_BRANDS).map((brand) => brand.brand_key);

    return activeKeys
      .map((brandKey) => snapshotByKey.get(brandKey) || fallbackByKey.get(brandKey))
      .filter(Boolean);
  }, [allBrandOptions, orderedBrands, selectedBrandKeys]);

  const handleMetricClick = (metricId) => {
    setSelectedMetrics((prev) => {
      const current = prev.filter((id) => id !== metricId);
      if (prev.includes(metricId)) {
        return [metricId, ...current].slice(0, MAX_VISIBLE_METRICS);
      }
      return [metricId, ...prev].slice(0, MAX_VISIBLE_METRICS);
    });
    setSortMetric(metricId);
  };

  const handleBrandChipClick = (brandKey) => {
    setSelectedBrandKeys((prev) => {
      if (prev.includes(brandKey)) {
        if (prev.length === 1) return prev;
        return prev.filter((key) => key !== brandKey);
      }
      return [...prev, brandKey].slice(-MAX_VISIBLE_BRANDS);
    });
  };

  const selectedMetricLabels = useMemo(
    () =>
      selectedMetrics
        .map((metricId) => METRIC_BY_ID[metricId]?.label)
        .filter(Boolean)
        .join(" and "),
    [selectedMetrics],
  );

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: "30px",
        borderColor: "rgba(255,255,255,0.12)",
        bgcolor: "background.paper",
        backgroundImage:
          "radial-gradient(circle at top left, rgba(11,107,203,0.12), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
        overflow: "hidden",
      }}
    >
      <CardContent sx={{ p: { xs: 1.2, md: 3 } }}>
        <Stack spacing={{ xs: 1.4, md: 3 }}>
          <Grid container spacing={{ xs: 1, md: 2 }}>
            <Grid size={{ xs: 12, xl: 4 }}>
              <Box
                sx={{
                  height: "100%",
                  borderRadius: "24px",
                  p: { xs: 1.35, md: 2.6 },
                  border: "1px solid rgba(91,163,224,0.18)",
                  bgcolor: "rgba(255,255,255,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: { xs: 1.1, md: 2.4 },
                }}
              >
                <Stack spacing={{ xs: 0.45, md: 0.9 }}>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 900,
                      letterSpacing: "-0.04em",
                      fontSize: { xs: "1.9rem", md: undefined },
                    }}
                  >
                    Overall Snapshot
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ fontSize: { xs: "0.86rem", md: undefined }, lineHeight: 1.45 }}
                  >
                    Cross-brand command view for fast KPI comparison and one-click brand switching.
                  </Typography>
                </Stack>

                <Grid container spacing={{ xs: 0.8, md: 1.2 }}>
                  <Grid size={{ xs: 6 }}>
                    <Box
                      sx={{
                        p: { xs: 1, md: 1.4 },
                        borderRadius: "18px",
                        bgcolor: "rgba(91,163,224,0.14)",
                        border: "1px solid rgba(91,163,224,0.22)",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Brands in view
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{ fontWeight: 900, mt: 0.2, fontSize: { xs: "1.55rem", md: undefined } }}
                      >
                        {visibleBrands.length}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Box
                      sx={{
                        p: { xs: 1, md: 1.4 },
                        borderRadius: "18px",
                        bgcolor: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Active compare
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 800,
                          mt: 0.2,
                          lineHeight: 1.2,
                          fontSize: { xs: "0.92rem", md: undefined },
                        }}
                      >
                        {selectedMetricLabels || "Select metrics"}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, xl: 8 }}>
              <Box
                sx={{
                  borderRadius: "24px",
                  p: { xs: 1.15, md: 2 },
                  border: "1px solid rgba(255,255,255,0.08)",
                  bgcolor: "rgba(255,255,255,0.02)",
                }}
              >
                <Stack spacing={{ xs: 1.15, md: 2 }}>
                  <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={{ xs: 1.6, lg: 2 }}
                    justifyContent="space-between"
                    alignItems={{ xs: "stretch", lg: "flex-start" }}
                  >
                    <Stack spacing={1.05} sx={{ flex: 1 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 900,
                          color: "text.secondary",
                          letterSpacing: "0.1em",
                        }}
                      >
                        METRIC PALETTE
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 0.7, md: 1 } }}>
                        {availableMetrics.map((metric) => {
                          const selected = selectedMetrics.includes(metric.id);
                          return (
                            <ButtonBase
                              key={metric.id}
                              onClick={() => handleMetricClick(metric.id)}
                              sx={{
                                px: { xs: 1, md: 1.45 },
                                py: { xs: 0.65, md: 0.95 },
                                borderRadius: "999px",
                                border: "1px solid",
                                borderColor: selected
                                  ? "rgba(91,163,224,0.48)"
                                  : "rgba(255,255,255,0.08)",
                                bgcolor: selected
                                  ? "rgba(91,163,224,0.18)"
                                  : "rgba(255,255,255,0.04)",
                                color: selected ? "primary.light" : "text.primary",
                                fontSize: { xs: "0.74rem", md: "0.9rem" },
                                fontWeight: 800,
                                transition: "all 160ms ease",
                                "&:hover": {
                                  borderColor: selected
                                    ? "rgba(91,163,224,0.62)"
                                    : "rgba(255,255,255,0.16)",
                                  bgcolor: selected
                                    ? "rgba(91,163,224,0.22)"
                                    : "rgba(255,255,255,0.08)",
                                },
                              }}
                            >
                              {metric.label}
                            </ButtonBase>
                          );
                        })}
                      </Box>
                    </Stack>

                    <Stack
                      spacing={0.9}
                      sx={{ width: { xs: "100%", lg: 300 }, flexShrink: 0 }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 900,
                          color: "text.secondary",
                          letterSpacing: "0.1em",
                        }}
                      >
                        SORTING
                      </Typography>
                      <FormControl size="small" fullWidth>
                        <Select
                          value={sortMetric}
                          onChange={(event) => setSortMetric(event.target.value)}
                          sx={{
                            borderRadius: "16px",
                            minHeight: { xs: 40, md: 46 },
                            bgcolor: "rgba(0,0,0,0.12)",
                            "& .MuiOutlinedInput-notchedOutline": {
                              borderColor: "rgba(255,255,255,0.12)",
                            },
                          }}
                        >
                          {selectedMetrics.map((metricId) => {
                            const metric = METRIC_BY_ID[metricId];
                            if (!metric) return null;
                            return (
                              <MenuItem key={metricId} value={metricId}>
                                {metric.label} (High to Low)
                              </MenuItem>
                            );
                          })}
                        </Select>
                      </FormControl>
                    </Stack>
                  </Stack>

                  <Stack spacing={1.05}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 900,
                          color: "text.secondary",
                          letterSpacing: "0.1em",
                        }}
                      >
                        BRANDS IN VIEW
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        {selectedBrandKeys.length}/{MAX_VISIBLE_BRANDS} selected
                      </Typography>
                    </Stack>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 0.7, md: 1 } }}>
                      {allBrandOptions.map((brand) => {
                        const brandKey = brand.brand_key;
                        const selected = selectedBrandKeys.includes(brandKey);
                        return (
                          <ButtonBase
                            key={brandKey}
                            onClick={() => handleBrandChipClick(brandKey)}
                            sx={{
                              px: { xs: 0.95, md: 1.45 },
                              py: { xs: 0.62, md: 0.95 },
                              borderRadius: "999px",
                              border: "1px solid",
                              borderColor: selected
                                ? "rgba(91,163,224,0.48)"
                                : "rgba(255,255,255,0.08)",
                              bgcolor: selected
                                ? "rgba(91,163,224,0.18)"
                                : "rgba(255,255,255,0.04)",
                              color: selected ? "primary.light" : "text.primary",
                              fontSize: { xs: "0.72rem", md: "0.9rem" },
                              fontWeight: 800,
                              transition: "all 160ms ease",
                              "&:hover": {
                                borderColor: selected
                                  ? "rgba(91,163,224,0.62)"
                                  : "rgba(255,255,255,0.16)",
                                bgcolor: selected
                                  ? "rgba(91,163,224,0.22)"
                                  : "rgba(255,255,255,0.08)",
                              },
                            }}
                          >
                            {brand.brand_name || brandKey}
                          </ButtonBase>
                        );
                      })}
                    </Box>
                  </Stack>
                </Stack>
              </Box>
            </Grid>
          </Grid>

          {error && !loading && (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              Overall Snapshot could not load all brand metrics. Showing available results only.
            </Alert>
          )}

          <Box
            sx={{
              maxHeight: {
                xs: "none",
                md: "calc(100svh - 320px)",
              },
              overflowY: {
                xs: "visible",
                md: "auto",
              },
              overflowX: "hidden",
              pr: {
                xs: 0,
                md: 0.75,
              },
              mr: {
                xs: 0,
                md: -0.75,
              },
              "&::-webkit-scrollbar": {
                width: 10,
              },
              "&::-webkit-scrollbar-track": {
                background: "rgba(255,255,255,0.04)",
                borderRadius: 999,
              },
              "&::-webkit-scrollbar-thumb": {
                background: "rgba(91,163,224,0.28)",
                borderRadius: 999,
              },
            }}
          >
            <Grid container spacing={{ xs: 1.15, md: 2.4 }}>
              {(loading || brandsLoading) &&
                Array.from({ length: 6 }).map((_, index) => (
                  <Grid key={`snapshot-skeleton-${index}`} size={{ xs: 12, md: 6, xl: 4 }}>
                    <SnapshotCardSkeleton />
                  </Grid>
                ))}

              {!loading && !brandsLoading && orderedBrands.length === 0 && (
                <Grid size={12}>
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    No brands are available for this snapshot.
                  </Alert>
                </Grid>
              )}

              {!loading && !brandsLoading && orderedBrands.length > 0 && visibleBrands.length === 0 && (
                <Grid size={12}>
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Select at least one brand to show snapshot cards.
                  </Alert>
                </Grid>
              )}

              {!loading &&
                !brandsLoading &&
                visibleBrands.map((brand) => (
                  <Grid key={brand.brand_key} size={{ xs: 12, md: 6, xl: 4 }}>
                    <Card
                      variant="outlined"
                      onClick={() => onBrandSelect?.(brand.brand_key)}
                      sx={{
                        height: "100%",
                        borderRadius: { xs: "22px", md: "26px" },
                        borderColor:
                          brand.status === "ready"
                            ? "rgba(11,107,203,0.18)"
                            : "rgba(148,163,184,0.28)",
                        bgcolor: "rgba(255,255,255,0.035)",
                        backgroundImage:
                          "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                        cursor: onBrandSelect ? "pointer" : "default",
                        transition:
                          "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
                        "&:hover": onBrandSelect
                          ? {
                              transform: "translateY(-2px)",
                              boxShadow: "0 20px 34px rgba(0,0,0,0.16)",
                              borderColor: "rgba(91,163,224,0.35)",
                            }
                          : undefined,
                      }}
                    >
                      <CardContent sx={{ p: { xs: 1.35, md: 2.5 } }}>
                        <Stack spacing={{ xs: 1.35, md: 2.3 }}>
                          <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                            <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
                              <Box
                                sx={{
                                  width: { xs: 38, md: 44 },
                                  height: { xs: 38, md: 44 },
                                  borderRadius: { xs: "14px", md: "16px" },
                                  display: "grid",
                                  placeItems: "center",
                                  bgcolor:
                                    brand.status === "ready"
                                      ? "rgba(11,107,203,0.12)"
                                      : "rgba(148,163,184,0.12)",
                                  color:
                                    brand.status === "ready"
                                      ? "primary.main"
                                      : "text.secondary",
                                  fontWeight: 900,
                                  fontSize: { xs: "1rem", md: "1.15rem" },
                                }}
                              >
                                {String(brand.brand_name || brand.brand_key || "?")
                                  .charAt(0)
                                  .toUpperCase()}
                              </Box>
                              <Stack minWidth={0} spacing={0.35}>
                                <Typography
                                  variant="h6"
                                  sx={{
                                    fontWeight: 900,
                                    letterSpacing: "-0.02em",
                                    fontSize: { xs: "0.98rem", md: undefined },
                                  }}
                                >
                                  {brand.brand_name || brand.brand_key}
                                </Typography>
                                <Stack direction="row" spacing={0.8} alignItems="center">
                                  <Box
                                    sx={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: "999px",
                                      bgcolor:
                                        brand.status === "ready"
                                          ? "success.main"
                                          : "text.disabled",
                                    }}
                                  />
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ fontWeight: 700 }}
                                  >
                                    {brand.status === "ready"
                                      ? "Snapshot ready"
                                      : "Temporarily unavailable"}
                                  </Typography>
                                </Stack>
                              </Stack>
                            </Stack>

                            {onBrandSelect && (
                              <ChevronRightIcon sx={{ color: "text.secondary", mt: 0.45 }} />
                            )}
                          </Stack>

                          <Box
                            sx={{
                              borderRadius: { xs: "18px", md: "20px" },
                              border: "1px solid rgba(255,255,255,0.06)",
                              bgcolor: "rgba(0,0,0,0.12)",
                              px: { xs: 1.05, md: 1.45 },
                              py: { xs: 1, md: 1.5 },
                            }}
                          >
                            <Grid container spacing={{ xs: 1.1, md: 1.8 }}>
                              {selectedMetrics.map((metricId, index) => {
                                const metricConfig = METRIC_BY_ID[metricId];
                                if (!metricConfig) return null;

                                return (
                                  <Grid key={`${brand.brand_key}-${metricId}`} size={{ xs: 12, sm: 6 }}>
                                    <Box sx={{ height: "100%" }}>
                                      {index > 0 && (
                                        <Box
                                          sx={{
                                            display: { xs: "none", sm: "block" },
                                            position: "absolute",
                                          }}
                                        />
                                      )}
                                      <SnapshotMetricBlock
                                        metricConfig={metricConfig}
                                        rawMetric={brand.metrics?.[metricConfig.summaryKey]}
                                        brandKey={brand.brand_key}
                                      />
                                    </Box>
                                  </Grid>
                                );
                              })}
                            </Grid>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
            </Grid>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
