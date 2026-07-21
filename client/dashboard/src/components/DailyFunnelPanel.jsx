import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import { CalendarDays, ChevronDown } from "lucide-react";
import DownloadIcon from "@mui/icons-material/Download";
import { DatePicker } from "@shopify/polaris";
import { getDailyFunnel } from "../lib/api.js";
import { useInrCurrency } from "../lib/currency.js";

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

export default function DailyFunnelPanel({
  brandKey,
  initialStartDate,
  initialEndDate,
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
  const [displayMode, setDisplayMode] = useState("count");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const currency = useInrCurrency(brandKey, endDate);

  useEffect(() => {
    setStartDate(initialStart);
  }, [initialStart]);

  useEffect(() => {
    setEndDate(initialEnd);
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

  const handleModeChange = (_event, nextMode) => {
    if (nextMode) setDisplayMode(nextMode);
  };

  const handleExportCsv = useCallback(() => {
    if (!tableRows.length) return;

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
    ];

    const lines = [
      headers.join(","),
      ...tableRows.map((row) =>
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
  }, [brandKey, endDate, startDate, tableRows]);

  const hasRows = tableRows.length > 0;

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
                Daily Funnel
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
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Sessions</TableCell>
                    <TableCell align="right">ATC Sessions</TableCell>
                    <TableCell align="right">CI Events</TableCell>
                    <TableCell align="right">Orders</TableCell>
                    <TableCell align="right">Discounts</TableCell>
                    <TableCell align="right">PP Orders</TableCell>
                    <TableCell align="right">COD Orders</TableCell>
                    <TableCell align="right">PPCOD Orders</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableRows.map((row) => (
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
    </Stack>
  );
}
