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
} from '@mui/material';
import CheckIcon from "@mui/icons-material/Check";
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Popover, DatePicker } from "@shopify/polaris";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { getLastUpdatedPTS, getDashboardSummary } from "../lib/api.js";

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
      dayjs().subtract(6, "day").startOf("day"),
      dayjs().startOf("day"),
    ],
    group: 2,
  },
  {
    label: "Last 30 days",
    getValue: () => [
      dayjs().subtract(29, "day").startOf("day"),
      dayjs().startOf("day"),
    ],
    group: 2,
  },
  // Month ranges
  {
    label: "Last month",
    getValue: () => {
      const start = dayjs().subtract(1, 'month').startOf('month').startOf('day');
      const end = dayjs().subtract(1, 'month').endOf('month').startOf('day');
      return [start, end];
    },
    group: 2,
  },
  {
    label: "Month-to-date",
    getValue: () => {
      const start = dayjs().startOf('month').startOf('day');
      const end = dayjs().startOf('day');
      return [start, end];
    },
    group: 2,
  },
  {
    label: "Last 90 days",
    getValue: () => [
      dayjs().subtract(89, "day").startOf("day"),
      dayjs().startOf("day"),
    ],
    group: 2,
  },
];

export default function MobileTopBar({
  value,
  onChange,
  brandKey,
  showProductFilter = true,
  productOptions = [],
  productValue = null,
  onProductChange,
  productLoading = false,
  utm = {},
  onUtmChange,
  showUtmFilter = true,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [start, end] = value || [];
  const [popoverActive, setPopoverActive] = useState(false);
  const [month, setMonth] = useState((end || start || dayjs()).month());
  const [year, setYear] = useState((end || start || dayjs()).year());
  const [last, setLast] = useState({ loading: true, ts: null, tz: null });
  const [utmOptions, setUtmOptions] = useState(null);
  const [showUtmFilters, setShowUtmFilters] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [activeFilterView, setActiveFilterView] = useState(null); // 'source', 'medium', 'campaign', or null (main list)
  const [pendingUtm, setPendingUtm] = useState({});

  useEffect(() => {
    if (mobileFilterOpen) {
      setPendingUtm(utm || {});
    }
  }, [mobileFilterOpen, utm]);
  useEffect(() => {
    if (!brandKey) return;
    const s = start?.format('YYYY-MM-DD');
    const e = end?.format('YYYY-MM-DD');
    getDashboardSummary({
      brand_key: brandKey,
      start: s,
      end: e,
      include_utm_options: true,
      utm_source: utm?.source, // We use global utm here as this fetches options
      utm_medium: utm?.medium,
      utm_campaign: utm?.campaign
    })
      .then(res => {
        if (res.filter_options) setUtmOptions(res.filter_options);
      });
  }, [brandKey, start, end, utm]);

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

  const togglePopover = useCallback(() => setPopoverActive((p) => !p), []);
  const handleClose = useCallback(() => setPopoverActive(false), []);
  const handleMonthChange = useCallback((m, y) => {
    setMonth(m);
    setYear(y);
  }, []);

  // Prevent body scroll when the date picker popover is open (especially on mobile)
  useEffect(() => {
    if (!popoverActive) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [popoverActive]);

  const handlePresetSelect = useCallback(
    (preset) => {
      const [presetStart, presetEnd] = preset.getValue();
      setMonth(presetEnd.month());
      setYear(presetEnd.year());
      onChange([presetStart, presetEnd]);
    },
    [onChange]
  );

  // Check which preset is currently active
  const activePreset = useMemo(() => {
    if (!start || !end) return null;
    return (
      DATE_PRESETS.find((preset) => {
        const [presetStart, presetEnd] = preset.getValue();
        return start.isSame(presetStart, "day") && end.isSame(presetEnd, "day");
      })?.label || null
    );
  }, [start, end]);

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
        onChange([e, s]);
        return;
      }
      if (s && !e) {
        onChange([s, s]);
        return;
      }
      onChange([s, e ?? s ?? null]);
    },
    [onChange]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 0.75 }}>
      {/* Mobile: Product filter on its own row (authors only) */}
      {showProductFilter && (
        <Box sx={{ display: { xs: 'block', sm: 'none' }, width: '100%', mb: { xs: 1.5, sm: 0 } }}>
          <FormControl size="small" fullWidth>
            <InputLabel id="mobile-product-label" sx={{ fontSize: 12 }}>Product</InputLabel>
            <Select
              labelId="mobile-product-label"
              label="Product"
              value={productValue?.id ?? ''}
              onChange={(e) => {
                const selected = (productOptions || []).find((opt) => opt.id === e.target.value);
                if (onProductChange) onProductChange(selected || { id: '', label: 'All products', detail: 'Whole store' });
              }}
              disabled={productLoading || !productOptions?.length}
              sx={{ fontSize: 12, height: 36 }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    maxHeight: '60vh',
                    width: 'var(--select-width)',
                    whiteSpace: 'normal',
                  }
                },
                // This ensures the menu matches the select width
                anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                transformOrigin: { vertical: 'top', horizontal: 'left' },
                onEntering: (node) => {
                  const selectNode = node.parentElement?.querySelector('[role="combobox"]');
                  if (selectNode) {
                    node.style.width = `${selectNode.clientWidth}px`;
                  }
                }
              }}
            >
              {(productOptions || []).map((opt) => (
                <MenuItem
                  key={opt.id || 'all'}
                  value={opt.id || ''}
                  sx={{ fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word', py: 0.75 }}
                >
                  {opt.id ? opt.label : 'All products'}
                </MenuItem>
              ))}
            </Select>
            {productLoading && (
              <CircularProgress size={14} sx={{ position: 'absolute', top: 11, right: 28 }} />
            )}
          </FormControl>
        </Box>
      )}



      {/* Main row: Updated chip | (desktop: product filter) | Date picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
        {/* Left: Updated chip */}
        {last.loading ? (
          <Card
            elevation={0}
            sx={{
              px: 0.75,
              height: 32,
              display: "flex",
              alignItems: "center",
              bgcolor: "background.paper",
              fontSize: 13,
            }}
          >
            Updating…
          </Card>
        ) : last.ts ? (
          <Tooltip
            title={`${last.ts.format("YYYY-MM-DD HH:mm:ss")}${last.tz ? ` ${last.tz}` : ""
              }`}
            arrow
          >
            <Card
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                px: 0.75,
                height: 32,
                display: "flex",
                alignItems: "center",
                fontSize: 13,
              }}
            >
              Updated {last.ts.fromNow()}
            </Card>
          </Tooltip>
        ) : (
          <Card
            elevation={0}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              px: 0.75,
              height: 32,
              display: "flex",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            Updated: unavailable
          </Card>
        )}

        {/* Right: Product filter (desktop only) + Date picker */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>


          {/* Desktop UTM Filters (Collapsible) */}
          {showUtmFilter && (
            <>
              <Collapse in={showUtmFilters} orientation="horizontal" unmountOnExit>
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
                  {['source', 'medium', 'campaign'].map(field => (
                    <FormControl key={field} size="small" sx={{ width: 110 }}>
                      <InputLabel sx={{ fontSize: 12, textTransform: 'capitalize' }}>{field}</InputLabel>
                      <Select
                        label={field}
                        value={utm?.[field] || ''}
                        onChange={(e) => onUtmChange && onUtmChange({ [field]: e.target.value })}
                        sx={{
                          fontSize: 12,
                          height: 32,
                          '& .MuiSelect-select': {
                            py: 0.5,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }
                        }} // dense + truncation
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              maxHeight: '40vh',
                              width: '9vw',
                            }
                          },
                          anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                          transformOrigin: { vertical: 'top', horizontal: 'left' },
                          onEntering: (node) => {
                            const selectNode = node.parentElement?.querySelector('[role="combobox"]');
                            if (selectNode) {
                              node.style.width = `${selectNode.clientWidth}px`;
                            }
                          }
                        }}
                      >
                        <MenuItem value=""><em>All</em></MenuItem>
                        {(utmOptions?.[`utm_${field}`] || []).map(opt => (
                          <MenuItem
                            key={opt}
                            value={opt}
                            sx={{
                              fontSize: 12,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'block'
                            }}
                          >
                            {opt}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ))}
                </Box>
              </Collapse>

              {/* Filter Toggle Icon */}
              <IconButton
                onClick={() => setShowUtmFilters(!showUtmFilters)}
                sx={{
                  width: 32,
                  height: 32,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '50%', // Circular
                  display: { xs: 'none', sm: 'flex' },
                  color: showUtmFilters ? 'primary.main' : 'text.secondary',
                  bgcolor: showUtmFilters ? (isDark ? 'rgba(91, 163, 224, 0.1)' : 'rgba(11, 107, 203, 0.05)') : 'transparent',
                }}
              >
                <FilterListIcon fontSize="small" />
              </IconButton>
            </>
          )}

          {/* Desktop-only compact product filter */}
          {showProductFilter && (
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 200 }, display: { xs: 'none', sm: 'flex' } }}>
              <InputLabel id="desktop-product-label" sx={{ fontSize: 12 }}>Product</InputLabel>
              <Select
                labelId="desktop-product-label"
                label="Product"
                value={productValue?.id ?? ''}
                onChange={(e) => {
                  const selected = (productOptions || []).find((opt) => opt.id === e.target.value);
                  if (onProductChange) onProductChange(selected || { id: '', label: 'All products', detail: 'Whole store' });
                }}
                disabled={productLoading || !productOptions?.length}
                sx={{
                  fontSize: 12,
                  height: 32,
                  width: '100%',
                  // Ensure the selected value area ellipses long labels instead of expanding the control
                  '& .MuiSelect-select': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      maxHeight: '60vh',
                      width: 'var(--select-width)',
                      whiteSpace: 'normal',
                    }
                  },
                  anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                  transformOrigin: { vertical: 'top', horizontal: 'left' },
                  onEntering: (node) => {
                    const selectNode = node.parentElement?.querySelector('[role="combobox"]');
                    if (selectNode) {
                      node.style.width = `${selectNode.clientWidth}px`;
                    }
                  }
                }}
              >
                {(productOptions || []).map((opt) => (
                  <MenuItem key={opt.id || 'all'} value={opt.id || ''} sx={{ fontSize: 12, whiteSpace: 'normal', wordBreak: 'break-word', py: 0.5 }}>
                    {opt.id ? opt.label : 'All products'}
                  </MenuItem>
                ))}
              </Select>
              {productLoading && (
                <CircularProgress size={14} sx={{ position: 'absolute', top: 9, right: 28 }} />
              )}
            </FormControl>
          )}


          {/* Mobile Filter Toggle Icon */}
          {showUtmFilter && (
            <IconButton
              onClick={() => setMobileFilterOpen(true)}
              sx={{
                width: 32,
                height: 32,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '50%',
                display: { xs: 'flex', sm: 'none' },
                color: mobileFilterOpen ? 'primary.main' : 'text.secondary',
                bgcolor: mobileFilterOpen ? (isDark ? 'rgba(91, 163, 224, 0.1)' : 'rgba(11, 107, 203, 0.05)') : 'transparent',
              }}
            >
              <FilterListIcon fontSize="small" />
            </IconButton>
          )}

          <Popover
            active={popoverActive}
            activator={
              <Card
                elevation={0}
                onClick={togglePopover}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePopover();
                  }
                }}
                sx={{
                  px: 1,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  minWidth: { xs: 120, sm: 140 },
                  textAlign: "center",
                  userSelect: "none",
                  fontSize: 13,
                  "&:hover": { filter: "brightness(0.98)" },
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {dateLabel}
                </span>
              </Card>
            }
            onClose={handleClose}
            fullWidth={false}
            preferInputActivator={false}
            preferredAlignment="right"
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                maxHeight: "80vh",
                overflowX: "hidden",
                overflowY: "auto",
                borderRadius: 1,
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
                  borderColor: "divider",
                  bgcolor: "background.paper",
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
                              ? (isDark ? 'action.selected' : 'grey.100')
                              : 'transparent',
                            '&:hover': {
                              bgcolor: isDark ? 'action.hover' : 'grey.100',
                            },
                            '&.Mui-selected': {
                              bgcolor: isDark ? 'action.selected' : 'grey.200',
                              '&:hover': {
                                bgcolor: isDark ? 'action.selected' : 'grey.200',
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
                              sx={{ fontSize: 14, color: "text.primary", ml: 0.5 }}
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
                  borderColor: "divider",
                  bgcolor: "background.paper",
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
                              ? (isDark ? 'action.selected' : 'grey.100')
                              : 'transparent',
                            '&:hover': {
                              bgcolor: isDark ? 'action.hover' : 'grey.100',
                            },
                            '&.Mui-selected': {
                              bgcolor: isDark ? 'action.selected' : 'grey.200',
                              '&:hover': {
                                bgcolor: isDark ? 'action.selected' : 'grey.200',
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
                              sx={{ fontSize: 18, color: "text.primary", ml: 1 }}
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
                  bgcolor: "background.paper",
                  minWidth: 200,
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

          {/* Mobile Drawer for UTM Filters */}

          <Drawer
            anchor="bottom"
            open={mobileFilterOpen}
            onClose={() => setMobileFilterOpen(false)}
            PaperProps={{
              sx: {
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                height: '50vh', // Fixed height for consistency
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column'
              }
            }}
          >
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {activeFilterView ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton onClick={() => setActiveFilterView(null)} size="small" edge="start">
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="h6" fontSize={16} fontWeight={600} sx={{ textTransform: 'capitalize' }}>
                    {activeFilterView}
                  </Typography>
                </Box>
              ) : (
                <Typography variant="h6" fontSize={16} fontWeight={600}>Filters</Typography>
              )}
              <IconButton onClick={() => setMobileFilterOpen(false)} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            {/* Content */}
            <Box sx={{ p: 0, overflowY: 'auto', flex: 1 }}>
              {activeFilterView ? (
                // Detail View (Options)
                <List disablePadding>
                  <ListItemButton
                    onClick={() => {
                      setPendingUtm({ ...pendingUtm, [activeFilterView]: '' });
                      setActiveFilterView(null);
                    }}
                    selected={!pendingUtm?.[activeFilterView]}
                  >
                    <ListItemText primary="All" primaryTypographyProps={{ fontSize: 14 }} />
                    {!pendingUtm?.[activeFilterView] && <CheckIcon fontSize="small" color="primary" />}
                  </ListItemButton>
                  {(utmOptions?.[`utm_${activeFilterView}`] || []).map(opt => (
                    <ListItemButton
                      key={opt}
                      onClick={() => {
                        setPendingUtm({ ...pendingUtm, [activeFilterView]: opt });
                        setActiveFilterView(null);
                      }}
                      selected={pendingUtm?.[activeFilterView] === opt}
                    >
                      <ListItemText
                        primary={opt}
                        primaryTypographyProps={{
                          fontSize: 14,
                          noWrap: true,
                          title: opt // Tooltip on hover (desktop) or long press 
                        }}
                      />
                      {pendingUtm?.[activeFilterView] === opt && <CheckIcon fontSize="small" color="primary" />}
                    </ListItemButton>
                  ))}
                </List>
              ) : (
                // Main List (Categories)
                <List disablePadding>
                  {['source', 'medium', 'campaign'].map(field => (
                    <ListItemButton
                      key={field}
                      onClick={() => setActiveFilterView(field)}
                      sx={{ py: 2, justifyContent: 'space-between' }}
                    >
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize', fontSize: 12 }}>
                          {field}
                        </Typography>
                        <Typography variant="body1" fontSize={14} fontWeight={500} noWrap sx={{ maxWidth: 260 }}>
                          {pendingUtm?.[field] || 'All'}
                        </Typography>
                      </Box>
                      <ChevronRightIcon fontSize="small" color="action" />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>

            {/* Footer (Main View Only) */}
            {!activeFilterView && (
              <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 2 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  color="error"
                  disabled={!pendingUtm?.source && !pendingUtm?.medium && !pendingUtm?.campaign}
                  onClick={() => setPendingUtm({ ...pendingUtm, source: '', medium: '', campaign: '' })}
                  startIcon={<DeleteIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  Clear
                </Button>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => {
                    onUtmChange && onUtmChange(pendingUtm);
                    setMobileFilterOpen(false);
                  }}
                  sx={{ textTransform: 'none' }}
                >
                  Apply
                </Button>
              </Box>
            )}
          </Drawer>
        </Box>
      </Box>
    </Box>
  );
}
