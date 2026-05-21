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
  FormControl,
  Grow,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Popover as MuiPopover,
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
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import KeyboardArrowLeft from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import { useTheme } from "@mui/material/styles";
import { AppProvider } from "@shopify/polaris";
import { DatePicker } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { getBundleOptions, getBundleProducts, getBundleSummary } from "../lib/api.js";

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
      dayjs().subtract(29, "day").startOf("day"),
      dayjs().startOf("day"),
    ],
  },
];

function formatDate(value) {
  return dayjs(value).format("YYYY-MM-DD");
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function PaginationActions({ count, page, rowsPerPage, onPageChange, disabled }) {
  const lastPage = Math.max(0, Math.ceil(count / rowsPerPage) - 1);
  return (
    <Box sx={{ flexShrink: 0, ml: 2.5, display: "flex", alignItems: "center" }}>
      <Button
        onClick={(event) => onPageChange(event, page - 1)}
        disabled={disabled || page <= 0}
        sx={{ minWidth: 0, px: 1 }}
      >
        <KeyboardArrowLeft />
      </Button>
      <Button
        onClick={(event) => onPageChange(event, page + 1)}
        disabled={disabled || page >= lastPage}
        sx={{ minWidth: 0, px: 1 }}
      >
        <KeyboardArrowRight />
      </Button>
    </Box>
  );
}

function DateRangePicker({ startDate, endDate, onApply }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const active = Boolean(anchorEl);
  const [month, setMonth] = useState(dayjs().month());
  const [year, setYear] = useState(dayjs().year());
  const [internalStart, setInternalStart] = useState(null);
  const [internalEnd, setInternalEnd] = useState(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  useEffect(() => {
    const focus = endDate || startDate || dayjs();
    setMonth(dayjs(focus).month());
    setYear(dayjs(focus).year());
  }, [startDate, endDate, anchorEl]);

  const toggle = useCallback(
    (event) => {
      if (anchorEl) {
        setAnchorEl(null);
        return;
      }
      const nextStart = dayjs(startDate || dayjs()).startOf("day");
      const nextEnd = dayjs(endDate || startDate || dayjs()).startOf("day");
      setInternalStart(nextStart);
      setInternalEnd(nextEnd);
      setMonth(nextEnd.month());
      setYear(nextEnd.year());
      setAnchorEl(event.currentTarget);
    },
    [anchorEl, startDate, endDate],
  );

  const handleRangeChange = useCallback(
    ({ start: nextStartRaw, end: nextEndRaw }) => {
      const nextStart = nextStartRaw ? dayjs(nextStartRaw).startOf("day") : null;
      const nextEnd = nextEndRaw ? dayjs(nextEndRaw).startOf("day") : null;
      const focus = nextEnd || nextStart;
      if (focus) {
        setMonth(focus.month());
        setYear(focus.year());
      }
      setInternalStart(nextStart);
      setInternalEnd(nextEnd);
      if (nextStart && nextEnd && nextStart.isAfter(nextEnd)) {
        onApply(nextEnd, nextStart);
        setInternalStart(nextEnd);
        setInternalEnd(nextStart);
        return;
      }
      if (nextStart && !nextEnd) {
        onApply(nextStart, nextStart);
        return;
      }
      onApply(nextStart, nextEnd);
    },
    [onApply],
  );

  const handlePreset = useCallback(
    (preset) => {
      const [nextStart, nextEnd] = preset.getValue();
      setMonth(nextEnd.month());
      setYear(nextEnd.year());
      setInternalStart(nextStart);
      setInternalEnd(nextEnd);
      onApply(nextStart, nextEnd);
      setAnchorEl(null);
    },
    [onApply],
  );

  const selectedRange = useMemo(() => {
    const nextStart = internalStart || dayjs(startDate || dayjs()).startOf("day");
    const nextEnd = internalEnd || dayjs(endDate || startDate || dayjs()).startOf("day");
    return {
      start: nextStart.toDate(),
      end: nextEnd.toDate(),
    };
  }, [internalStart, internalEnd, startDate, endDate]);

  const label = useMemo(() => {
    const nextStart = startDate ? dayjs(startDate) : null;
    const nextEnd = endDate ? dayjs(endDate) : null;
    if (nextStart && nextEnd) {
      return nextStart.isSame(nextEnd, "day")
        ? nextStart.format("DD MMM YYYY")
        : `${nextStart.format("DD MMM YYYY")} - ${nextEnd.format("DD MMM YYYY")}`;
    }
    return "Select dates";
  }, [startDate, endDate]);

  return (
    <AppProvider
      i18n={enTranslations}
      theme={{ colorScheme: isDark ? "dark" : "light" }}
    >
      <Card
        elevation={0}
        onClick={toggle}
        role="button"
        tabIndex={0}
        sx={{
          px: 1.25,
          height: 36,
          minWidth: { xs: "100%", sm: 200 },
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          borderRadius: 2,
          userSelect: "none",
          textAlign: "center",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "none",
          bgcolor: "background.paper",
          color: "text.primary",
          "&:hover": { filter: "brightness(0.97)" },
        }}
      >
        <Typography variant="body2" noWrap sx={{ color: "inherit" }}>
          {label}
        </Typography>
      </Card>

      <MuiPopover
        open={active}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        TransitionComponent={Grow}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            borderRadius: 1,
            mt: 1,
            overflow: "hidden",
            boxShadow: theme.shadows[8],
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
          }}
        >
          <Box
            sx={{
              minWidth: 160,
              maxHeight: 320,
              overflowY: "auto",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              display: { xs: "none", md: "block" },
            }}
          >
            <List dense disablePadding>
              {DATE_PRESETS.map((preset, idx) => (
                <Box key={preset.label}>
                  <ListItemButton
                    onClick={() => handlePreset(preset)}
                    sx={{ py: 1, px: 1.5 }}
                  >
                    <ListItemText
                      primary={preset.label}
                      primaryTypographyProps={{
                        variant: "body2",
                        color: "text.primary",
                      }}
                    />
                    {label === (() => {
                      const [s, e] = preset.getValue();
                      return s.isSame(e, "day")
                        ? s.format("DD MMM YYYY")
                        : `${s.format("DD MMM YYYY")} - ${e.format("DD MMM YYYY")}`;
                    })() && (
                      <CheckIcon sx={{ fontSize: 16, ml: 0.5, color: "text.primary" }} />
                    )}
                  </ListItemButton>
                  {idx < DATE_PRESETS.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </Box>

          <Box
            sx={{
              flex: 1,
              p: 1,
              minWidth: 200,
              maxWidth: 320,
              bgcolor: "background.paper",
            }}
          >
            <DatePicker
              month={month}
              year={year}
              onChange={handleRangeChange}
              onMonthChange={(nextMonth, nextYear) => {
                setMonth(nextMonth);
                setYear(nextYear);
              }}
              selected={selectedRange}
              allowRange
            />
          </Box>
        </Box>
      </MuiPopover>
    </AppProvider>
  );
}

function DataTable({
  title,
  columns,
  rows,
  status,
  error,
  emptyMessage,
  sortBy,
  sortDir,
  onSort,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  renderCell,
}) {
  const pagedRows = useMemo(() => {
    const startIdx = page * rowsPerPage;
    return rows.slice(startIdx, startIdx + rowsPerPage);
  }, [page, rows, rowsPerPage]);

  return (
    <Stack spacing={1}>
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, color: "text.primary" }}
      >
        {title}
      </Typography>

      <Card variant="outlined" sx={{ overflow: "hidden" }}>
        <CardContent sx={{ p: 0, position: "relative" }}>
          <TableContainer sx={{ overflow: "auto" }}>
            <Table size="small" sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "rgba(255,255,255,0.08)" }}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align={column.align || "left"}
                      sx={{ fontWeight: 600 }}
                    >
                      {column.sortable ? (
                        <TableSortLabel
                          active={sortBy === column.id}
                          direction={sortBy === column.id ? sortDir : "asc"}
                          onClick={() => onSort(column.id)}
                        >
                          {column.label}
                        </TableSortLabel>
                      ) : (
                        column.label
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRows.length > 0 ? (
                  pagedRows.map((row, index) => (
                    <TableRow key={`${row.id || row.bundle_product_id || row.child_product_sku || index}`}>
                      {columns.map((column) => (
                        <TableCell key={column.id} align={column.align || "left"}>
                          {renderCell(row, column)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} sx={{ py: 5, textAlign: "center" }}>
                      <Typography variant="body2" color="text.secondary">
                        {emptyMessage}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {status === "loading" && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(0,0,0,0.08)",
              }}
            >
              <CircularProgress size={24} />
            </Box>
          )}

          {error && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}

          <Divider />
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <TablePagination
              component="div"
              count={rows.length}
              page={page}
              onPageChange={onPageChange}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={onRowsPerPageChange}
              rowsPerPageOptions={[5, 10, 25]}
              ActionsComponent={(props) => (
                <PaginationActions {...props} disabled={status === "loading"} />
              )}
              SelectProps={{ disabled: status === "loading" }}
            />
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
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

export default function BundlesPanel({
  brandKey,
  initialStartDate,
  initialEndDate,
}) {
  const theme = useTheme();
  const today = dayjs().startOf("day");
  const [startDate, setStartDate] = useState(dayjs(initialStartDate || today).startOf("day"));
  const [endDate, setEndDate] = useState(dayjs(initialEndDate || initialStartDate || today).startOf("day"));
  const [bundleOptions, setBundleOptions] = useState([]);
  const [selectedBundleId, setSelectedBundleId] = useState("");
  const [summaryRows, setSummaryRows] = useState([]);
  const [productRows, setProductRows] = useState([]);
  const [optionsStatus, setOptionsStatus] = useState("idle");
  const [summaryStatus, setSummaryStatus] = useState("idle");
  const [productsStatus, setProductsStatus] = useState("idle");
  const [optionsError, setOptionsError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [productsError, setProductsError] = useState("");
  const [productSortBy, setProductSortBy] = useState("orders");
  const [productSortDir, setProductSortDir] = useState("desc");
  const [summarySortBy, setSummarySortBy] = useState("sort_order");
  const [summarySortDir, setSummarySortDir] = useState("asc");
  const [productPage, setProductPage] = useState(0);
  const [summaryPage, setSummaryPage] = useState(0);
  const [productRowsPerPage, setProductRowsPerPage] = useState(10);
  const [summaryRowsPerPage, setSummaryRowsPerPage] = useState(10);

  useEffect(() => {
    if (!initialStartDate || !initialEndDate) return;
    setStartDate(dayjs(initialStartDate).startOf("day"));
    setEndDate(dayjs(initialEndDate).startOf("day"));
  }, [initialStartDate, initialEndDate]);

  const start = useMemo(() => formatDate(startDate), [startDate]);
  const end = useMemo(() => formatDate(endDate), [endDate]);

  useEffect(() => {
    if (!brandKey) return;
    const controller = new AbortController();
    let active = true;

    setOptionsStatus("loading");
    setSummaryStatus("loading");
    setOptionsError("");
    setSummaryError("");

    getBundleOptions(
      { brand_key: brandKey, start, end },
      { signal: controller.signal },
    )
      .then((result) => {
        if (!active || controller.signal.aborted) return;
        if (result.error) {
          setBundleOptions([]);
          setSelectedBundleId("");
          setOptionsError("Failed to load bundle options.");
          setOptionsStatus("failed");
          return;
        }

        const nextBundles = Array.isArray(result.bundles) ? result.bundles : [];
        setBundleOptions(nextBundles);
        setOptionsError("");
        setOptionsStatus("succeeded");

        setSelectedBundleId((current) => {
          if (current && nextBundles.some((bundle) => bundle.bundle_product_id === current)) {
            return current;
          }
          return nextBundles[0]?.bundle_product_id || "";
        });
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setBundleOptions([]);
        setSelectedBundleId("");
        setOptionsError("Failed to load bundle options.");
        setOptionsStatus("failed");
      });

    getBundleSummary(
      { brand_key: brandKey, start, end },
      { signal: controller.signal },
    )
      .then((result) => {
        if (!active || controller.signal.aborted) return;
        if (result.error) {
          setSummaryRows([]);
          setSummaryError("Failed to load bundle summary.");
          setSummaryStatus("failed");
          return;
        }

        setSummaryRows(Array.isArray(result.rows) ? result.rows : []);
        setSummaryError("");
        setSummaryStatus("succeeded");
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setSummaryRows([]);
        setSummaryError("Failed to load bundle summary.");
        setSummaryStatus("failed");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [brandKey, start, end]);

  useEffect(() => {
    if (!brandKey || !selectedBundleId) {
      setProductRows([]);
      setProductsStatus("idle");
      setProductsError("");
      return;
    }

    const controller = new AbortController();
    let active = true;
    setProductsStatus("loading");
    setProductsError("");

    getBundleProducts(
      {
        brand_key: brandKey,
        start,
        end,
        bundle_product_id: selectedBundleId,
      },
      { signal: controller.signal },
    )
      .then((result) => {
        if (!active || controller.signal.aborted) return;
        if (result.error) {
          setProductRows([]);
          setProductsError("Failed to load bundle products.");
          setProductsStatus("failed");
          return;
        }

        setProductRows(Array.isArray(result.rows) ? result.rows : []);
        setProductsError("");
        setProductsStatus("succeeded");
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setProductRows([]);
        setProductsError("Failed to load bundle products.");
        setProductsStatus("failed");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [brandKey, selectedBundleId, start, end]);

  const sortedProductRows = useMemo(
    () => sortRows(productRows, productSortBy, productSortDir),
    [productRows, productSortBy, productSortDir],
  );
  const sortedSummaryRows = useMemo(
    () => sortRows(summaryRows, summarySortBy, summarySortDir),
    [summaryRows, summarySortBy, summarySortDir],
  );

  const selectedBundle = useMemo(
    () => bundleOptions.find((bundle) => bundle.bundle_product_id === selectedBundleId) || null,
    [bundleOptions, selectedBundleId],
  );

  const productColumns = useMemo(
    () => [
      { id: "child_product_title", label: "Product Name", sortable: true },
      { id: "orders", label: "Orders", sortable: true, align: "right" },
      { id: "sales", label: "Sales", sortable: true, align: "right" },
    ],
    [],
  );
  const summaryColumns = useMemo(
    () => [
      { id: "bundle_name", label: "Bundle Name", sortable: true },
      { id: "orders", label: "Orders", sortable: true, align: "right" },
      { id: "sales", label: "Sales", sortable: true, align: "right" },
    ],
    [],
  );

  const handleSort = useCallback((scope, columnId) => {
    if (scope === "products") {
      setProductSortBy((current) => {
        if (current === columnId) {
          setProductSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
          return current;
        }
        setProductSortDir("asc");
        return columnId;
      });
      setProductPage(0);
      return;
    }

    setSummarySortBy((current) => {
      if (current === columnId) {
        setSummarySortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        return current;
      }
      setSummarySortDir("asc");
      return columnId;
    });
    setSummaryPage(0);
  }, []);

  const productEmptyMessage = selectedBundleId
    ? "No products found for the selected bundle and date range."
    : "Select a bundle to view its product breakdown.";

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
          gap: 1.5,
        }}
      >

        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexDirection: { xs: "column", sm: "row" },
            width: { xs: "100%", md: "auto" },
          }}
        >
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 260 } }}>
            <Select
              displayEmpty
              value={selectedBundleId}
              onChange={(event) => {
                setSelectedBundleId(event.target.value);
                setProductPage(0);
              }}
              disabled={optionsStatus === "loading" || bundleOptions.length === 0}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="" disabled>
                {bundleOptions.length ? "Select bundle" : "No bundles available"}
              </MenuItem>
              {bundleOptions.map((bundle) => (
                <MenuItem key={bundle.bundle_product_id} value={bundle.bundle_product_id}>
                  {bundle.bundle_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onApply={(nextStart, nextEnd) => {
              setStartDate(nextStart);
              setEndDate(nextEnd);
              setProductPage(0);
              setSummaryPage(0);
            }}
          />
        </Box>
      </Box>

      {optionsError && <Alert severity="error">{optionsError}</Alert>}

      <DataTable
        title={selectedBundle ? `${selectedBundle.bundle_name} Products` : "Bundle Products"}
        columns={productColumns}
        rows={sortedProductRows}
        status={productsStatus}
        error={productsError}
        emptyMessage={productEmptyMessage}
        sortBy={productSortBy}
        sortDir={productSortDir}
        onSort={(columnId) => handleSort("products", columnId)}
        page={productPage}
        rowsPerPage={productRowsPerPage}
        onPageChange={(_event, nextPage) => setProductPage(nextPage)}
        onRowsPerPageChange={(event) => {
          setProductRowsPerPage(parseInt(event.target.value, 10));
          setProductPage(0);
        }}
        renderCell={(row, column) => {
          if (column.id === "orders") return formatInteger(row.orders);
          if (column.id === "sales") return formatCurrency(row.sales);
          return row.child_product_title || "-";
        }}
      />

      <DataTable
        title="Overall Snapshot"
        columns={summaryColumns}
        rows={sortedSummaryRows}
        status={summaryStatus}
        error={summaryError}
        emptyMessage="No bundle activity found for the selected date range."
        sortBy={summarySortBy}
        sortDir={summarySortDir}
        onSort={(columnId) => handleSort("summary", columnId)}
        page={summaryPage}
        rowsPerPage={summaryRowsPerPage}
        onPageChange={(_event, nextPage) => setSummaryPage(nextPage)}
        onRowsPerPageChange={(event) => {
          setSummaryRowsPerPage(parseInt(event.target.value, 10));
          setSummaryPage(0);
        }}
        renderCell={(row, column) => {
          if (column.id === "orders") return formatInteger(row.orders);
          if (column.id === "sales") return formatCurrency(row.sales);
          return row.bundle_name || "-";
        }}
      />
    </Stack>
  );
}
