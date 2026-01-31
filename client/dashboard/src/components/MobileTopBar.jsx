import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  Checkbox,
  Grow, // New Import
  Popover, // Imported from MUI now
} from '@mui/material';
import CheckIcon from "@mui/icons-material/Check";
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { DatePicker } from "@shopify/polaris";
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
  utmOptions = null, // Prop
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

  const anchorRef = useRef(null); // Ref for the hidden anchor
  const skipNextToggle = useRef(false);
  // animationOpen state not strictly needed for MUI Popover internal transition, but keeping logic consistent

  const togglePopover = useCallback(() => {
    if (skipNextToggle.current) {
      skipNextToggle.current = false;
      return;
    }
    setPopoverActive((p) => !p);
  }, []);

  const handleClose = useCallback(() => {
    setPopoverActive(false);
    skipNextToggle.current = true;
    setTimeout(() => {
      skipNextToggle.current = false;
    }, 300);
  }, []);
  const handleMonthChange = useCallback((m, y) => {
    setMonth(m);
    setYear(y);
  }, []);

  // Prevent body scroll when the date picker popover is open (especially on mobile)
  useEffect(() => {
    if (!popoverActive) return undefined;

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
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

  const activeUtmCount = [utm?.source, utm?.medium, utm?.campaign].filter(Boolean).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
      {/* Mobile: Product filter on its own row (authors only) */}
      {/* Mobile: Product filter removed (moved to global drawer) */}



      {/* Main row: Updated chip | (desktop: product filter) | Date picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
        {/* Left: Updated chip and Date Label */}
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
                fontSize: 12,
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
                  fontSize: 10.9,
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

        {/* Right: Product filter (desktop only) + Date picker */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>


          {/* Desktop UTM Filters (Collapsible) */}
          {showUtmFilter && (
            <>
              <Collapse in={showUtmFilters} orientation="horizontal" unmountOnExit>
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1, alignItems: 'center' }}>
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
                    <FormControl key={field} size="small" sx={{ width: 140 }}>
                      <InputLabel sx={{ fontSize: 12, textTransform: 'capitalize' }}>{field}</InputLabel>
                      <Select
                        label={field}
                        multiple
                        value={Array.isArray(utm?.[field]) ? utm?.[field] : (utm?.[field] ? [utm?.[field]] : [])}
                        onChange={(e, child) => {
                          const allOptions = utmOptions?.[`utm_${field}`] || [];
                          const currentVal = Array.isArray(utm?.[field]) ? utm?.[field] : (utm?.[field] ? [utm?.[field]] : []);

                          if (child.props.value === '__ALL__') {
                            if (currentVal.length === allOptions.length) {
                              onUtmChange && onUtmChange({ [field]: [] });
                            } else {
                              onUtmChange && onUtmChange({ [field]: allOptions });
                            }
                            return;
                          }

                          const val = e.target.value.filter(v => v !== '__ALL__');
                          const newVal = typeof val === 'string' ? val.split(',') : val;
                          onUtmChange && onUtmChange({ [field]: newVal });
                        }}
                        renderValue={(selected) => {
                          if (selected.length === 0) return <em>All</em>;
                          return selected.join(', ');
                        }}
                        sx={{
                          fontSize: 12,
                          height: 32,
                          '& .MuiSelect-select': {
                            py: 0.5,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              maxHeight: '40vh',
                              width: 250,
                            }
                          },
                          anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                          transformOrigin: { vertical: 'top', horizontal: 'left' }
                        }}
                      >
                        <MenuItem value="__ALL__" sx={{ fontSize: 12, py: 0, fontWeight: 500 }}>
                          <Checkbox
                            checked={(utmOptions?.[`utm_${field}`] || []).length > 0 && (utm?.[field]?.length === (utmOptions?.[`utm_${field}`] || []).length)}
                            indeterminate={(utm?.[field]?.length > 0) && (utm?.[field]?.length < (utmOptions?.[`utm_${field}`] || []).length)}
                            size="small"
                            sx={{ p: 0.5, mr: 1 }}
                          />
                          <ListItemText primary="All" primaryTypographyProps={{ fontSize: 12, fontWeight: 600 }} />
                        </MenuItem>
                        {(utmOptions?.[`utm_${field}`] || []).map(opt => (
                          <MenuItem key={opt} value={opt} sx={{ fontSize: 12, py: 0 }}>
                            <Checkbox
                              checked={(Array.isArray(utm?.[field]) ? utm?.[field] : (utm?.[field] ? [utm?.[field]] : [])).indexOf(opt) > -1}
                              size="small"
                              sx={{ p: 0.5, mr: 1 }}
                            />
                            <ListItemText primary={opt} primaryTypographyProps={{ fontSize: 12 }} />
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
          {/* Mobile Filter Toggle Icon REMOVED */}


          {/* Date Label (Visible next to icon) */}
          <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 600, mr: 1, display: 'block', color: 'text.secondary' }}>
            {dateLabel}
          </Typography>

          <Box sx={{ position: 'relative' }}>
            <IconButton
              onClick={togglePopover}
              sx={{
                width: 32,
                height: 32,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '50%',
                color: popoverActive ? 'primary.main' : 'text.secondary',
                bgcolor: popoverActive ? (isDark ? 'rgba(23, 24, 25, 0.1)' : 'rgba(11, 107, 203, 0.05)') : 'transparent',
              }}
            >
              <CalendarMonthIcon fontSize="small" />
            </IconButton>

            <Box
              ref={anchorRef}
              sx={{ position: 'absolute', top: 45, left: 0, width: 32, height: 1, visibility: 'hidden', pointerEvents: 'none' }}
            />

            <Popover
              disableScrollLock
              open={popoverActive}
              anchorEl={anchorRef.current}
              onClose={handleClose}
              TransitionComponent={Grow}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                sx: {
                  borderRadius: 1,
                  bgcolor: "background.paper", // Match user preference
                  backgroundImage: 'none',
                  boxShadow: theme.shadows[8],
                  overflow: 'hidden',
                  mt: 1, // Slight offset if needed, but the anchor is already pushed down
                }
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
                    minWidth: 200,
                    maxWidth: 320,
                    bgcolor: "background.paper",
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
          </Box>

          {/* Mobile Drawer for UTM Filters */}

          {/* Mobile Drawer for UTM Filters Removed (Moved to global MobileFilterDrawer) */}
        </Box>

      </Box>

      {/* Row 2: Brand + Scope */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>
          Brand: {brandKey}
        </Typography>

        <Typography
          sx={{
            fontSize: 13,
            color: 'primary.main',
            fontWeight: 500
          }}
        >
          Scope: {productValue?.id ? productValue.label : 'All products'}
        </Typography>
      </Box>

      {/* Active Filters Chips (Scrolling Marquee) */}
    </Box>
  );
}