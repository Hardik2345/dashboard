import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Popover,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import { CalendarDays, ChevronDown } from "lucide-react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { DatePicker } from "@shopify/polaris";
import { getDailyFunnel } from "../lib/api.js";
import { useInrCurrency } from "../lib/currency.js";
import { validateFilter } from "../lib/filterValidation.js";

const DATE_PRESETS = [
  {
    label: "Today",
    getValue: () => [dayjs().startOf("day"), dayjs().startOf("day")],
  },
  {
    label: "Yesterday",
    getValue: () => [
      dayjs().subtract(1, "day").startOf("day"),
      dayjs().subtract(1, "day").startOf("day"),
    ],
  },
  {
    label: "Last 7 days",
    getValue: () => [
      dayjs().subtract(6, "day").startOf("day"),
      dayjs().startOf("day"),
    ],
  },
  {
    label: "Last 30 days",
    getValue: () => [
      dayjs().subtract(30, "day").startOf("day"),
      dayjs().subtract(1, "day").startOf("day"),
    ],
  },
  {
    label: "Last month",
    getValue: () => [
      dayjs().subtract(1, "month").startOf("month").startOf("day"),
      dayjs().subtract(1, "month").endOf("month").startOf("day"),
    ],
  },
  {
    label: "Month-to-date",
    getValue: () => [
      dayjs().startOf("month").startOf("day"),
      dayjs().startOf("day"),
    ],
  },
  {
    label: "Last 90 days",
    getValue: () => [
      dayjs().subtract(90, "day").startOf("day"),
      dayjs().subtract(1, "day").startOf("day"),
    ],
  },
];

function formatDateValue(value) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
}

function toSafeNumber(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function formatCount(value) {
  return toSafeNumber(value).toLocaleString();
}

function formatPercent(numerator, denominator) {
  const safeDenominator = toSafeNumber(denominator);
  if (safeDenominator <= 0) return "0%";
  const value = (toSafeNumber(numerator) / safeDenominator) * 100;
  return `${value.toFixed(2)}%`;
}

function formatPanelDate(value) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD MMM YYYY") : value || "—";
}

function escapeCsvValue(value) {
  const normalized = value == null ? "" : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function sortRows(rows, sortBy, sortDir) {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = left?.[sortBy];
    const b = right?.[sortBy];

    if (typeof a === "number" || typeof b === "number") {
      return ((Number(a) || 0) - (Number(b) || 0)) * direction;
    }

    return String(a || "").localeCompare(String(b || "")) * direction;
  });
}

function DeltaBadge({ current, previous }) {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);
  const diff = curr - prev;
  if (prev === 0 && curr === 0) return null;

  const diffPct = prev === 0 ? 100 : (diff / prev) * 100;
  const color = diff >= 0 ? "success.main" : "error.main";
  const Icon = diff >= 0 ? TrendingUpIcon : TrendingDownIcon;

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        color,
        fontSize: "0.72rem",
        fontWeight: 600,
        mt: 0.25,
      }}
    >
      {Math.abs(diff) > 0.0001 ? <Icon fontSize="inherit" sx={{ mr: 0.25 }} /> : null}
      {Math.abs(diffPct).toFixed(1)}%
    </Box>
  );
}

const UTM_FILTER_FIELDS = [
  { id: "sessions", label: "Sessions" },
  { id: "atc_sessions", label: "ATC Sessions" },
  { id: "orders", label: "Orders" },
  { id: "prepaid_orders", label: "PP Orders" },
  { id: "cod_orders", label: "COD Orders" },
  { id: "partially_paid_orders", label: "PPCOD Orders" },
  { id: "cvr", label: "Conversion Rate" },
];

const UTM_FILTER_OPERATORS = [
  { id: "gt", label: "> (Gt)" },
  { id: "gte", label: ">= (Min)" },
  { id: "lt", label: "< (Lt)" },
  { id: "lte", label: "<= (Max)" },
];

const DAILY_COLUMNS = [
  { id: "date", label: "Date", align: "left" },
  { id: "sessions", label: "Sessions", align: "right" },
  { id: "atc_sessions", label: "ATC Sessions", align: "right" },
  { id: "ci_events", label: "CI Events", align: "right" },
  { id: "orders", label: "Orders", align: "right" },
  { id: "discount_amount", label: "Discounts", align: "right" },
  { id: "prepaid_orders", label: "PP Orders", align: "right" },
  { id: "cod_orders", label: "COD Orders", align: "right" },
  { id: "partially_paid_orders", label: "PPCOD Orders", align: "right" },
  { id: "cvr", label: "Conversion Rate", align: "right" },
];

const UTM_COLUMNS = [
  { id: "utm_source", label: "UTM Source", align: "left" },
  { id: "sessions", label: "Sessions", align: "right" },
  { id: "atc_sessions", label: "ATC Sessions", align: "right" },
  { id: "orders", label: "Orders", align: "right" },
  { id: "prepaid_orders", label: "PP Orders", align: "right" },
  { id: "cod_orders", label: "COD Orders", align: "right" },
  { id: "partially_paid_orders", label: "PPCOD Orders", align: "right" },
  { id: "cvr", label: "Conversion Rate", align: "right" },
];

function applyNumericFilters(rows, filters) {
  if (!Array.isArray(filters) || filters.length === 0) return rows;

  return rows.filter((row) =>
    filters.every((filter) => {
      const candidate = Number(row?.[filter.field]);
      const target = Number(filter.value);
      if (!Number.isFinite(candidate) || !Number.isFinite(target)) return false;

      switch (filter.operator) {
        case "gt":
          return candidate > target;
        case "gte":
          return candidate >= target;
        case "lt":
          return candidate < target;
        case "lte":
          return candidate <= target;
        default:
          return true;
      }
    }),
  );
}

function FunnelDateRangePicker({ startDate, endDate, onApply }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [month, setMonth] = useState(dayjs(endDate || dayjs()).month());
  const [year, setYear] = useState(dayjs(endDate || dayjs()).year());
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const handleOpen = useCallback((event) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => setAnchorEl(null), []);
  const handleMonthChange = useCallback((nextMonth, nextYear) => {
    setMonth(nextMonth);
    setYear(nextYear);
  }, []);

  const handleRangeChange = useCallback(
    ({ start: rawStart, end: rawEnd }) => {
      const nextStart = rawStart ? dayjs(rawStart).startOf("day") : null;
      const nextEnd = rawEnd ? dayjs(rawEnd).startOf("day") : null;
      if (!nextStart) return;

      const resolvedEnd = nextEnd || nextStart;
      const normalizedStart = nextStart.isAfter(resolvedEnd)
        ? resolvedEnd
        : nextStart;
      const normalizedEnd = nextStart.isAfter(resolvedEnd)
        ? nextStart
        : resolvedEnd;

      setMonth(normalizedEnd.month());
      setYear(normalizedEnd.year());
      onApply(normalizedStart, normalizedEnd);
    },
    [onApply],
  );

  const selectedRange = useMemo(() => {
    const selectedStart = startDate ? dayjs(startDate) : null;
    const selectedEnd = endDate ? dayjs(endDate) : selectedStart;
    if (!selectedStart || !selectedEnd) return undefined;
    return {
      start: selectedStart.toDate(),
      end: selectedEnd.toDate(),
    };
  }, [endDate, startDate]);

  const activePresetLabel = useMemo(() => {
    const start = startDate ? dayjs(startDate).startOf("day") : null;
    const end = endDate ? dayjs(endDate).startOf("day") : null;
    if (!start || !end) return "";
    const match = DATE_PRESETS.find((preset) => {
      const [presetStart, presetEnd] = preset.getValue();
      return (
        start.isSame(presetStart, "day") &&
        end.isSame(presetEnd, "day")
      );
    });
    return match?.label || "";
  }, [endDate, startDate]);

  const displayLabel = useMemo(() => {
    const start = startDate ? dayjs(startDate) : null;
    const end = endDate ? dayjs(endDate) : null;
    if (!start || !end) return "Select dates";
    return start.isSame(end, "day")
      ? start.format("MMM DD, YYYY")
      : `${start.format("MMM DD")} - ${end.format("MMM DD, YYYY")}`;
  }, [endDate, startDate]);

  return (
    <>
      <Button
        onClick={handleOpen}
        startIcon={<CalendarDays size={16} />}
        endIcon={<ChevronDown size={14} />}
        sx={{
          px: 2,
          minWidth: 220,
          height: 48,
          color: "text.primary",
          textTransform: "none",
          fontWeight: 500,
          fontSize: "0.875rem",
          justifyContent: "space-between",
          borderRadius: "14px",
          border: "1px solid",
          borderColor: isDark
            ? "rgba(255,255,255,0.12)"
            : "rgba(0,0,0,0.1)",
          bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.9)",
          whiteSpace: "nowrap",
          "&:hover": {
            bgcolor: isDark
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.03)",
          },
        }}
      >
        {displayLabel}
      </Button>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            mt: 1,
            borderRadius: 2,
            overflow: "hidden",
            maxWidth: "fit-content",
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
          sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" } }}
        >
          <List
            sx={{
              minWidth: 140,
              bgcolor: "transparent",
              borderRight: "1px solid",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(0,0,0,0.1)",
              py: 0,
            }}
          >
            {DATE_PRESETS.map((preset) => (
              <ListItemButton
                key={preset.label}
                selected={activePresetLabel === preset.label}
                onClick={() => {
                  const [presetStart, presetEnd] = preset.getValue();
                  onApply(presetStart, presetEnd);
                  setMonth(presetEnd.month());
                  setYear(presetEnd.year());
                  handleClose();
                }}
                dense
                sx={{
                  "&:hover": {
                    bgcolor: isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.05)",
                  },
                }}
              >
                <ListItemText
                  primary={preset.label}
                  primaryTypographyProps={{ variant: "body2" }}
                />
              </ListItemButton>
            ))}
          </List>
          <Box
            sx={{
              p: 2,
              maxWidth: 350,
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
      </Popover>
    </>
  );
}

function FunnelSingleDatePicker({ date, onApply }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [month, setMonth] = useState(dayjs(date || dayjs()).month());
  const [year, setYear] = useState(dayjs(date || dayjs()).year());
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const handleOpen = useCallback((event) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => setAnchorEl(null), []);
  const handleMonthChange = useCallback((nextMonth, nextYear) => {
    setMonth(nextMonth);
    setYear(nextYear);
  }, []);

  const selected = useMemo(() => {
    const selectedDate = date ? dayjs(date) : dayjs();
    return {
      start: selectedDate.startOf("day").toDate(),
      end: selectedDate.startOf("day").toDate(),
    };
  }, [date]);

  const displayLabel = useMemo(() => {
    const selectedDate = date ? dayjs(date) : null;
    return selectedDate?.isValid()
      ? selectedDate.format("MMM DD, YYYY")
      : "Select date";
  }, [date]);

  return (
    <>
      <Button
        onClick={handleOpen}
        startIcon={<CalendarDays size={16} />}
        endIcon={<ChevronDown size={14} />}
        sx={{
          px: 2,
          minWidth: 200,
          height: 48,
          color: "text.primary",
          textTransform: "none",
          fontWeight: 500,
          fontSize: "0.875rem",
          justifyContent: "space-between",
          borderRadius: "14px",
          border: "1px solid",
          borderColor: isDark
            ? "rgba(255,255,255,0.12)"
            : "rgba(0,0,0,0.1)",
          bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.9)",
          whiteSpace: "nowrap",
          "&:hover": {
            bgcolor: isDark
              ? "rgba(255,255,255,0.08)"
              : "rgba(0,0,0,0.03)",
          },
        }}
      >
        {displayLabel}
      </Button>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            mt: 1,
            borderRadius: 2,
            overflow: "hidden",
            maxWidth: "fit-content",
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
            p: 2,
            maxWidth: 350,
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
            },
            "& .Polaris-DatePicker__Day--today": {
              color: isDark ? "#fff" : "inherit",
              fontWeight: "bold",
            },
            "& .Polaris-DatePicker__Day--selected": {
              bgcolor: "primary.main",
              color: "#fff",
            },
          }}
        >
          <DatePicker
            month={month}
            year={year}
            onMonthChange={handleMonthChange}
            selected={selected}
            onChange={({ start: rawStart, end: rawEnd }) => {
              const picked = rawEnd || rawStart;
              if (!picked) return;
              const nextDate = dayjs(picked).startOf("day");
              setMonth(nextDate.month());
              setYear(nextDate.year());
              onApply(nextDate);
              handleClose();
            }}
          />
        </Box>
      </Popover>
    </>
  );
}

export default function DailyFunnelPanel({
  brandKey,
  initialStartDate,
  initialEndDate,
  canAccessUtmFunnelTable = true,
}) {
  const initialStart = useMemo(
    () => formatDateValue(initialStartDate || dayjs().subtract(6, "day")),
    [initialStartDate],
  );
  const initialEnd = useMemo(
    () => formatDateValue(initialEndDate || dayjs()),
    [initialEndDate],
  );
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [utmDate, setUtmDate] = useState(initialEnd);
  const [displayMode, setDisplayMode] = useState("count");
  const [rows, setRows] = useState([]);
  const [utmRows, setUtmRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [utmLoading, setUtmLoading] = useState(false);
  const [error, setError] = useState("");
  const [utmError, setUtmError] = useState("");
  const [dailySortBy, setDailySortBy] = useState("date");
  const [dailySortDir, setDailySortDir] = useState("desc");
  const [utmSortBy, setUtmSortBy] = useState("sessions");
  const [utmSortDir, setUtmSortDir] = useState("desc");
  const [dailyPage, setDailyPage] = useState(0);
  const [dailyRowsPerPage, setDailyRowsPerPage] = useState(10);
  const [utmPage, setUtmPage] = useState(0);
  const [utmRowsPerPage, setUtmRowsPerPage] = useState(10);
  const [utmFilters, setUtmFilters] = useState([]);
  const [utmFilterExpanded, setUtmFilterExpanded] = useState(false);
  const [showUtmFilterForm, setShowUtmFilterForm] = useState(false);
  const [utmFilterField, setUtmFilterField] = useState("sessions");
  const [utmFilterOperator, setUtmFilterOperator] = useState("gt");
  const [utmFilterValue, setUtmFilterValue] = useState("");
  const currency = useInrCurrency(brandKey, endDate);

  useEffect(() => {
    setStartDate(initialStart);
  }, [initialStart]);

  useEffect(() => {
    setEndDate(initialEnd);
  }, [initialEnd]);

  useEffect(() => {
    setUtmDate(initialEnd);
  }, [initialEnd]);

  useEffect(() => {
    let cancelled = false;

    if (!brandKey || !startDate || !endDate) {
      setRows([]);
      setError("");
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError("");

    getDailyFunnel({
      brand_key: brandKey,
      start: startDate,
      end: endDate,
    })
      .then((result) => {
        if (cancelled) return;
        if (result?.error) {
          setRows([]);
          setError("Failed to load daily funnel rows.");
          return;
        }
        setRows(Array.isArray(result?.rows) ? result.rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setError("Failed to load daily funnel rows.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandKey, endDate, startDate]);

  useEffect(() => {
    let cancelled = false;

    if (!canAccessUtmFunnelTable || !brandKey || !utmDate) {
      setUtmRows([]);
      setUtmError("");
      return () => {
        cancelled = true;
      };
    }

    setUtmLoading(true);
    setUtmError("");

    getDailyFunnel({
      brand_key: brandKey,
      start: startDate,
      end: endDate,
      utmDate,
    })
      .then((result) => {
        if (cancelled) return;
        if (result?.error) {
          setUtmRows([]);
          setUtmError("Failed to load UTM source funnel rows.");
          return;
        }
        setUtmRows(Array.isArray(result?.utmRows) ? result.utmRows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setUtmRows([]);
        setUtmError("Failed to load UTM source funnel rows.");
      })
      .finally(() => {
        if (!cancelled) setUtmLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandKey, canAccessUtmFunnelTable, endDate, startDate, utmDate]);

  const normalizedRows = useMemo(
    () =>
      [...rows]
        .map((row) => ({
          date: row?.date || "",
          sales: toSafeNumber(row?.sales),
          sessions: toSafeNumber(row?.sessions),
          atc_sessions: toSafeNumber(row?.atc_sessions),
          ci_events: toSafeNumber(row?.ci_events),
          orders: toSafeNumber(row?.orders),
          discount_amount: toSafeNumber(row?.discount_amount),
          prepaid_orders: toSafeNumber(row?.prepaid_orders),
          cod_orders: toSafeNumber(row?.cod_orders),
          partially_paid_orders: toSafeNumber(row?.partially_paid_orders),
        }))
        .sort((left, right) => right.date.localeCompare(left.date)),
    [rows],
  );

  const tableRows = useMemo(
    () =>
      normalizedRows.map((row) => ({
        ...row,
        atcDisplay:
          displayMode === "percent"
            ? formatPercent(row.atc_sessions, row.sessions)
            : formatCount(row.atc_sessions),
        ciDisplay:
          displayMode === "percent"
            ? formatPercent(row.ci_events, row.atc_sessions)
            : formatCount(row.ci_events),
        ordersDisplay:
          displayMode === "percent"
            ? formatPercent(row.orders, row.ci_events)
            : formatCount(row.orders),
        cvr: row.sessions > 0 ? (row.orders / row.sessions) * 100 : 0,
        cvrDisplay: formatPercent(row.orders, row.sessions),
        ppDisplay:
          displayMode === "percent"
            ? formatPercent(row.prepaid_orders, row.orders)
            : formatCount(row.prepaid_orders),
        codDisplay:
          displayMode === "percent"
            ? formatPercent(row.cod_orders, row.orders)
            : formatCount(row.cod_orders),
        ppcodDisplay:
          displayMode === "percent"
            ? formatPercent(row.partially_paid_orders, row.orders)
            : formatCount(row.partially_paid_orders),
        discountsDisplay:
          displayMode === "percent"
            ? formatPercent(row.discount_amount, row.sales)
            : currency.formatAmount(row.discount_amount, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
      })),
    [currency, displayMode, normalizedRows],
  );

  const sortedDailyRows = useMemo(
    () => sortRows(tableRows, dailySortBy, dailySortDir),
    [dailySortBy, dailySortDir, tableRows],
  );

  const normalizedUtmRows = useMemo(
    () =>
      [...utmRows].map((row) => ({
        utm_source: row?.utm_source || "direct",
        sales: toSafeNumber(row?.sales),
        sessions: toSafeNumber(row?.sessions),
        atc_sessions: toSafeNumber(row?.atc_sessions),
        orders: toSafeNumber(row?.orders),
        prepaid_orders: toSafeNumber(row?.prepaid_orders),
        cod_orders: toSafeNumber(row?.cod_orders),
        partially_paid_orders: toSafeNumber(row?.partially_paid_orders),
        previous: {
          sales: toSafeNumber(row?.previous?.sales),
          sessions: toSafeNumber(row?.previous?.sessions),
          atc_sessions: toSafeNumber(row?.previous?.atc_sessions),
          orders: toSafeNumber(row?.previous?.orders),
          prepaid_orders: toSafeNumber(row?.previous?.prepaid_orders),
          cod_orders: toSafeNumber(row?.previous?.cod_orders),
          partially_paid_orders: toSafeNumber(row?.previous?.partially_paid_orders),
        },
        previous_date: row?.previous_date || null,
      })),
    [utmRows],
  );

  const utmTableRows = useMemo(() => {
    const mappedRows = normalizedUtmRows.map((row) => ({
      ...row,
      atcDisplay:
        displayMode === "percent"
          ? formatPercent(row.atc_sessions, row.sessions)
          : formatCount(row.atc_sessions),
      ordersDisplay:
        displayMode === "percent"
          ? formatPercent(row.orders, row.atc_sessions)
          : formatCount(row.orders),
      cvr: row.sessions > 0 ? (row.orders / row.sessions) * 100 : 0,
      cvrDisplay: formatPercent(row.orders, row.sessions),
      ppDisplay:
        displayMode === "percent"
          ? formatPercent(row.prepaid_orders, row.orders)
          : formatCount(row.prepaid_orders),
      codDisplay:
        displayMode === "percent"
          ? formatPercent(row.cod_orders, row.orders)
          : formatCount(row.cod_orders),
      ppcodDisplay:
        displayMode === "percent"
          ? formatPercent(row.partially_paid_orders, row.orders)
          : formatCount(row.partially_paid_orders),
    }));

    return sortRows(mappedRows, utmSortBy, utmSortDir);
  }, [currency, displayMode, normalizedUtmRows, utmSortBy, utmSortDir]);

  const utmFilterValidation = useMemo(() => {
    if (!utmFilterField || utmFilterValue === "") {
      return { valid: true, message: "" };
    }

    if (utmFilterOperator === "gte" || utmFilterOperator === "lte") {
      return { valid: true, message: "" };
    }

    return validateFilter(
      {
        field: utmFilterField,
        operator: utmFilterOperator,
        value: Number(utmFilterValue),
      },
      utmFilters
        .filter((item) => item.operator === "gt" || item.operator === "lt")
        .map((item) => ({
          field: item.field,
          operator: item.operator,
          value: Number(item.value),
        })),
    );
  }, [utmFilterField, utmFilterOperator, utmFilterValue, utmFilters]);

  const filteredUtmRows = useMemo(
    () => applyNumericFilters(utmTableRows, utmFilters),
    [utmFilters, utmTableRows],
  );

  const pagedDailyRows = useMemo(() => {
    const start = dailyPage * dailyRowsPerPage;
    return sortedDailyRows.slice(start, start + dailyRowsPerPage);
  }, [dailyPage, dailyRowsPerPage, sortedDailyRows]);

  const pagedUtmRows = useMemo(() => {
    const start = utmPage * utmRowsPerPage;
    return filteredUtmRows.slice(start, start + utmRowsPerPage);
  }, [filteredUtmRows, utmPage, utmRowsPerPage]);

  useEffect(() => {
    setDailyPage(0);
  }, [startDate, endDate, dailyRowsPerPage]);

  useEffect(() => {
    setUtmPage(0);
  }, [utmDate, utmRowsPerPage, utmSortBy, utmSortDir, utmFilters]);

  useEffect(() => {
    setDailyPage((current) =>
      Math.min(current, Math.max(Math.ceil(tableRows.length / dailyRowsPerPage) - 1, 0)),
    );
  }, [dailyRowsPerPage, tableRows.length]);

  useEffect(() => {
    setUtmPage((current) =>
      Math.min(
        current,
        Math.max(Math.ceil(filteredUtmRows.length / utmRowsPerPage) - 1, 0),
      ),
    );
  }, [filteredUtmRows.length, utmRowsPerPage]);

  const handleModeChange = (_event, nextMode) => {
    if (nextMode) setDisplayMode(nextMode);
  };

  const handleDailySort = useCallback((columnId) => {
    setDailySortBy((currentSortBy) => {
      if (currentSortBy === columnId) {
        setDailySortDir((currentSortDir) =>
          currentSortDir === "asc" ? "desc" : "asc",
        );
        return currentSortBy;
      }
      setDailySortDir(columnId === "date" ? "desc" : "desc");
      return columnId;
    });
  }, []);

  const handleUtmSort = useCallback((columnId) => {
    setUtmSortBy((currentSortBy) => {
      if (currentSortBy === columnId) {
        setUtmSortDir((currentSortDir) =>
          currentSortDir === "asc" ? "desc" : "asc",
        );
        return currentSortBy;
      }
      setUtmSortDir("desc");
      return columnId;
    });
  }, []);

  const handleAddUtmFilter = useCallback(() => {
    const normalizedValue = Number(utmFilterValue);
    if (!utmFilterField || !Number.isFinite(normalizedValue)) return;
    if (!utmFilterValidation.valid) return;

    setUtmFilters((current) => [
      ...current,
      {
        field: utmFilterField,
        operator: utmFilterOperator,
        value: normalizedValue,
      },
    ]);
    setUtmFilterValue("");
    setShowUtmFilterForm(false);
  }, [
    utmFilterField,
    utmFilterOperator,
    utmFilterValidation.valid,
    utmFilterValue,
  ]);

  const handleRemoveUtmFilter = useCallback((index) => {
    setUtmFilters((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }, []);

  const getUtmMetricDisplayValue = useCallback(
    (row, columnId, mode) => {
      if (mode === "percent") {
        switch (columnId) {
          case "atc_sessions":
            return formatPercent(row.atc_sessions, row.sessions);
          case "orders":
            return formatPercent(row.orders, row.atc_sessions);
          case "prepaid_orders":
            return formatPercent(row.prepaid_orders, row.orders);
          case "cod_orders":
            return formatPercent(row.cod_orders, row.orders);
          case "partially_paid_orders":
            return formatPercent(row.partially_paid_orders, row.orders);
          case "cvr":
            return formatPercent(row.orders, row.sessions);
          default:
            return formatCount(row[columnId]);
        }
      }

      switch (columnId) {
        case "atc_sessions":
          return formatCount(row.atc_sessions);
        case "orders":
          return formatCount(row.orders);
        case "prepaid_orders":
          return formatCount(row.prepaid_orders);
        case "cod_orders":
          return formatCount(row.cod_orders);
        case "partially_paid_orders":
          return formatCount(row.partially_paid_orders);
        case "cvr":
          return formatPercent(row.orders, row.sessions);
        default:
          return formatCount(row[columnId]);
      }
    },
    [currency],
  );

  const getUtmDeltaMetricValue = useCallback((row, columnId, mode) => {
    const current = row || {};
    const previous = row?.previous || {};

    if (columnId === "cvr") {
      return {
        current: current.sessions > 0 ? (current.orders / current.sessions) * 100 : 0,
        previous: previous.sessions > 0 ? (previous.orders / previous.sessions) * 100 : 0,
      };
    }

    if (mode === "percent") {
      switch (columnId) {
        case "atc_sessions":
          return {
            current: current.sessions > 0 ? (current.atc_sessions / current.sessions) * 100 : 0,
            previous: previous.sessions > 0 ? (previous.atc_sessions / previous.sessions) * 100 : 0,
          };
        case "orders":
          return {
            current: current.atc_sessions > 0 ? (current.orders / current.atc_sessions) * 100 : 0,
            previous: previous.atc_sessions > 0 ? (previous.orders / previous.atc_sessions) * 100 : 0,
          };
        case "prepaid_orders":
          return {
            current: current.orders > 0 ? (current.prepaid_orders / current.orders) * 100 : 0,
            previous: previous.orders > 0 ? (previous.prepaid_orders / previous.orders) * 100 : 0,
          };
        case "cod_orders":
          return {
            current: current.orders > 0 ? (current.cod_orders / current.orders) * 100 : 0,
            previous: previous.orders > 0 ? (previous.cod_orders / previous.orders) * 100 : 0,
          };
        case "partially_paid_orders":
          return {
            current: current.orders > 0 ? (current.partially_paid_orders / current.orders) * 100 : 0,
            previous: previous.orders > 0 ? (previous.partially_paid_orders / previous.orders) * 100 : 0,
          };
        default:
          return {
            current: Number(current[columnId] || 0),
            previous: Number(previous[columnId] || 0),
          };
      }
    }

    return {
      current: Number(current[columnId] || 0),
      previous: Number(previous[columnId] || 0),
    };
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!sortedDailyRows.length) return;

    const headers = [
      "Date",
      "Sessions",
      "ATC Sessions",
      "CI Events",
      "Orders",
      "Discounts",
      "PP Orders",
      "COD Orders",
      "PPCOD Orders",
      "Conversion Rate",
    ];

    const lines = [
      headers.join(","),
      ...sortedDailyRows.map((row) =>
        [
          formatPanelDate(row.date),
          formatCount(row.sessions),
          row.atcDisplay,
          row.ciDisplay,
          row.ordersDisplay,
          row.discountsDisplay,
          row.ppDisplay,
          row.codDisplay,
          row.ppcodDisplay,
          row.cvrDisplay,
        ]
          .map(escapeCsvValue)
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const suffix =
      startDate && endDate
        ? `${startDate}_to_${endDate}`
        : dayjs().format("YYYY-MM-DD");
    link.href = url;
    link.download = `daily-funnel-${(brandKey || "brand").toLowerCase()}-${suffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [brandKey, endDate, sortedDailyRows, startDate]);

  const handleExportUtmCsv = useCallback(() => {
    if (!filteredUtmRows.length) return;

    const headers = [
      "UTM Source",
      "Sessions",
      "ATC Sessions",
      "Orders",
      "PP Orders",
      "COD Orders",
      "PPCOD Orders",
      "Conversion Rate",
    ];

    const lines = [
      headers.join(","),
      ...filteredUtmRows.map((row) =>
        [
          row.utm_source,
          formatCount(row.sessions),
          row.atcDisplay,
          row.ordersDisplay,
          row.ppDisplay,
          row.codDisplay,
          row.ppcodDisplay,
          row.cvrDisplay,
        ]
          .map(escapeCsvValue)
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `utm-source-funnel-${(brandKey || "brand").toLowerCase()}-${utmDate || dayjs().format("YYYY-MM-DD")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [brandKey, filteredUtmRows, utmDate]);

  const hasRows = sortedDailyRows.length > 0;
  const hasUtmRows = filteredUtmRows.length > 0;

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", md: "center" }}
            justifyContent="space-between"
          >
            <Stack spacing={0.5}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Conversion Funnel
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Daily funnel and payment split rows for the selected brand.
              </Typography>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <FunnelDateRangePicker
                startDate={startDate}
                endDate={endDate}
                onApply={(nextStart, nextEnd) => {
                  setStartDate(nextStart.format("YYYY-MM-DD"));
                  setEndDate(nextEnd.format("YYYY-MM-DD"));
                }}
              />
              <ToggleButtonGroup
                size="small"
                exclusive
                value={displayMode}
                onChange={handleModeChange}
                aria-label="Count or percentage"
              >
                <ToggleButton value="count">Count</ToggleButton>
                <ToggleButton value="percent">%</ToggleButton>
              </ToggleButtonGroup>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExportCsv}
                disabled={!hasRows}
                sx={{ minWidth: "fit-content" }}
              >
                Export CSV
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent sx={{ p: 0 }}>
          {error ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          ) : null}

          {loading ? (
            <Box
              sx={{
                minHeight: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CircularProgress size={28} />
            </Box>
          ) : hasRows ? (
            <>
              <TableContainer>
                <Table
                  size="small"
                  sx={{
                    "& th, & td": {
                      px: 1.25,
                      py: 1,
                    },
                    "& th": {
                      fontSize: "0.75rem",
                    },
                    "& td": {
                      fontSize: "0.8125rem",
                    },
                  }}
                >
                <TableHead>
                  <TableRow>
                    {DAILY_COLUMNS.map((column) => (
                      <TableCell
                        key={column.id}
                        align={column.align}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        <TableSortLabel
                          active={dailySortBy === column.id}
                          direction={dailySortBy === column.id ? dailySortDir : "asc"}
                          onClick={() => handleDailySort(column.id)}
                        >
                          {column.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                  <TableBody>
                    {pagedDailyRows.map((row) => (
                      <TableRow key={row.date} hover>
                        <TableCell
                          sx={{
                            fontWeight: 700,
                            color: "primary.main",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Box
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <span>{formatPanelDate(row.date)}</span>
                            {dayjs(row.date).isSame(dayjs(), "day") ? (
                              <Box
                                component="span"
                                sx={{
                                  px: 0.75,
                                  py: 0.25,
                                  borderRadius: 999,
                                  fontSize: "0.65rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                  color: "#14532d",
                                  bgcolor: "#bbf7d0",
                                  border: "1px solid #86efac",
                                  lineHeight: 1.2,
                                  animation: "dailyFunnelLivePulse 1.2s ease-in-out infinite",
                                  "@keyframes dailyFunnelLivePulse": {
                                    "0%": {
                                      opacity: 0.55,
                                      transform: "scale(0.98)",
                                    },
                                    "50%": {
                                      opacity: 1,
                                      transform: "scale(1)",
                                    },
                                    "100%": {
                                      opacity: 0.55,
                                      transform: "scale(0.98)",
                                    },
                                  },
                                }}
                              >
                                Live
                              </Box>
                            ) : null}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          {formatCount(row.sessions)}
                        </TableCell>
                        <TableCell align="right">{row.atcDisplay}</TableCell>
                        <TableCell align="right">{row.ciDisplay}</TableCell>
                        <TableCell align="right">{row.ordersDisplay}</TableCell>
                        <TableCell align="right">
                          {row.discountsDisplay}
                        </TableCell>
                        <TableCell align="right">{row.ppDisplay}</TableCell>
                        <TableCell align="right">{row.codDisplay}</TableCell>
                        <TableCell align="right">{row.ppcodDisplay}</TableCell>
                        <TableCell align="right">{row.cvrDisplay}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={sortedDailyRows.length}
                page={dailyPage}
                onPageChange={(_event, nextPage) => setDailyPage(nextPage)}
                rowsPerPage={dailyRowsPerPage}
                onRowsPerPageChange={(event) => {
                  setDailyRowsPerPage(Number(event.target.value));
                  setDailyPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            </>
          ) : (
            <Box
              sx={{
                minHeight: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
              }}
            >
              <Stack spacing={1} alignItems="center">
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  No daily funnel data found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Adjust the local date range to load available rows.
                </Typography>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
      
      {canAccessUtmFunnelTable ? (
        <>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", md: "center" }}
            justifyContent="space-between"
          >
            <Stack spacing={0.5}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                UTM Source Funnel
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Single-day UTM source breakdown for the selected brand.
              </Typography>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="body2" color="text.secondary">
                Selected date: {formatPanelDate(utmDate)}
              </Typography>
              <FunnelSingleDatePicker
                date={utmDate}
                onApply={(nextDate) =>
                  setUtmDate(nextDate.format("YYYY-MM-DD"))
                }
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExportUtmCsv}
                disabled={!hasUtmRows}
                sx={{ minWidth: "fit-content" }}
              >
                Export CSV
              </Button>
            </Stack>
          </Stack>
          <Accordion
            expanded={utmFilterExpanded}
            onChange={(_event, expanded) => setUtmFilterExpanded(expanded)}
            disableGutters
            elevation={0}
            sx={{
              mt: 2,
              bgcolor: "transparent",
              "&:before": { display: "none" },
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography
                variant="subtitle2"
                color="text.primary"
                sx={{
                  textTransform: "uppercase",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                Filters
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  mb: 1,
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => setShowUtmFilterForm((current) => !current)}
                  color={showUtmFilterForm ? "primary" : "default"}
                  sx={{
                    bgcolor: showUtmFilterForm ? "action.selected" : "transparent",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Box>

              <Collapse in={showUtmFilterForm} unmountOnExit>
                <Card
                  variant="outlined"
                  sx={{
                    p: 2,
                    mb: 2,
                    borderRadius: 2,
                    bgcolor: "action.hover",
                    border: "1px dashed",
                    borderColor: "divider",
                  }}
                >
                  <Stack spacing={2}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Field</InputLabel>
                      <Select
                        value={utmFilterField}
                        label="Field"
                        onChange={(event) => setUtmFilterField(event.target.value)}
                      >
                        {UTM_FILTER_FIELDS.map((column) => (
                          <MenuItem key={column.id} value={column.id}>
                            {column.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Stack direction="row" spacing={1}>
                      <FormControl size="small" sx={{ width: "40%" }}>
                        <Select
                          value={utmFilterOperator}
                          onChange={(event) =>
                            setUtmFilterOperator(event.target.value)
                          }
                        >
                          {UTM_FILTER_OPERATORS.map((operator) => (
                            <MenuItem key={operator.id} value={operator.id}>
                              {operator.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        type="number"
                        placeholder="Val"
                        value={utmFilterValue}
                        onChange={(event) => setUtmFilterValue(event.target.value)}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                    {!utmFilterValidation.valid ? (
                      <Alert
                        severity="warning"
                        sx={{
                          py: 0,
                          px: 1,
                          "& .MuiAlert-message": { fontSize: "0.75rem" },
                          alignItems: "center",
                        }}
                      >
                        {utmFilterValidation.message}
                      </Alert>
                    ) : null}
                    <Button
                      variant="contained"
                      size="small"
                      disabled={
                        !utmFilterField ||
                        utmFilterValue === "" ||
                        !utmFilterValidation.valid
                      }
                      onClick={handleAddUtmFilter}
                      sx={{
                        alignSelf: "flex-end",
                        textTransform: "none",
                        borderRadius: 2,
                        boxShadow: "none",
                      }}
                    >
                      Apply Filter
                    </Button>
                  </Stack>
                </Card>
              </Collapse>

              {utmFilters.length === 0 && !showUtmFilterForm ? (
                <Box
                  sx={{
                    p: 3,
                    textAlign: "center",
                    bgcolor: "action.hover",
                    borderRadius: 2,
                    border: "1px dashed",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    No active filters
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Click + to add one
                  </Typography>
                </Box>
              ) : null}

              {utmFilters.length > 0 ? (
                <Stack spacing={1}>
                  {utmFilters.map((filter, index) => {
                    const column = UTM_FILTER_FIELDS.find(
                      (item) => item.id === filter.field,
                    );
                    const operator = UTM_FILTER_OPERATORS.find(
                      (item) => item.id === filter.operator,
                    );

                    return (
                      <Card
                        key={`${filter.field}-${filter.operator}-${filter.value}-${index}`}
                        variant="outlined"
                        sx={{
                          p: 1,
                          pl: 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderRadius: 2,
                          bgcolor: "action.hover",
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <Box>
                          <Typography
                            variant="caption"
                            display="block"
                            color="text.secondary"
                            fontSize="0.65rem"
                            fontWeight={600}
                            sx={{ textTransform: "uppercase" }}
                          >
                            {column?.label || filter.field}
                          </Typography>
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            fontSize="0.75rem"
                          >
                            {operator?.label || filter.operator} <b>{filter.value}</b>
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveUtmFilter(index)}
                          sx={{
                            color: "text.secondary",
                            "&:hover": { color: "error.main" },
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Card>
                    );
                  })}
                  <Button
                    variant="text"
                    color="error"
                    onClick={() => setUtmFilters([])}
                    startIcon={<DeleteIcon />}
                    sx={{ alignSelf: "flex-start", textTransform: "none" }}
                  >
                    Clear All Filters
                  </Button>
                </Stack>
              ) : null}
            </AccordionDetails>
          </Accordion>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent sx={{ p: 0 }}>
          {utmError ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{utmError}</Alert>
            </Box>
          ) : null}

          {utmLoading ? (
            <Box
              sx={{
                minHeight: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CircularProgress size={28} />
            </Box>
          ) : hasUtmRows ? (
            <>
              <TableContainer>
                <Table
                  size="small"
                  sx={{
                    "& th, & td": {
                      px: 1.25,
                      py: 1,
                    },
                    "& th": {
                      fontSize: "0.75rem",
                    },
                    "& td": {
                      fontSize: "0.8125rem",
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      {UTM_COLUMNS.map((column) => (
                        <TableCell
                          key={column.id}
                          align={column.align}
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          <TableSortLabel
                            active={utmSortBy === column.id}
                            direction={utmSortBy === column.id ? utmSortDir : "asc"}
                            onClick={() => handleUtmSort(column.id)}
                          >
                            {column.label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedUtmRows.map((row) => (
                      <TableRow key={`${row.utm_source}-${utmDate}`} hover>
                        <TableCell
                          sx={{
                            fontWeight: 700,
                            color: "primary.main",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.utm_source}
                        </TableCell>
                        {UTM_COLUMNS.filter((column) => column.id !== "utm_source").map((column) => {
                          const metric = getUtmDeltaMetricValue(row, column.id, displayMode);
                          const previousRow = { ...row.previous };
                          const previousDisplay = getUtmMetricDisplayValue(
                            { ...row, ...previousRow, previous: {} },
                            column.id,
                            displayMode,
                          );

                          return (
                            <TableCell key={column.id} align="right">
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                  width: "100%",
                                }}
                              >
                                <span>{getUtmMetricDisplayValue(row, column.id, displayMode)}</span>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ fontSize: "0.7rem", lineHeight: 1.2 }}
                                >
                                  {previousDisplay}
                                </Typography>
                                <DeltaBadge current={metric.current} previous={metric.previous} />
                              </Box>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filteredUtmRows.length}
                page={utmPage}
                onPageChange={(_event, nextPage) => setUtmPage(nextPage)}
                rowsPerPage={utmRowsPerPage}
                onRowsPerPageChange={(event) => {
                  setUtmRowsPerPage(Number(event.target.value));
                  setUtmPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            </>
          ) : (
            <Box
              sx={{
                minHeight: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
              }}
            >
              <Stack spacing={1} alignItems="center">
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  No UTM source funnel data found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Select a different date to load available UTM rows.
                </Typography>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
        </>
      ) : null}
    </Stack>
  );
}
