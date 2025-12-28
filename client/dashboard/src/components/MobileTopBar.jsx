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
} from '@mui/material';
import CheckIcon from "@mui/icons-material/Check";
import { Popover, DatePicker } from "@shopify/polaris";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { getLastUpdatedPTS } from "../lib/api.js";

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
  productOptions = [],
  productValue = null,
  onProductChange,
  productLoading = false,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [start, end] = value || [];
  const [popoverActive, setPopoverActive] = useState(false);
  const [month, setMonth] = useState((end || start || dayjs()).month());
  const [year, setYear] = useState((end || start || dayjs()).year());
  const [last, setLast] = useState({ loading: true, ts: null, tz: null });

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
    console.log("Updating month/year:", month, year);
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
      {/* Mobile: Product filter on its own row */}
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
                  width: { xs: '100%', sm: 360 },
                  whiteSpace: 'normal',
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
          {/* Desktop-only compact product filter */}
          <FormControl size="small" sx={{ width: { xs: '100%', sm: 420 }, display: { xs: 'none', sm: 'flex' } }}>
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
                    width: { xs: '100%', sm: 420 },
                    whiteSpace: 'normal',
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
        </Box>
      </Box>
    </Box>
  );
}