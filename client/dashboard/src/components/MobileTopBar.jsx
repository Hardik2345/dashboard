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
} from '@mui/material';
import CheckIcon from "@mui/icons-material/Check";
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
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
  salesChannel = '',
  showSalesChannel = true,
  onSalesChannelChange,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [start, end] = value || [];
  const [popoverActive, setPopoverActive] = useState(false);
  const [month, setMonth] = useState((end || start || dayjs()).month());
  const [year, setYear] = useState((end || start || dayjs()).year());
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
      onChange([presetStart, presetEnd], preset.compareMode || null);
    },
    [onChange, start, end]
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
    [onChange, compareMode]
  );

  const activeUtmCount = [utm?.source, utm?.medium, utm?.campaign].filter(Boolean).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 0.75 }}>
      {/* Mobile: Product filter on its own row (authors only) */}
      {/* Mobile: Product filter removed (moved to global drawer) */}



      {/* Main row: Updated chip | (desktop: product filter) | Date picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
        {/* Left: Updated chip and Date Label */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                    fontSize: 11.1,
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
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, ml: 0.5 }}>
            Brand: <b>{brandKey}</b>
          </Typography>
        </Box>

        {/* Right: Product filter (desktop only) + Date picker */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>


            {/* Desktop UTM Filters (Collapsible) */}
            {showUtmFilter && (
              <>
                <Collapse in={showUtmFilters} orientation="horizontal" unmountOnExit>
                  <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1, alignItems: 'center' }}>
                    {showSalesChannel && (
                      <SearchableSelect
                        label="Sales Channel"
                        options={utmOptions?.sales_channel || []}
                        value={salesChannel}
                        onChange={onSalesChannelChange}
                        sx={{ width: 140 }}
                        labelSx={{
                          fontSize: 12,
                          transform: 'translate(14px, 8px) scale(1)',
                          '&.MuiInputLabel-shrink': { transform: 'translate(14px, -9px) scale(0.75)' }
                        }}
                        selectSx={{
                          fontSize: 12,
                          height: 32,
                          '& .MuiSelect-select': { py: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
                        }}
                      />
                    )}
                    {activeUtmCount > 0 && (
                      <Button
                        size="small"
                        onClick={() => onUtmChange && onUtmChange({ source: '', medium: '', campaign: '' })}
                        sx={{
                          fontSize: 12,
                          textTransform: 'none',
                          minWidth: 'auto',
                          whiteSpace: 'nowrap',
                          color: 'text.secondary',
                          '&:hover': { color: 'error.main', bgcolor: 'transparent' }
                        }}
                      >
                        Clear all
                      </Button>
                    )}
                    {['source', 'medium', 'campaign'].map(field => (
                      <SearchableSelect
                        key={field}
                        label={field.charAt(0).toUpperCase() + field.slice(1)}
                        multiple
                        options={utmOptions?.[`utm_${field}`] || []}
                        value={utm?.[field] || []}
                        onChange={(newVal) => {
                          onUtmChange && onUtmChange({ [field]: newVal });
                        }}
                        sx={{ width: 140 }}
                        labelSx={{
                          fontSize: 12,
                          textTransform: 'capitalize',
                          transform: 'translate(14px, 8px) scale(1)',
                          '&.MuiInputLabel-shrink': {
                            transform: 'translate(14px, -9px) scale(0.75)'
                          }
                        }}
                        selectSx={{
                          fontSize: 12,
                          height: 32,
                          '& .MuiSelect-select': {
                            py: 0.5,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }
                        }}
                      />
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
              <Box sx={{ position: 'relative', width: { xs: '100%', sm: 200 }, display: { xs: 'none', sm: 'flex' } }}>
                <SearchableSelect
                  label="Product"
                  options={productOptions}
                  value={Array.isArray(productValue) ? (productValue[0]?.id || '') : (productValue?.id || '')}
                  onChange={(newId) => {
                    const selected = productOptions.find(p => p.id === newId) || { id: newId, label: newId, detail: '' };
                    if (onProductChange) onProductChange(selected);
                  }}
                  valueKey="id"
                  labelKey="label"
                  multiple={false}
                  sx={{ width: '100%' }}
                  labelSx={{
                    fontSize: 12,
                    transform: 'translate(14px, 8px) scale(1)',
                    '&.MuiInputLabel-shrink': {
                      transform: 'translate(14px, -9px) scale(0.75)'
                    }
                  }}
                  selectSx={{
                    fontSize: 12,
                    height: 32,
                    '& .MuiSelect-select': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxHeight: 32,
                      display: 'flex',
                      alignItems: 'center'
                    }
                  }}
                />
                {productLoading && (
                  <CircularProgress size={14} sx={{ position: 'absolute', top: 9, right: 28, pointerEvents: 'none' }} />
                )}
              </Box>
            )}


            {/* Mobile Filter Toggle Icon */}
            {/* Mobile Filter Toggle Icon REMOVED */}


            {/* Date Label (Visible next to icon) */}
            <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 600, mr: 1, display: 'block', color: 'text.secondary' }}>
              {dateLabel}
            </Typography>

            <Popover
              active={popoverActive}
              activator={
                <IconButton
                  onClick={togglePopover}
                  sx={{
                    width: 32,
                    height: 32,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '50%',
                    color: popoverActive ? 'primary.main' : 'text.secondary',
                    bgcolor: popoverActive ? (isDark ? 'rgba(91, 163, 224, 0.1)' : 'rgba(11, 107, 203, 0.05)') : 'transparent',
                  }}
                >
                  <CalendarMonthIcon fontSize="small" />
                </IconButton>
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
                                ? (isDark ? 'action.selecte' : 'grey.100')
                                : 'transparent',
                              '&:hover': {
                                bgcolor: isDark ? 'black' : 'grey.100',
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

            {/* Mobile Drawer for UTM Filters Removed (Moved to global MobileFilterDrawer) */}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, mr: 0.5, textAlign: 'right' }}>
            Scope: <b>{productValue?.label || 'All products'}</b>
          </Typography>
        </Box>

      </Box>

      {/* Active Filters Chips (Scrolling Marquee) */}
    </Box>
  );
}
