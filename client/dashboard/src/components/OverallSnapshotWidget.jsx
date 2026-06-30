import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Card,
  CardContent,
  Collapse,
  FormControl,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getOverallSnapshot } from "../lib/api.js";
import { resolveBrandCurrency } from "../lib/currency.js";

const MAX_VISIBLE_METRICS = 2;
const DEFAULT_SELECTED_METRICS = ["cvr", "net_revenue"];
const STORAGE_KEY = "overall_snapshot_ui_state_v1";
const DEFAULT_SORT_MODE = {
  type: "metric",
  metricId: "cvr",
  direction: "asc",
};

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

function areArraysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isMetricSortMode(sortMode) {
  return (
    sortMode?.type === "metric" &&
    !!METRIC_BY_ID[sortMode?.metricId] &&
    (sortMode?.direction === "asc" || sortMode?.direction === "desc")
  );
}

function parseStoredUiState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {
        selectedBrandKeys: [],
        sortMode: DEFAULT_SORT_MODE,
      };
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return {
        selectedBrandKeys: parsed
          .map((value) => value?.toString?.().trim().toUpperCase())
          .filter(Boolean),
        sortMode: DEFAULT_SORT_MODE,
      };
    }

    return {
      selectedBrandKeys: Array.isArray(parsed?.selectedBrandKeys)
        ? parsed.selectedBrandKeys
            .map((value) => value?.toString?.().trim().toUpperCase())
            .filter(Boolean)
        : [],
      sortMode:
        parsed?.sortMode?.type === "custom"
          ? { type: "custom" }
          : isMetricSortMode(parsed?.sortMode)
            ? {
                type: "metric",
                metricId: parsed.sortMode.metricId,
                direction: parsed.sortMode.direction,
              }
            : DEFAULT_SORT_MODE,
    };
  } catch (error) {
    console.error("Failed to load Overall Snapshot UI state", error);
    return {
      selectedBrandKeys: [],
      sortMode: DEFAULT_SORT_MODE,
    };
  }
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
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontWeight: 800,
          color: "text.secondary",
          fontSize: { xs: "0.62rem", md: "0.7rem" },
        }}
      >
        {metricConfig.label}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: "1.15rem", md: "1.3rem" },
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}
      >
        {formatMetricValue(metricConfig, rawMetric, brandKey)}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 800,
          color: tone,
          fontSize: { xs: "0.7rem", md: "0.75rem" },
        }}
      >
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

function SortableBrandTile({ brand, selectedMetrics, onBrandSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: brand.brand_key,
    });

  return (
    <Grid size={{ xs: 12, md: 6, xl: 4 }}>
      <Card
        ref={setNodeRef}
        variant="outlined"
        onClick={() => onBrandSelect?.(brand.brand_key)}
        sx={{
          height: "100%",
          borderRadius: { xs: "10px", md: "16px" },
          boxShadow: "none",
          bgcolor: { xs: "background.paper", md: "rgba(255,255,255,0.035)" },
          backgroundImage: {
            xs: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))",
            md: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
          },
          cursor: onBrandSelect ? "pointer" : "default",
          transition:
            transition ||
            "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
          transform: CSS.Transform.toString(transform),
          opacity: isDragging ? 0.78 : 1,
          zIndex: isDragging ? 2 : "auto",
          "&.MuiPaper-root": {
            border: "1px solid",
            borderColor:
              brand.status === "ready"
                ? "rgba(91,163,224,0.25)"
                : "rgba(148,163,184,0.35)",
          },
          "&:hover": onBrandSelect
            ? {
                transform: {
                  xs: CSS.Transform.toString(transform),
                  md:
                    transform
                      ? CSS.Transform.toString(transform)
                      : "translateY(-2px)",
                },
                boxShadow: { xs: "none", md: "0 20px 34px rgba(0,0,0,0.16)" },
                "&.MuiPaper-root": {
                  borderColor: "rgba(91,163,224,0.35)",
                },
              }
            : undefined,
        }}
      >
        <CardContent
          sx={{
            p: { xs: 1.5, md: 1.75 },
            "&:last-child": { pb: { xs: 1.5, md: 1.75 } },
          }}
        >
          <Stack spacing={{ xs: 1.2, md: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" spacing={1.5}>
              <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
                <Box
                  sx={{
                    width: { xs: 32, md: 36 },
                    height: { xs: 32, md: 36 },
                    borderRadius: { xs: "10px", md: "14px" },
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
                    fontSize: { xs: "0.9rem", md: "1.05rem" },
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
                      fontSize: { xs: "0.95rem", md: "1.05rem" },
                    }}
                  >
                    {brand.brand_name || brand.brand_key}
                  </Typography>
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
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
                      sx={{ fontWeight: 700, fontSize: "0.72rem" }}
                    >
                      {brand.status === "ready"
                        ? "Snapshot ready"
                        : "Temporarily unavailable"}
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>

              <Stack direction="row" spacing={0.5} alignItems="flex-start">
                <Box
                  {...attributes}
                  {...listeners}
                  onClick={(event) => event.stopPropagation()}
                  sx={{
                    display: "grid",
                    placeItems: "center",
                    width: 28,
                    height: 28,
                    borderRadius: "10px",
                    color: "text.secondary",
                    cursor: "grab",
                    touchAction: "none",
                    "&:active": {
                      cursor: "grabbing",
                    },
                  }}
                >
                  <DragIndicatorIcon sx={{ fontSize: 18 }} />
                </Box>
                {onBrandSelect && (
                  <ChevronRightIcon
                    sx={{
                      color: "text.secondary",
                      mt: 0.45,
                      display: { xs: "none", md: "block" },
                    }}
                  />
                )}
              </Stack>
            </Stack>

            <Box
              sx={{
                borderRadius: { xs: "0px", md: "20px" },
                border: { xs: "none", md: "1px solid rgba(255,255,255,0.06)" },
                bgcolor: { xs: "transparent", md: "rgba(0,0,0,0.12)" },
                px: { xs: 0, md: 1.25 },
                py: { xs: 0, md: 1.1 },
              }}
            >
              <Grid container spacing={{ xs: 1.1, md: 1.8 }}>
                {selectedMetrics.map((metricId) => {
                  const metricConfig = METRIC_BY_ID[metricId];
                  if (!metricConfig) return null;

                  return (
                    <Grid key={`${brand.brand_key}-${metricId}`} size={{ xs: 6, sm: 6 }}>
                      <Box
                        sx={{
                          height: "100%",
                          borderRadius: { xs: "14px", md: "0px" },
                          border: { xs: "1px solid rgba(255,255,255,0.05)", md: "none" },
                          bgcolor: { xs: "rgba(0,0,0,0.2)", md: "transparent" },
                          px: { xs: 1.25, md: 0 },
                          py: { xs: 1, md: 0 },
                        }}
                      >
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
  );
}

export default function OverallSnapshotWidget({
  query,
  brands = [],
  brandsLoading = false,
  onBrandSelect,
}) {
  const initialUiState = parseStoredUiState();
  const [selectedMetrics, setSelectedMetrics] = useState(DEFAULT_SELECTED_METRICS);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedBrandKeys, setSelectedBrandKeys] = useState(
    initialUiState.selectedBrandKeys,
  );
  const [sortMode, setSortMode] = useState(initialUiState.sortMode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshot, setSnapshot] = useState({ brands: [], metric_keys: [] });

  const brandKeysDependency = useMemo(
    () =>
      (Array.isArray(brands) ? brands : [])
        .map((brand) => (typeof brand === "string" ? brand : brand?.key))
        .filter(Boolean)
        .join(","),
    [brands],
  );

  const snapshotRequestBrandKeys = useMemo(
    () =>
      (Array.isArray(brands) ? brands : [])
        .map((brand) => (typeof brand === "string" ? brand : brand?.key))
        .filter(Boolean),
    [brands],
  );

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedBrandKeys,
        sortMode,
      }),
    );
  }, [selectedBrandKeys, sortMode]);

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
      brand_keys: snapshotRequestBrandKeys,
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
    brandKeysDependency,
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
    snapshotRequestBrandKeys,
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

      for (const metric of availableMetrics) {
        if (next.length >= MAX_VISIBLE_METRICS) break;
        if (!next.includes(metric.id)) next.push(metric.id);
      }

      return next.slice(0, MAX_VISIBLE_METRICS);
    });
  }, [availableMetrics, loading, snapshot.metric_keys]);

  useEffect(() => {
    if (!selectedMetrics.length) return;

    setSortMode((prev) => {
      if (prev?.type === "custom") return prev;
      if (
        isMetricSortMode(prev) &&
        selectedMetrics.includes(prev.metricId)
      ) {
        return prev;
      }
      return {
        type: "metric",
        metricId: selectedMetrics[0],
        direction: "asc",
      };
    });
  }, [selectedMetrics]);

  const allBrandOptions = useMemo(() => {
    const seen = new Set();
    const options = [];

    for (const brand of Array.isArray(brands) ? brands : []) {
      const normalized = normalizeBrandOption(brand);
      if (!normalized || seen.has(normalized.brand_key)) continue;
      seen.add(normalized.brand_key);
      options.push(normalized);
    }

    for (const brand of Array.isArray(snapshot.brands) ? snapshot.brands : []) {
      const normalized = normalizeBrandOption(brand);
      if (!normalized || seen.has(normalized.brand_key)) continue;
      seen.add(normalized.brand_key);
      options.push(normalized);
    }

    return options;
  }, [brands, snapshot.brands]);

  const brandDataByKey = useMemo(() => {
    const map = new Map();

    for (const brand of allBrandOptions) {
      map.set(brand.brand_key, {
        brand_key: brand.brand_key,
        brand_name: brand.brand_name,
        status: "unavailable",
        metrics: null,
      });
    }

    for (const brand of Array.isArray(snapshot.brands) ? snapshot.brands : []) {
      const normalized = normalizeBrandOption(brand);
      if (!normalized) continue;
      map.set(normalized.brand_key, {
        ...brand,
        brand_key: normalized.brand_key,
        brand_name: normalized.brand_name,
      });
    }

    return map;
  }, [allBrandOptions, snapshot.brands]);

  const sortBrandKeys = useMemo(
    () => (brandKeys, nextSortMode) => {
      if (!isMetricSortMode(nextSortMode)) return brandKeys;

      const metricConfig = METRIC_BY_ID[nextSortMode.metricId];
      return [...brandKeys].sort((leftKey, rightKey) => {
        const leftBrand = brandDataByKey.get(leftKey);
        const rightBrand = brandDataByKey.get(rightKey);
        const leftValue = getMetricSortValue(metricConfig, leftBrand?.metrics);
        const rightValue = getMetricSortValue(metricConfig, rightBrand?.metrics);

        if (leftValue !== rightValue) {
          return nextSortMode.direction === "asc"
            ? leftValue - rightValue
            : rightValue - leftValue;
        }

        return String(leftBrand?.brand_name || leftKey).localeCompare(
          String(rightBrand?.brand_name || rightKey),
        );
      });
    },
    [brandDataByKey],
  );

  useEffect(() => {
    if (!allBrandOptions.length) return;

    setSelectedBrandKeys((prev) => {
      const availableKeys = allBrandOptions.map((brand) => brand.brand_key);
      const availableSet = new Set(availableKeys);
      const kept = prev.filter((brandKey) => availableSet.has(brandKey));
      const baseKeys = kept.length > 0 ? kept : availableKeys;
      const nextKeys =
        sortMode?.type === "metric" ? sortBrandKeys(baseKeys, sortMode) : baseKeys;

      return areArraysEqual(prev, nextKeys) ? prev : nextKeys;
    });
  }, [allBrandOptions, sortBrandKeys, sortMode]);

  const visibleBrands = useMemo(
    () =>
      selectedBrandKeys
        .map((brandKey) => brandDataByKey.get(brandKey))
        .filter(Boolean),
    [brandDataByKey, selectedBrandKeys],
  );

  const sortingOptions = useMemo(() => {
    const options = [];

    if (sortMode?.type === "custom") {
      options.push({
        value: "custom",
        label: "Custom",
      });
    }

    for (const metricId of selectedMetrics) {
      const metric = METRIC_BY_ID[metricId];
      if (!metric) continue;

      options.push(
        {
          value: `metric:${metricId}:asc`,
          label: `${metric.label} (Low to High)`,
        },
        {
          value: `metric:${metricId}:desc`,
          label: `${metric.label} (High to Low)`,
        },
      );
    }

    return options;
  }, [selectedMetrics, sortMode]);

  const sortSelectValue =
    sortMode?.type === "custom"
      ? "custom"
      : `metric:${sortMode?.metricId || selectedMetrics[0]}:${sortMode?.direction || "asc"}`;

  const handleSortChange = (value) => {
    if (value === "custom") return;

    const [type, metricId, direction] = value.split(":");
    if (
      type !== "metric" ||
      !selectedMetrics.includes(metricId) ||
      !["asc", "desc"].includes(direction)
    ) {
      return;
    }

    setSortMode({
      type: "metric",
      metricId,
      direction,
    });
  };

  const handleMetricClick = (metricId) => {
    setSelectedMetrics((prev) => {
      const current = prev.filter((id) => id !== metricId);
      if (prev.includes(metricId)) {
        return [metricId, ...current].slice(0, MAX_VISIBLE_METRICS);
      }
      return [metricId, ...prev].slice(0, MAX_VISIBLE_METRICS);
    });
  };

  const handleBrandChipClick = (brandKey) => {
    setSelectedBrandKeys((prev) => {
      if (prev.includes(brandKey)) {
        if (prev.length === 1) return prev;
        return prev.filter((key) => key !== brandKey);
      }
      return [...prev, brandKey];
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

  const brandTileIds = useMemo(
    () => visibleBrands.map((brand) => brand.brand_key),
    [visibleBrands],
  );

  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 140,
        tolerance: 8,
      },
    }),
  );

  const handleBrandTileDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;

    setSelectedBrandKeys((prev) => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setSortMode({ type: "custom" });
  };

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: "20px",
        bgcolor: { xs: "transparent", md: "background.paper" },
        backgroundImage: {
          xs: "none",
          md: "radial-gradient(circle at top left, rgba(11,107,203,0.12), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))",
        },
        overflow: "hidden",
        "&.MuiPaper-root": {
          border: { xs: "none !important", md: "1px solid" },
          borderColor: {
            xs: "transparent !important",
            md: "rgba(255,255,255,0.12)",
          },
        },
      }}
    >
      <CardContent sx={{ p: { xs: 0, md: 2.2 } }}>
        <Stack spacing={{ xs: 2.5, md: 2.2 }}>
          <Box
            sx={{
              borderRadius: "20px",
              p: { xs: 1.25, md: 1.75 },
              border: "1px solid",
              borderColor: "rgba(255,255,255,0.12)",
              bgcolor: { xs: "background.paper", md: "rgba(255,255,255,0.02)" },
            }}
          >
            <Stack spacing={{ xs: 1.15, md: 2 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={2}
              >
                <Stack spacing={0.2} minWidth={0}>
                  <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
                    Overall Snapshot
                  </Typography>
                  {!showMobileFilters && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", fontSize: "0.68rem" }}
                    >
                      {selectedMetricLabels} • {selectedBrandKeys.length} selected
                    </Typography>
                  )}
                </Stack>

                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ display: { xs: "none", md: "flex" } }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 900,
                        color: "text.secondary",
                        letterSpacing: "0.1em",
                        flexShrink: 0,
                      }}
                    >
                      SORTING
                    </Typography>
                    <FormControl size="small" sx={{ width: 220 }}>
                      <Select
                        value={sortSelectValue}
                        onChange={(event) => handleSortChange(event.target.value)}
                        sx={{
                          borderRadius: "12px",
                          minHeight: 32,
                          bgcolor: "rgba(0,0,0,0.12)",
                          "& .MuiOutlinedInput-notchedOutline": {
                            borderColor: "rgba(255,255,255,0.12)",
                          },
                        }}
                      >
                        {sortingOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>

                  <ButtonBase
                    onClick={() => setShowMobileFilters((prev) => !prev)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      px: 1.2,
                      py: 0.5,
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      bgcolor: showMobileFilters
                        ? "rgba(91,163,224,0.14)"
                        : "rgba(255,255,255,0.03)",
                      color: "text.primary",
                      fontSize: "0.74rem",
                      fontWeight: 800,
                    }}
                  >
                    {showMobileFilters ? "Done" : "Configure"}
                  </ButtonBase>
                </Stack>
              </Stack>

              <Collapse in={showMobileFilters}>
                <Box sx={{ display: { xs: "none", md: "block" }, pt: 1.5 }}>
                  <Stack spacing={2}>
                    <Stack spacing={0.8}>
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
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                        {availableMetrics.map((metric) => {
                          const selected = selectedMetrics.includes(metric.id);
                          return (
                            <ButtonBase
                              key={metric.id}
                              onClick={() => handleMetricClick(metric.id)}
                              sx={{
                                px: 1.2,
                                py: 0.6,
                                borderRadius: "999px",
                                border: "1px solid",
                                borderColor: selected
                                  ? "rgba(91,163,224,0.48)"
                                  : "rgba(255,255,255,0.08)",
                                bgcolor: selected
                                  ? "rgba(91,163,224,0.18)"
                                  : "rgba(255,255,255,0.04)",
                                color: selected ? "primary.light" : "text.primary",
                                fontSize: "0.74rem",
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

                    <Stack spacing={0.8}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
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
                          {selectedBrandKeys.length} selected
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Drag the tile handle to reorder brands. Manual reordering switches sorting to Custom.
                      </Typography>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                        {allBrandOptions.map((brand) => {
                          const brandKey = brand.brand_key;
                          const selected = selectedBrandKeys.includes(brandKey);
                          return (
                            <ButtonBase
                              key={brandKey}
                              onClick={() => handleBrandChipClick(brandKey)}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.8,
                                px: 1.2,
                                py: 0.6,
                                borderRadius: "12px",
                                border: "1px solid",
                                borderColor: selected
                                  ? "rgba(91,163,224,0.48)"
                                  : "rgba(255,255,255,0.08)",
                                bgcolor: selected
                                  ? "rgba(91,163,224,0.18)"
                                  : "rgba(255,255,255,0.04)",
                                color: selected ? "primary.light" : "text.primary",
                                fontSize: "0.74rem",
                                fontWeight: 800,
                                cursor: "pointer",
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
                              <Box
                                sx={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  border: "2px solid",
                                  borderColor: selected ? "primary.light" : "rgba(255,255,255,0.3)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  transition: "all 160ms ease",
                                }}
                              >
                                {selected && (
                                  <Box
                                    sx={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: "50%",
                                      bgcolor: "primary.light",
                                    }}
                                  />
                                )}
                              </Box>
                              <span>{brand.brand_name || brandKey}</span>
                            </ButtonBase>
                          );
                        })}
                      </Box>
                    </Stack>
                  </Stack>
                </Box>

                <Box sx={{ display: { xs: "block", md: "none" }, pt: 1 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 900,
                          color: "text.secondary",
                          letterSpacing: "0.1em",
                          flexShrink: 0,
                        }}
                      >
                        SORTING
                      </Typography>
                      <FormControl size="small" fullWidth>
                        <Select
                          value={sortSelectValue}
                          onChange={(event) => handleSortChange(event.target.value)}
                          sx={{
                            borderRadius: "12px",
                            minHeight: 32,
                            bgcolor: "rgba(0,0,0,0.12)",
                            "& .MuiOutlinedInput-notchedOutline": {
                              borderColor: "rgba(255,255,255,0.12)",
                            },
                          }}
                        >
                          {sortingOptions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>

                    <Stack spacing={0.8}>
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
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "nowrap",
                          overflowX: "auto",
                          gap: 0.8,
                          pb: 0.5,
                          "&::-webkit-scrollbar": { display: "none" },
                          msOverflowStyle: "none",
                          scrollbarWidth: "none",
                        }}
                      >
                        {availableMetrics.map((metric) => {
                          const selected = selectedMetrics.includes(metric.id);
                          return (
                            <ButtonBase
                              key={metric.id}
                              onClick={() => handleMetricClick(metric.id)}
                              sx={{
                                px: 1.2,
                                py: 0.6,
                                borderRadius: "999px",
                                border: "1px solid",
                                borderColor: selected
                                  ? "rgba(91,163,224,0.48)"
                                  : "rgba(255,255,255,0.08)",
                                bgcolor: selected
                                  ? "rgba(91,163,224,0.18)"
                                  : "rgba(255,255,255,0.04)",
                                color: selected ? "primary.light" : "text.primary",
                                fontSize: "0.74rem",
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

                    <Stack spacing={0.8}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
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
                          {selectedBrandKeys.length} selected
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Drag the tile handle to reorder brands. Manual reordering switches sorting to Custom.
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "nowrap",
                          overflowX: "auto",
                          gap: 0.8,
                          pb: 0.5,
                          "&::-webkit-scrollbar": { display: "none" },
                          msOverflowStyle: "none",
                          scrollbarWidth: "none",
                        }}
                      >
                        {allBrandOptions.map((brand) => {
                          const brandKey = brand.brand_key;
                          const selected = selectedBrandKeys.includes(brandKey);
                          return (
                            <ButtonBase
                              key={brandKey}
                              onClick={() => handleBrandChipClick(brandKey)}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.8,
                                px: 1.2,
                                py: 0.6,
                                borderRadius: "12px",
                                border: "1px solid",
                                borderColor: selected
                                  ? "rgba(91,163,224,0.48)"
                                  : "rgba(255,255,255,0.08)",
                                bgcolor: selected
                                  ? "rgba(91,163,224,0.18)"
                                  : "rgba(255,255,255,0.04)",
                                color: selected ? "primary.light" : "text.primary",
                                fontSize: "0.74rem",
                                fontWeight: 800,
                                cursor: "pointer",
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
                              <Box
                                sx={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  border: "2px solid",
                                  borderColor: selected ? "primary.light" : "rgba(255,255,255,0.3)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  transition: "all 160ms ease",
                                }}
                              >
                                {selected && (
                                  <Box
                                    sx={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: "50%",
                                      bgcolor: "primary.light",
                                    }}
                                  />
                                )}
                              </Box>
                              <span>{brand.brand_name || brandKey}</span>
                            </ButtonBase>
                          );
                        })}
                      </Box>
                    </Stack>
                  </Stack>
                </Box>
              </Collapse>
            </Stack>
          </Box>

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
            <Grid container spacing={{ xs: 3.5, md: 2.2 }}>
              {(loading || brandsLoading) &&
                Array.from({ length: 6 }).map((_, index) => (
                  <Grid key={`snapshot-skeleton-${index}`} size={{ xs: 12, md: 6, xl: 4 }}>
                    <SnapshotCardSkeleton />
                  </Grid>
                ))}

              {!loading && !brandsLoading && snapshot.brands.length === 0 && (
                <Grid size={12}>
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    No brands are available for this snapshot.
                  </Alert>
                </Grid>
              )}

              {!loading && !brandsLoading && snapshot.brands.length > 0 && visibleBrands.length === 0 && (
                <Grid size={12}>
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Select at least one brand to show snapshot cards.
                  </Alert>
                </Grid>
              )}

              {!loading && !brandsLoading && visibleBrands.length > 0 && (
                <DndContext
                  sensors={dragSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleBrandTileDragEnd}
                >
                  <SortableContext items={brandTileIds} strategy={rectSortingStrategy}>
                    {visibleBrands.map((brand) => (
                      <SortableBrandTile
                        key={brand.brand_key}
                        brand={brand}
                        selectedMetrics={selectedMetrics}
                        onBrandSelect={onBrandSelect}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </Grid>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
