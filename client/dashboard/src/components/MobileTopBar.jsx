import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box,
  Card,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  useTheme,
  Collapse,
  IconButton,
  Drawer,
  Typography,
  Stack,
  Button,
  Badge,
  Chip,
  Checkbox, // New Import
  Popover as MuiPopover,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckIcon from "@mui/icons-material/Check";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FilterListIcon from "@mui/icons-material/FilterList";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import { DatePicker } from "@shopify/polaris";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { getLastUpdatedPTS, getDashboardSummary } from "../lib/api.js";
import { isRangeOver30DaysInclusive } from "../lib/dateRange.js";
import SearchableSelect from "./ui/SearchableSelect.jsx";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(customParseFormat);

const DATE_PRESETS = [
  // Recent
  {
    label: "Today",
    getValue: () => [dayjs().startOf("day"), dayjs().startOf("day")],
    group: 1,
  },
  {
    label: "Yesterday",
    getValue: () => [
      dayjs().subtract(1, "day").startOf("day"),
      dayjs().subtract(1, "day").startOf("day"),
    ],
    group: 1,
  },

  // Days
  {
    label: "Last 7 days",
    getValue: () => [
      dayjs().subtract(7, "day").startOf("day"),
      dayjs().subtract(1, "day").startOf("day"),
    ],
    group: 2,
  },
  {
    label: "Last 30 days",
    getValue: () => [
      dayjs().subtract(30, "day").startOf("day"),
      dayjs().subtract(1, "day").startOf("day"),
    ],
    group: 2,
  },
  // Month ranges
  {
    label: "Last month",
    getValue: () => {
      const start = dayjs()
        .subtract(1, "month")
        .startOf("month")
        .startOf("day");
      const end = dayjs().subtract(1, "month").endOf("month").startOf("day");
      return [start, end];
    },
    group: 2,
  },
  {
    label: "Month-to-date",
    getValue: () => {
      const start = dayjs().startOf("month").startOf("day");
      const end = dayjs().startOf("day");
      return [start, end];
    },
    group: 2,
  },
  {
    label: "Last 90 days",
    getValue: () => [
      dayjs().subtract(90, "day").startOf("day"),
      dayjs().subtract(1, "day").startOf("day"),
    ],
    group: 2,
  },
];

export default function MobileTopBar({
  value,
  compareMode,
  onChange,
  onCompareModeChange,
  compareDateRange,
  onCompareDateRangeChange,
  brandKey,
  showProductFilter = true,
  productOptions = [],
  productValue = null,
  onProductChange,
  productLoading = false,
  utm = {},
  onUtmChange,
  showUtmFilter = true,
  utmOptions = null, // Prop
  salesChannel = "",
  showSalesChannel = true,
  onSalesChannelChange,
  isAuthor,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [start, end] = value || [];
  const [dateAnchorEl, setDateAnchorEl] = useState(null);
  const [compDateAnchorEl, setCompDateAnchorEl] = useState(null);
  const popoverActive = Boolean(dateAnchorEl);
  const [month, setMonth] = useState((end || start || dayjs()).month());
  const [year, setYear] = useState((end || start || dayjs()).year());
  const [compMonth, setCompMonth] = useState(dayjs().month());
  const [compYear, setCompYear] = useState(dayjs().year());
  const [last, setLast] = useState({ loading: true, ts: null, tz: null });
  const [showUtmFilters, setShowUtmFilters] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const normalizedKey = (brandKey || "").toString().trim().toUpperCase();
    setLast({ loading: true, ts: null, tz: null });
    getLastUpdatedPTS(normalizedKey ? { brandKey: normalizedKey } : undefined)
      .then((r) => {
        if (cancelled) return;
        let parsed = null;
        const sources = [];
        if (r.iso) sources.push(r.iso);
        if (r.raw) sources.push(r.raw);
        for (const src of sources) {
          if (parsed) break;
          const cleaned =
            typeof src === "string" ? src.replace(/ IST$/, "").trim() : src;
          if (!cleaned) continue;
          if (typeof cleaned === "string") {
            const formats = [
              "YYYY-MM-DDTHH:mm:ss.SSSZ",
              "YYYY-MM-DDTHH:mm:ssZ",
              "YYYY-MM-DD hh:mm:ss A",
              "YYYY-MM-DD HH:mm:ss",
              "YYYY-MM-DD hh:mm A",
            ];
            for (const f of formats) {
              const d = dayjs(cleaned, f, true);
              if (d.isValid()) {
                parsed = d;
                break;
              }
            }
            if (!parsed) {
              const auto = dayjs(cleaned);
              if (auto.isValid()) parsed = auto;
            }
          } else if (cleaned instanceof Date) {
            const auto = dayjs(cleaned);
            if (auto.isValid()) parsed = auto;
          }
        }
        setLast((prev) => ({
          loading: false,
          ts: parsed || prev.ts,
          tz: r.timezone || prev.tz || null,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setLast((prev) => ({ loading: false, ts: prev.ts, tz: prev.tz }));
      });
    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  useEffect(() => {
    const focus = end || start;
    if (focus) {
      setMonth(focus.month());
      setYear(focus.year());
    }
  }, [start, end]);

  const selectedRange = useMemo(() => {
    if (!start && !end) return undefined;
    const s = start ? start.startOf("day").toDate() : undefined;
    const effectiveEnd = end || start;
    const e = effectiveEnd ? effectiveEnd.startOf("day").toDate() : undefined;
    if (!s || !e) return undefined;
    return { start: s, end: e };
  }, [start, end]);

  const dateLabel = useMemo(() => {
    if (start && end) {
      const same = start.isSame(end, "day");
      if (same) return start.format("DD MMM YYYY");
      return `${start.format("DD MMM YYYY")} – ${end.format("DD MMM YYYY")}`;
    }
    if (start) return start.format("DD MMM YYYY");
    return "Select dates";
  }, [start, end]);

  const togglePopover = useCallback((e) => {
    const target = e.currentTarget;
    setDateAnchorEl((prev) => (prev ? null : target));
  }, []);
  const handleClose = useCallback(() => setDateAnchorEl(null), []);
  const handleMonthChange = useCallback((m, y) => {
    setMonth(m);
    setYear(y);
  }, []);

  // Remove explicit body scroll locking as MUI Popover handles scroll locking natively
  // without getting stuck (MUI utilizes Dialog root which handles this gracefully).
  useEffect(() => {
    // Left intentionally blank to replace old broken overflow hiding logic.
  }, []);

  const handlePresetSelect = useCallback(
    (preset) => {
      const [presetStart, presetEnd] = preset.getValue();
      setMonth(presetEnd.month());
      setYear(presetEnd.year());
      onChange([presetStart, presetEnd], preset.compareMode || null);
    },
    [onChange, start, end],
  );

  const activePreset = useMemo(() => {
    // If a specific comparison mode is active, prioritize showing that preset as active
    if (!start || !end) return null;
    return (
      DATE_PRESETS.find((preset) => {
        const [presetStart, presetEnd] = preset.getValue();
        return start.isSame(presetStart, "day") && end.isSame(presetEnd, "day");
      })?.label || null
    );
  }, [start, end, compareMode]);

  const handleRangeChange = useCallback(
    ({ start: ns, end: ne }) => {
      const s = ns ? dayjs(ns).startOf("day") : null;
      const e = ne ? dayjs(ne).startOf("day") : null;
      const focus = e || s;
      if (focus) {
        setMonth(focus.month());
        setYear(focus.year());
      }
      if (s && e && s.isAfter(e)) {
        onChange([e, s], compareMode);
        return;
      }
      if (s && !e) {
        onChange([s, s], compareMode);
        return;
      }
      onChange([s, e ?? s ?? null], compareMode);
    },
    [onChange, compareMode],
  );

  const isDateRangeOver30Days = useMemo(() => {
    return isRangeOver30DaysInclusive(start, end);
  }, [start, end]);

  const activeUtmCount = [utm?.source, utm?.medium, utm?.campaign].filter(
    Boolean,
  ).length;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        gap: 0.75,
        pt: 1,
      }}
    >
      {/* Mobile: Product filter on its own row (authors only) */}
      {/* Mobile: Product filter removed (moved to global drawer) */}

      {/* Main row: Brand + Compare | Date pickers */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          gap: 1,
        }}
      >
        {/* Left: Brand label + Compare toggle */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: { xs: "block", md: "none" } }}
          >
            Brand: <b>{brandKey}</b>
          </Typography>
          {isAuthor && (
            <IconButton
              onClick={() => {
                if (onCompareModeChange) {
                  const next = !compareMode;
                  onCompareModeChange(next);
                  if (next && start && onCompareDateRangeChange) {
                    const compEnd = start.subtract(1, "day");
                    const diff = end ? end.diff(start, "day") : 0;
                    const compStart = compEnd.subtract(diff, "day");
                    onCompareDateRangeChange([
                      compStart.toISOString(),
                      compEnd.toISOString(),
                    ]);
                  }
                }
              }}
              size="small"
              sx={{
                width: 26,
                height: 26,
                border: "1px solid",
                borderColor: compareMode ? "primary.main" : "divider",
                borderRadius: "50%",
                color: compareMode ? "primary.main" : "text.secondary",
                bgcolor: compareMode
                  ? isDark
                    ? "rgba(91, 163, 224, 0.15)"
                    : "rgba(11, 107, 203, 0.08)"
                  : "transparent",
              }}
            >
              <CompareArrowsIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>

        {/* Right: Product filter (desktop only) + Date picker */}
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {/* Desktop UTM Filters (Collapsible) */}
            {showUtmFilter && (
              <>
                <Collapse
                  in={showUtmFilters}
                  orientation="horizontal"
                  unmountOnExit
                >
                  <Box
                    sx={{
                      display: { xs: "none", sm: "flex" },
                      gap: 1,
                      alignItems: "center",
                    }}
                  >
                    {isDateRangeOver30Days ? (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          bgcolor: isDark
                            ? "rgba(255, 152, 0, 0.1)"
                            : "rgba(255, 152, 0, 0.05)",
                          border: "1px solid",
                          borderColor: isDark
                            ? "rgba(255, 152, 0, 0.2)"
                            : "rgba(255, 152, 0, 0.1)",
                        }}
                      >
                        <WarningAmberIcon
                          sx={{ color: "#ed6c02", fontSize: 18 }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            color: "#ed6c02",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          UTM filters unavailable for &gt; 30 days
                        </Typography>
                      </Box>
                    ) : (
                      <>
                        {activeUtmCount > 0 && (
                          <Button
                            size="small"
                            onClick={() =>
                              onUtmChange &&
                              onUtmChange({
                                source: "",
                                medium: "",
                                campaign: "",
                              })
                            }
                            sx={{
                              fontSize: 12,
                              textTransform: "none",
                              minWidth: "auto",
                              whiteSpace: "nowrap",
                              color: "text.secondary",
                              "&:hover": {
                                color: "error.main",
                                bgcolor: "transparent",
                              },
                            }}
                          >
                            Clear all
                          </Button>
                        )}
                        {showSalesChannel && (
                          <SearchableSelect
                            label="Sales Channel"
                            options={utmOptions?.sales_channel || []}
                            value={salesChannel}
                            onChange={onSalesChannelChange}
                            sx={{ width: 140 }}
                            labelSx={{
                              fontSize: 12,
                              transform: "translate(14px, 8px) scale(1)",
                              "&.MuiInputLabel-shrink": {
                                transform: "translate(14px, -9px) scale(0.75)",
                              },
                            }}
                            selectSx={{
                              fontSize: 12,
                              height: 32,
                              "& .MuiSelect-select": {
                                py: 0.5,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              },
                            }}
                          />
                        )}
                        {["source", "medium", "campaign"].map((field) => (
                          <SearchableSelect
                            key={field}
                            label={
                              field.charAt(0).toUpperCase() + field.slice(1)
                            }
                            multiple
                            options={utmOptions?.[`utm_${field}`] || []}
                            value={utm?.[field] || []}
                            onChange={(newVal) => {
                              onUtmChange && onUtmChange({ [field]: newVal });
                            }}
                            sx={{ width: 140 }}
                            labelSx={{
                              fontSize: 12,
                              textTransform: "capitalize",
                              transform: "translate(14px, 8px) scale(1)",
                              "&.MuiInputLabel-shrink": {
                                transform: "translate(14px, -9px) scale(0.75)",
                              },
                            }}
                            selectSx={{
                              fontSize: 12,
                              height: 32,
                              "& .MuiSelect-select": {
                                py: 0.5,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              },
                            }}
                          />
                        ))}
                      </>
                    )}
                  </Box>
                </Collapse>

                {/* Filter Toggle Icon */}
                <IconButton
                  onClick={() => setShowUtmFilters(!showUtmFilters)}
                  sx={{
                    width: 32,
                    height: 32,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "50%", // Circular
                    display: { xs: "none", sm: "flex" },
                    color: showUtmFilters ? "primary.main" : "text.secondary",
                    bgcolor: showUtmFilters
                      ? isDark
                        ? "rgba(91, 163, 224, 0.1)"
                        : "rgba(11, 107, 203, 0.05)"
                      : "transparent",
                  }}
                >
                  <FilterListIcon fontSize="small" />
                </IconButton>
              </>
            )}

            {/* Desktop-only compact product filter */}
            {showProductFilter && (
              <Box
                sx={{
                  position: "relative",
                  width: { xs: "100%", sm: 200 },
                  display: { xs: "none", sm: "flex" },
                }}
              >
                <SearchableSelect
                  label="Product"
                  options={productOptions}
                  value={
                    Array.isArray(productValue)
                      ? productValue[0]?.id || ""
                      : productValue?.id || ""
                  }
                  onChange={(newId) => {
                    const selected = productOptions.find(
                      (p) => p.id === newId,
                    ) || { id: newId, label: newId, detail: "" };
                    if (onProductChange) onProductChange(selected);
                  }}
                  valueKey="id"
                  labelKey="label"
                  multiple={false}
                  sx={{ width: "100%" }}
                  labelSx={{
                    fontSize: 12,
                    transform: "translate(14px, 8px) scale(1)",
                    "&.MuiInputLabel-shrink": {
                      transform: "translate(14px, -9px) scale(0.75)",
                    },
                  }}
                  selectSx={{
                    fontSize: 12,
                    height: 32,
                    "& .MuiSelect-select": {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxHeight: 32,
                      display: "flex",
                      alignItems: "center",
                    },
                  }}
                />
                {productLoading && (
                  <CircularProgress
                    size={14}
                    sx={{
                      position: "absolute",
                      top: 9,
                      right: 28,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </Box>
            )}

            {/* Mobile Filter Toggle Icon */}
            {/* Mobile Filter Toggle Icon REMOVED */}

            {/* Compare Mode: Two date segments (TO + CURR) */}
            {compareMode ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0 }}>
                {/* TO date segment */}
                <Box
                  onClick={(e) => setCompDateAnchorEl(e.currentTarget)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    px: 1,
                    py: 0.5,
                    borderRadius: "6px 0 0 6px",
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.02)",
                    "&:hover": {
                      bgcolor: isDark
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(0,0,0,0.05)",
                    },
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      color: "text.secondary",
                      mr: 0.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    To:
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {compareDateRange?.[0]
                      ? compareDateRange[1] &&
                        !dayjs(compareDateRange[0]).isSame(
                          dayjs(compareDateRange[1]),
                          "day",
                        )
                        ? `${dayjs(compareDateRange[0]).format("DD MMM")} - ${dayjs(compareDateRange[1]).format("DD MMM")}`
                        : dayjs(compareDateRange[0]).format("DD MMM")
                      : "–"}
                  </Typography>
                </Box>
                <MuiPopover
                  open={Boolean(compDateAnchorEl)}
                  anchorEl={compDateAnchorEl}
                  onClose={() => setCompDateAnchorEl(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                  transformOrigin={{ vertical: "top", horizontal: "left" }}
                  PaperProps={{
                    sx: {
                      mt: 1,
                      borderRadius: 2,
                      overflow: "hidden",
                      backdropFilter: "blur(12px)",
                      backgroundColor: isDark
                        ? "rgba(30, 30, 30, 0.6)"
                        : "rgba(255, 255, 255, 0.8)",
                      border: "1px solid",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(0, 0, 0, 0.05)",
                      boxShadow: isDark
                        ? "0 8px 32px rgba(0, 0, 0, 0.5)"
                        : "0 8px 32px rgba(0, 0, 0, 0.1)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      "& .Polaris-DatePicker": {
                        background: "transparent !important",
                      },
                      "& .Polaris-DatePicker__Month": {
                        background: "transparent !important",
                      },
                      "& .Polaris-DatePicker__Title": {
                        color: isDark ? "#fff" : "inherit",
                      },
                      "& .Polaris-DatePicker__Day": {
                        color: isDark ? "#ddd" : "inherit",
                        "&:hover": {
                          bgcolor: isDark ? "rgba(255,255,255,0.1)" : "",
                        },
                      },
                      "& .Polaris-DatePicker__Day--today": {
                        color: isDark ? "#fff" : "inherit",
                        fontWeight: "bold",
                      },
                      "& .Polaris-DatePicker__Day--selected": {
                        bgcolor: "primary.main",
                        color: "#fff",
                      },
                      "& .Polaris-DatePicker__Day--inRange": {
                        bgcolor: isDark
                          ? "rgba(91, 163, 224, 0.3)"
                          : "rgba(11, 107, 203, 0.1)",
                      },
                    }}
                  >
                    <DatePicker
                      month={compMonth}
                      year={compYear}
                      onChange={({ start: ns, end: ne }) => {
                        const s = ns ? dayjs(ns).startOf("day") : null;
                        const e = ne ? dayjs(ne).startOf("day") : s;
                        if (s && e && onCompareDateRangeChange) {
                          onCompareDateRangeChange([
                            s.toISOString(),
                            e.toISOString(),
                          ]);
                        }
                      }}
                      onMonthChange={(m, y) => {
                        setCompMonth(m);
                        setCompYear(y);
                      }}
                      selected={
                        compareDateRange?.[0]
                          ? {
                              start: dayjs(compareDateRange[0]).toDate(),
                              end: dayjs(
                                compareDateRange[1] || compareDateRange[0],
                              ).toDate(),
                            }
                          : undefined
                      }
                      allowRange
                    />
                  </Box>
                </MuiPopover>

                {/* CURR date segment */}
                <Box
                  onClick={togglePopover}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    px: 1,
                    py: 0.5,
                    borderRadius: "0 6px 6px 0",
                    border: "1px solid",
                    borderLeft: "none",
                    borderColor: "divider",
                    bgcolor: isDark
                      ? "rgba(91, 163, 224, 0.08)"
                      : "rgba(11, 107, 203, 0.04)",
                    "&:hover": {
                      bgcolor: isDark
                        ? "rgba(91, 163, 224, 0.15)"
                        : "rgba(11, 107, 203, 0.08)",
                    },
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      color: "#5ba3e0",
                      mr: 0.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Curr:
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#5ba3e0",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dateLabel}
                  </Typography>
                </Box>
                <MuiPopover
                  open={Boolean(dateAnchorEl)}
                  anchorEl={dateAnchorEl}
                  onClose={handleClose}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                  PaperProps={{
                    sx: {
                      mt: 1,
                      borderRadius: 2,
                      overflow: "hidden",
                      backdropFilter: "blur(12px)",
                      backgroundColor: isDark
                        ? "rgba(30, 30, 30, 0.6)"
                        : "rgba(255, 255, 255, 0.8)",
                      border: "1px solid",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(0, 0, 0, 0.05)",
                      boxShadow: isDark
                        ? "0 8px 32px rgba(0, 0, 0, 0.5)"
                        : "0 8px 32px rgba(0, 0, 0, 0.1)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      "& .Polaris-DatePicker": {
                        background: "transparent !important",
                      },
                      "& .Polaris-DatePicker__Month": {
                        background: "transparent !important",
                      },
                      "& .Polaris-DatePicker__Title": {
                        color: isDark ? "#fff" : "inherit",
                      },
                      "& .Polaris-DatePicker__Day": {
                        color: isDark ? "#ddd" : "inherit",
                        "&:hover": {
                          bgcolor: isDark ? "rgba(255,255,255,0.1)" : "",
                        },
                      },
                      "& .Polaris-DatePicker__Day--today": {
                        color: isDark ? "#fff" : "inherit",
                        fontWeight: "bold",
                      },
                      "& .Polaris-DatePicker__Day--selected": {
                        bgcolor: "primary.main",
                        color: "#fff",
                      },
                      "& .Polaris-DatePicker__Day--inRange": {
                        bgcolor: isDark
                          ? "rgba(91, 163, 224, 0.3)"
                          : "rgba(11, 107, 203, 0.1)",
                      },
                    }}
                  >
                    <DatePicker
                      month={month}
                      year={year}
                      onChange={handleRangeChange}
                      onMonthChange={handleMonthChange}
                      selected={selectedRange}
                      allowRange
                    />
                  </Box>
                </MuiPopover>
              </Box>
            ) : (
              <>
                {/* Normal mode: single date label + calendar icon */}
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    mr: 1,
                    display: "block",
                    color: "text.secondary",
                  }}
                >
                  {dateLabel}
                </Typography>

                <IconButton
                  onClick={togglePopover}
                  sx={{
                    width: 32,
                    height: 32,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "50%",
                    color: popoverActive ? "primary.main" : "text.secondary",
                    bgcolor: popoverActive
                      ? isDark
                        ? "rgba(91, 163, 224, 0.1)"
                        : "rgba(11, 107, 203, 0.05)"
                      : "transparent",
                  }}
                >
                  <CalendarMonthIcon fontSize="small" />
                </IconButton>

                <MuiPopover
                  open={Boolean(dateAnchorEl)}
                  anchorEl={dateAnchorEl}
                  onClose={handleClose}
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                  PaperProps={{
                    sx: {
                      mt: 1,
                      borderRadius: 2,
                      overflow: "hidden",
                      backdropFilter: "blur(12px)",
                      backgroundColor: isDark
                        ? "rgba(30, 30, 30, 0.6)"
                        : "rgba(255, 255, 255, 0.8)",
                      border: "1px solid",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.1)"
                        : "rgba(0, 0, 0, 0.05)",
                      boxShadow: isDark
                        ? "0 8px 32px rgba(0, 0, 0, 0.5)"
                        : "0 8px 32px rgba(0, 0, 0, 0.1)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "row",
                      maxHeight: "80vh",
                      overflowX: "hidden",
                      overflowY: "auto",
                      borderRadius: 1,
                      bgcolor: "transparent",
                    }}
                  >
                    {/* Presets Panel - Mobile */}
                    <Box
                      sx={{
                        display: { xs: "block", md: "none" },
                        minWidth: 120,
                        maxHeight: 320,
                        overflowY: "auto",
                        borderRight: "1px solid",
                        borderColor: isDark
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(0,0,0,0.05)",
                        bgcolor: "transparent",
                      }}
                    >
                      <List disablePadding>
                        {DATE_PRESETS.map((preset, index) => {
                          const isSelected = activePreset === preset.label;
                          const showDivider =
                            index < DATE_PRESETS.length - 1 &&
                            DATE_PRESETS[index + 1].group !== preset.group;
                          return (
                            <Box key={preset.label}>
                              <ListItemButton
                                selected={isSelected}
                                onClick={() => handlePresetSelect(preset)}
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  bgcolor: isSelected
                                    ? isDark
                                      ? "action.selected"
                                      : "grey.100"
                                    : "transparent",
                                  "&:hover": {
                                    bgcolor: isDark
                                      ? "action.hover"
                                      : "grey.100",
                                  },
                                  "&.Mui-selected": {
                                    bgcolor: isDark
                                      ? "action.selected"
                                      : "grey.200",
                                    "&:hover": {
                                      bgcolor: isDark
                                        ? "action.selected"
                                        : "grey.200",
                                    },
                                  },
                                }}
                              >
                                <ListItemText
                                  primary={preset.label}
                                  primaryTypographyProps={{
                                    variant: "body2",
                                    fontWeight: isSelected ? 600 : 400,
                                    color: "text.primary",
                                    fontSize: 12,
                                  }}
                                />
                                {isSelected && (
                                  <CheckIcon
                                    sx={{
                                      fontSize: 14,
                                      color: "text.primary",
                                      ml: 0.5,
                                    }}
                                  />
                                )}
                              </ListItemButton>
                              {showDivider && <Divider />}
                            </Box>
                          );
                        })}
                      </List>
                    </Box>

                    {/* Presets Panel - Desktop Only (All options) */}
                    <Box
                      sx={{
                        display: { xs: "none", md: "block" },
                        minWidth: 160,
                        maxHeight: 320,
                        overflowY: "auto",
                        borderRight: "1px solid",
                        borderColor: isDark
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(0,0,0,0.05)",
                        bgcolor: "transparent",
                      }}
                    >
                      <List disablePadding>
                        {DATE_PRESETS.map((preset, index) => {
                          const isSelected = activePreset === preset.label;
                          const showDivider =
                            index < DATE_PRESETS.length - 1 &&
                            DATE_PRESETS[index + 1].group !== preset.group;

                          return (
                            <Box key={preset.label}>
                              <ListItemButton
                                selected={isSelected}
                                onClick={() => handlePresetSelect(preset)}
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  bgcolor: isSelected
                                    ? isDark
                                      ? "action.selected"
                                      : "grey.100"
                                    : "transparent",
                                  "&:hover": {
                                    bgcolor: isDark ? "black" : "grey.100",
                                  },
                                  "&.Mui-selected": {
                                    bgcolor: isDark
                                      ? "action.selected"
                                      : "grey.200",
                                    "&:hover": {
                                      bgcolor: isDark
                                        ? "action.selected"
                                        : "grey.200",
                                    },
                                  },
                                }}
                              >
                                <ListItemText
                                  primary={preset.label}
                                  primaryTypographyProps={{
                                    variant: "body2",
                                    fontWeight: isSelected ? 600 : 400,
                                    color: "text.primary",
                                  }}
                                />
                                {isSelected && (
                                  <CheckIcon
                                    sx={{
                                      fontSize: 18,
                                      color: "text.primary",
                                      ml: 1,
                                    }}
                                  />
                                )}
                              </ListItemButton>
                              {showDivider && <Divider />}
                            </Box>
                          );
                        })}
                      </List>
                    </Box>

                    {/* Calendar Panel */}
                    <Box
                      sx={{
                        p: 1,
                        minWidth: 200,
                        bgcolor: "transparent",
                        "& .Polaris-DatePicker": {
                          background: "transparent !important",
                        },
                        "& .Polaris-DatePicker__Month": {
                          background: "transparent !important",
                        },
                        "& .Polaris-DatePicker__Title": {
                          color: isDark ? "#fff" : "inherit",
                        },
                        "& .Polaris-DatePicker__Day": {
                          color: isDark ? "#ddd" : "inherit",
                          "&:hover": {
                            bgcolor: isDark ? "rgba(255,255,255,0.1)" : "",
                          },
                        },
                        "& .Polaris-DatePicker__Day--today": {
                          color: isDark ? "#fff" : "inherit",
                          fontWeight: "bold",
                        },
                        "& .Polaris-DatePicker__Day--selected": {
                          bgcolor: "primary.main",
                          color: "#fff",
                        },
                        "& .Polaris-DatePicker__Day--inRange": {
                          bgcolor: isDark
                            ? "rgba(91, 163, 224, 0.3)"
                            : "rgba(11, 107, 203, 0.1)",
                        },
                      }}
                    >
                      <DatePicker
                        month={month}
                        year={year}
                        onChange={handleRangeChange}
                        onMonthChange={handleMonthChange}
                        selected={selectedRange}
                        allowRange
                      />
                    </Box>
                  </Box>
                </MuiPopover>
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* Scope Label - Mobile below the row */}
      <Box
        sx={{
          display: { xs: "flex", md: "none" },
          justifyContent: "flex-end",
          pr: 0.5,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            textAlign: "right",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "180px",
          }}
        >
          Scope:{" "}
          <b>
            {Array.isArray(productValue)
              ? productValue.length > 1
                ? `${productValue.length} Products`
                : productValue[0]?.label || "All products"
              : productValue?.label || "All products"}
          </b>
        </Typography>
      </Box>

      {/* Active Filters Chips (Scrolling Marquee) */}
    </Box>
  );
}
