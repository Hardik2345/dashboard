import { useEffect, useMemo, useState, useCallback, useRef, memo } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Card,
  CardContent,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  TablePagination,
  Button,
  CircularProgress,
  Alert,
  List,
  ListItemButton,
  ListItemText,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Chip,
  Popover as MuiPopover,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';

import { Popover, DatePicker } from '@shopify/polaris';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { useAppDispatch, useAppSelector } from '../state/hooks.js';
import { fetchProductConversion, setDateRange, setPage, setPageSize, setSort, setCompareMode, setCompareDateRange, addFilter, removeFilter, clearFilters, setSearch } from '../state/slices/productConversionSlice.js';
import { exportProductConversionCsv } from '../lib/api.js';
import { useTheme } from '@mui/material/styles';
import { validateFilter } from '../lib/filterValidation.js';

const DATE_PRESETS = [
  { label: 'Today', getValue: () => [dayjs().startOf('day'), dayjs().startOf('day')], group: 1 },
  { label: 'Yesterday', getValue: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').startOf('day')], group: 1 },
  { label: 'Last 7 days', getValue: () => [dayjs().subtract(6, 'day').startOf('day'), dayjs().startOf('day')], group: 2 },
  { label: 'Last 30 days', getValue: () => [dayjs().subtract(29, 'day').startOf('day'), dayjs().startOf('day')], group: 2 },
  { label: 'Last 90 days', getValue: () => [dayjs().subtract(89, 'day').startOf('day'), dayjs().startOf('day')], group: 2 },
];

function formatNumber(val) {
  return Number(val || 0).toLocaleString();
}

function formatPercent(val) {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return '0%';
  return `${num.toFixed(2)}%`;
}

function PaginationActions({ count, page, rowsPerPage, onPageChange, disabled }) {
  const handleBack = (event) => {
    onPageChange(event, page - 1);
  };
  const handleNext = (event) => {
    onPageChange(event, page + 1);
  };
  const lastPage = Math.max(0, Math.ceil(count / rowsPerPage) - 1);
  return (
    <Box sx={{ flexShrink: 0, ml: 2.5, display: 'flex', alignItems: 'center' }}>
      <Button
        onClick={handleBack}
        disabled={disabled || page <= 0}
        sx={{ minWidth: 0, px: 1 }}
      >
        <KeyboardArrowLeft />
      </Button>
      <Button
        onClick={handleNext}
        disabled={disabled || page >= lastPage}
        sx={{ minWidth: 0, px: 1 }}
      >
        <KeyboardArrowRight />
      </Button>
    </Box>
  );
}

// --- Reusable Date Picker Component ---
function DateRangePicker({
  startDate,
  endDate,
  onApply,
  label = 'Select dates',
  activePresetLabel,
  presets = DATE_PRESETS,
  bgColor = 'background.paper',
  textColor = 'text.primary',
  variant = 'default',
  disabled = false,
  singleDate = false,

  disableDatesAfter,
  sx = {},
}) {
  const [active, setActive] = useState(false);
  const [month, setMonth] = useState(dayjs().month());
  const [year, setYear] = useState(dayjs().year());
  const [internalStart, setInternalStart] = useState(null);
  const [internalEnd, setInternalEnd] = useState(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const toggle = useCallback(() => {
    if (disabled) return;
    setActive(prev => {
      if (!prev) {
        const s = startDate ? dayjs(startDate) : dayjs();
        const e = endDate ? dayjs(endDate) : s;
        setInternalStart(s);
        setInternalEnd(e);
        setMonth(e.month());
        setYear(e.year());
      }
      return !prev;
    });
  }, [startDate, endDate, disabled]);

  const handleClose = useCallback(() => setActive(false), []);
  const handleMonthChange = useCallback((m, y) => { setMonth(m); setYear(y); }, []);

  const handleRangeChange = useCallback(({ start: sRaw, end: eRaw }) => {
    const s = sRaw ? dayjs(sRaw).startOf('day') : null;
    const e = eRaw ? dayjs(eRaw).startOf('day') : null;
    const focus = e || s;
    if (focus) { setMonth(focus.month()); setYear(focus.year()); }
    setInternalStart(s);
    setInternalEnd(e);

    if (singleDate) {
      if (s) {
        onApply(s, s);
        setActive(false);
      }
      return;
    }

    if (s && e && s.isAfter(e)) {
      onApply(e, s); setInternalStart(e); setInternalEnd(s);
      return;
    }
    if (s && !e) { onApply(s, s); return; }
    if (s && e) { onApply(s, e); }
  }, [onApply, singleDate]);

  const handlePreset = useCallback((preset) => {
    let [ps, pe] = preset.getValue();

    // Auto-adjust range if it exceeds disableDatesAfter
    if (disableDatesAfter) {
      const cutoff = dayjs(disableDatesAfter).endOf('day');
      if (pe.isAfter(cutoff)) {
        const diff = pe.diff(cutoff, 'day');
        // Shift entire range back
        pe = cutoff;
        ps = ps.subtract(diff, 'day');
      }
    }

    setMonth(pe.month());
    setYear(pe.year());
    setInternalStart(ps);
    setInternalEnd(pe);
    onApply(ps, pe);
    setActive(false);
  }, [onApply, disableDatesAfter]);

  const selectedRange = useMemo(() => {
    if (!internalStart || !internalEnd) {
      const s = startDate ? dayjs(startDate) : null;
      const e = endDate ? dayjs(endDate) : s;
      if (!s || !e) return undefined;
      return { start: s.startOf('day').toDate(), end: e.startOf('day').toDate() };
    }
    return { start: internalStart.startOf('day').toDate(), end: internalEnd.startOf('day').toDate() };
  }, [internalStart, internalEnd, startDate, endDate]);

  const displayLabel = useMemo(() => {
    const s = startDate ? dayjs(startDate) : null;
    const e = endDate ? dayjs(endDate) : null;
    if (s && e) return s.isSame(e, 'day') ? s.format('DD MMM YYYY') : `${s.format('DD MMM YYYY')} – ${e.format('DD MMM YYYY')}`;
    return label;
  }, [startDate, endDate, label]);

  return (
    <AppProvider i18n={enTranslations} theme={{ colorScheme: isDark ? 'dark' : 'light' }}>
      <Popover
        active={active}
        activator={
          <Card
            elevation={0}
            onClick={toggle}
            role="button"
            tabIndex={0}
            sx={{
              px: 1.25, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: disabled ? 'default' : 'pointer',
              minWidth: { xs: 160, md: 200 }, textAlign: 'center', userSelect: 'none',
              border: '1px solid', borderColor: disabled ? 'action.disabledBackground' : 'divider', boxShadow: 'none',
              bgcolor: disabled ? 'transparent' : (variant === 'primary' ? '#5ba3e0' : bgColor),
              color: disabled ? 'text.disabled' : (variant === 'primary' ? '#0a1f33' : textColor),
              opacity: disabled ? 0.6 : 1,
              pointerEvents: disabled ? 'none' : 'auto',
              '&:hover': { filter: disabled ? 'none' : 'brightness(0.97)' },
              ...sx,
            }}
          >
            <Typography variant="body2" noWrap sx={{ color: 'inherit' }}>{displayLabel}</Typography>
          </Card>
        }
        onClose={handleClose}
        preferredAlignment="right"
      >
        <Box sx={{ display: 'flex', flexDirection: 'row', maxHeight: '80vh', overflowX: 'hidden', overflowY: 'auto', borderRadius: 1 }}>
          {!singleDate && (
            <Box sx={{ minWidth: 120, maxHeight: 320, overflowY: 'auto', borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: { xs: 'block', md: 'none' } }}>
              <List disablePadding>
                {presets.map((preset, idx) => {
                  const isSelected = activePresetLabel === preset.label;
                  const [ps, pe] = preset.getValue();
                  // Only disable if it's strictly a single day (Today) that is disabled, OR if shifting isn't possible (e.g. future single day)
                  // For ranges (Last 7 days), we allow them and shift them in handlePreset.
                  // "Today" is start==end.
                  const isSingleDay = ps.isSame(pe, 'day');
                  const isDisabled = disableDatesAfter && isSingleDay && pe.isAfter(dayjs(disableDatesAfter).endOf('day'));

                  return (
                    <Box key={preset.label}>
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => !isDisabled && handlePreset(preset)}
                        disabled={isDisabled}
                        sx={{ py: 1, px: 1.5 }}
                      >
                        <ListItemText
                          primary={preset.label}
                          primaryTypographyProps={{
                            variant: 'body2',
                            fontWeight: isSelected ? 600 : 400,
                            fontSize: 12,
                            color: isDisabled ? 'text.disabled' : 'text.primary'
                          }}
                        />
                        {isSelected && <CheckIcon sx={{ fontSize: 14, ml: 0.5, color: isDisabled ? 'text.disabled' : 'inherit' }} />}
                      </ListItemButton>

                      {idx < presets.length - 1 && <Divider />}
                    </Box>
                  );
                })}
              </List>
            </Box>
          )}
          {!singleDate && (
            <Box sx={{ minWidth: 160, maxHeight: 320, overflowY: 'auto', borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: { xs: 'none', md: 'block' } }}>
              <List dense disablePadding>
                {presets.map((preset, idx) => {
                  const isSelected = activePresetLabel === preset.label;
                  const [ps, pe] = preset.getValue();
                  // Only disable if it's strictly a single day (Today) that is disabled
                  const isSingleDay = ps.isSame(pe, 'day');
                  const isDisabled = disableDatesAfter && isSingleDay && pe.isAfter(dayjs(disableDatesAfter).endOf('day'));

                  return (
                    <Box key={preset.label}>
                      <ListItemButton
                        selected={isSelected}
                        onClick={() => !isDisabled && handlePreset(preset)}
                        disabled={isDisabled}
                        sx={{ py: 1, px: 1.5 }}
                      >
                        <ListItemText
                          primary={preset.label}
                          primaryTypographyProps={{
                            variant: 'body2',
                            fontWeight: isSelected ? 600 : 400,
                            color: isDisabled ? 'text.disabled' : 'text.primary'
                          }}
                        />
                        {isSelected && <CheckIcon sx={{ fontSize: 16, ml: 0.5, color: isDisabled ? 'text.disabled' : 'text.primary' }} />}
                      </ListItemButton>
                      {idx < presets.length - 1 && <Divider />}
                    </Box>
                  );
                })}
              </List>
            </Box>
          )}
          <Box sx={{ flex: 1, p: 1, minWidth: 200, bgcolor: 'background.paper' }}>
            <DatePicker
              month={month}
              year={year}
              onChange={handleRangeChange}
              onMonthChange={handleMonthChange}
              selected={selectedRange}
              allowRange={!singleDate}
              disableDatesAfter={disableDatesAfter}
            />
          </Box>
        </Box>
      </Popover >
    </AppProvider >
  );
}

function DeltaBadge({ current, previous, isPercent }) {
  const diff = current - previous;
  // If previous is 0:
  // - If current is 0, no change (null).
  // - If current != 0, it's effectively "New" or infinite growth.
  if (previous === 0 && current === 0) return null;

  let diffPct = 0;
  if (previous === 0) {
    diffPct = 100; // Treat as 100% increase if starting from 0
  } else {
    diffPct = isPercent
      ? (diff) // Use arithmetic difference for percents (pp) or relative?
      // Re-reading user request: "comparison delta (up or down)"
      // Let's use relative change for everything if posssible.
      // (2.5 - 2.0) / 2.0 * 100 = 25%.
      : (diff / previous) * 100;
  }

  const color = diff >= 0 ? 'success.main' : 'error.main';
  const Icon = diff >= 0 ? ArrowUpwardIcon : ArrowDownwardIcon;

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', ml: 0, color, fontSize: '0.75rem', fontWeight: 500 }}>
      {Math.abs(diff) > 0.0001 && <Icon fontSize="inherit" sx={{ mr: 0.25 }} />}
      {Math.abs(diffPct).toFixed(1)}%
    </Box>
  );
}


import { Collapse, IconButton, Tooltip, Checkbox, ListItem, ListItemIcon, ListItemSecondaryAction, Paper } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

// --- Detailed Filter Panel Component (Persistent Side Panel Mode) ---
function DetailedFilterPanel({
  onClose,
  allColumns,
  visibleColumnIds,
  setVisibleColumnIds,
  filters,
  onAddFilter,
  onRemoveFilter,
  onClearFilters
}) {
  const theme = useTheme();

  // State for new filter creation
  const [showAddForm, setShowAddForm] = useState(false);
  const [field, setField] = useState('');
  const [operator, setOperator] = useState('gt');
  const [value, setValue] = useState('');

  const handleToggleColumn = (colId) => {
    if (visibleColumnIds.includes(colId)) {
      if (visibleColumnIds.length > 1) { // Prevent hiding all columns
        setVisibleColumnIds(visibleColumnIds.filter(id => id !== colId));
      }
    } else {
      setVisibleColumnIds([...visibleColumnIds, colId]);
    }
  };

  const handleToggleAllMetrics = () => {
    const metricIds = allColumns.filter(c => c.id !== 'landing_page_path').map(c => c.id);
    const allMetricsVisible = metricIds.every(id => visibleColumnIds.includes(id));

    if (allMetricsVisible) {
      // Hide all except landing_page (primary key)
      setVisibleColumnIds(['landing_page_path']);
    } else {
      // Show all
      setVisibleColumnIds(allColumns.map(c => c.id));
    }
  };

  // Validation Logic
  const validation = useMemo(() => {
    if (!field || value === '') return { valid: true };
    return validateFilter({ field, operator, value }, filters);
  }, [field, operator, value, filters]);

  const handleAddF = () => {
    if (field && value !== '' && validation.valid) {
      onAddFilter({ field, operator, value });
      setField('');
      setValue('');
      setShowAddForm(false);
    }
  };

  const metricCols = allColumns.filter(c => c.id !== 'landing_page_path');
  const isAllSelected = metricCols.every(c => visibleColumnIds.includes(c.id));

  // Render as a persistent panel (Box/Card style)
  return (
    <Card variant="outlined" sx={{ width: 320, height: 800, display: 'flex', flexDirection: 'column', borderRadius: 2, bgcolor: 'background.paper', borderLeft: `1px solid ${theme.palette.divider}` }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'background.default' }}>
        <Typography variant="h6" fontWeight={600} fontSize="0.95rem">Filter Panel</Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ overflowY: 'auto', flex: 1, p: 2 }}>

        {/* Metrics Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.5 }}>
            Metrics
          </Typography>
          <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <List dense disablePadding>
              {/* "All" Toggle */}
              <ListItem dense divider button onClick={handleToggleAllMetrics}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox
                    edge="start"
                    checked={isAllSelected}
                    indeterminate={!isAllSelected && metricCols.some(c => visibleColumnIds.includes(c.id))}
                    tabIndex={-1}
                    disableRipple
                    size="small"
                  />
                </ListItemIcon>
                <ListItemText primary="All Metrics" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }} />
              </ListItem>

              {/* Individual Metrics */}
              {metricCols.map((col) => {
                const isChecked = visibleColumnIds.includes(col.id);
                return (
                  <ListItem key={col.id} dense divider button onClick={() => handleToggleColumn(col.id)}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        edge="start"
                        checked={isChecked}
                        tabIndex={-1}
                        disableRipple
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemText primary={col.label} primaryTypographyProps={{ fontSize: '0.875rem' }} />
                  </ListItem>
                );
              })}
            </List>
          </Card>
        </Box>

        {/* Filters Section */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.5 }}>
              Filters
            </Typography>
            <Tooltip title="Add New Filter">
              <IconButton size="small" onClick={() => setShowAddForm(!showAddForm)} color={showAddForm ? 'primary' : 'default'} sx={{ bgcolor: showAddForm ? 'action.selected' : 'transparent', border: '1px solid', borderColor: 'divider' }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Add Filter Form */}
          <Collapse in={showAddForm} unmountOnExit>
            <Card variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'background.default', borderStyle: 'dashed' }}>
              <Stack spacing={2}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Field</InputLabel>
                  <Select value={field} label="Field" onChange={(e) => setField(e.target.value)}>
                    {allColumns.filter(c => c.id !== 'landing_page_path').map(c => (
                      <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Stack direction="row" spacing={1}>
                  <FormControl size="small" sx={{ width: '40%' }}>
                    <Select value={operator} onChange={(e) => setOperator(e.target.value)}>
                      <MenuItem value="gt">&gt; (Gt)</MenuItem>
                      <MenuItem value="lt">&lt; (Lt)</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    type="number"
                    placeholder="Val"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                </Stack>

                {!validation.valid && (
                  <Alert severity="warning" sx={{ py: 0, px: 1, '& .MuiAlert-message': { fontSize: '0.75rem' }, alignItems: 'center' }}>
                    {validation.message}
                  </Alert>
                )}

                <Button variant="contained" size="small" disabled={!field || !value || !validation.valid} onClick={handleAddF} sx={{ alignSelf: 'flex-end', textTransform: 'none', borderRadius: 2, boxShadow: 'none' }}>
                  Apply Filter
                </Button>
              </Stack>
            </Card>
          </Collapse>

          {/* Active Filters List */}
          {filters.length === 0 && !showAddForm ? (
            <Box sx={{ p: 3, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary">No active filters</Typography>
              <Typography variant="caption" color="text.secondary">Click + to add one</Typography>
            </Box>
          ) : (
            <Box sx={{ maxHeight: 200, overflowY: 'auto', pr: 0.5 }}>
              <Stack spacing={1}>
                {filters.map((f, idx) => {
                  const col = allColumns.find(c => c.id === f.field);
                  return (
                    <Card key={idx} variant="outlined" sx={{ p: 1, pl: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2, borderColor: 'primary.main' }}>
                      <Box>
                        <Typography variant="caption" display="block" color="text.secondary" fontSize="0.65rem" fontWeight={600} sx={{ textTransform: 'uppercase' }}>
                          {col?.label || f.field}
                        </Typography>
                        <Typography variant="body2" fontWeight={500} fontSize="0.75rem">
                          {f.operator === 'gt' ? 'Greater than' : 'Less than'} <b>{f.value}</b>
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={() => onRemoveFilter(idx)} sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Card>
                  );
                })}
              </Stack>
            </Box>
          )}
        </Box>

      </Box>

      {/* Footer */}
      {(filters.length > 0) && (
        <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper' }}>
          <Button fullWidth variant="outlined" color="error" onClick={onClearFilters} startIcon={<DeleteIcon />} sx={{ textTransform: 'none' }}>
            Clear All Filters
          </Button>
        </Box>
      )}

    </Card>
  );
}


const MemoizedTable = memo(({
  columns,
  rows,
  status,
  sortBy,
  sortDir,
  compareMode,
  handleSort,
  start,
  end,
  compareStart,
  compareEnd
}) => {
  return (
    <Table size="small">
      <TableHead>
        <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.08)' }}>
          {columns.map((col) => (
            <TableCell key={col.id} align={col.align} sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              <TableSortLabel
                active={sortBy === col.id} direction={sortBy === col.id ? sortDir : 'asc'}
                onClick={() => handleSort(col.id)}
              >
                {col.label}
              </TableSortLabel>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {status !== 'loading' && rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={columns.length} align="center" sx={{ py: 3, color: 'text.secondary' }}>
              No data for the selected range.
            </TableCell>
          </TableRow>
        )}
        {rows.map((row, idx) => (
          <TableRow key={`${row.landing_page_path || 'path'}-${idx}`}>
            {columns.map((col) => {
              const raw = row[col.id] ?? '';
              const value = col.format ? col.format(raw) : formatNumber(raw);
              const display = col.id === 'landing_page_path' ? (row.landing_page_path || '—') : value;

              let delta = null;
              if (compareMode && row.previous && col.id !== 'landing_page_path') {
                const prev = Number(row.previous[col.id] || 0);
                const curr = Number(raw || 0);

                let valCurr = curr;
                let valPrev = prev;

                if (col.id !== 'cvr') {
                  const daysCurr = dayjs(end).diff(dayjs(start), 'day') + 1;
                  const daysPrev = dayjs(compareEnd).diff(dayjs(compareStart), 'day') + 1;
                  valCurr = curr / Math.max(1, daysCurr);
                  valPrev = prev / Math.max(1, daysPrev);
                }
                delta = <DeltaBadge current={valCurr} previous={valPrev} isPercent={col.id === 'cvr'} />;
              }
              const prevRaw = (compareMode && row.previous) ? row.previous[col.id] : null;
              const prevDisplay = prevRaw !== null && prevRaw !== undefined ? (col.format ? col.format(prevRaw) : formatNumber(prevRaw)) : null;

              return (
                <TableCell key={col.id} align={col.align} sx={{ verticalAlign: 'middle', ...(col.id === 'landing_page_path' ? { maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}) }}>
                  <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: col.align === 'right' ? 'flex-end' : 'flex-start', pr: (compareMode && col.align === 'right') ? '70px' : 0 }}>
                    <span>{display}</span>
                    {prevDisplay && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.70rem', lineHeight: 1.2 }}>
                        {prevDisplay}
                      </Typography>
                    )}
                    {delta && (
                      <Box sx={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: '64px', display: 'flex', justifyContent: 'flex-start' }}>
                        {delta}
                      </Box>
                    )}
                  </Box>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});

export default function ProductConversionTable({ brandKey }) {

  const dispatch = useAppDispatch();
  const productState = useAppSelector((state) => state.productConversion);
  const { start, end, page, pageSize, sortBy, sortDir, rows, totalCount, status, error, compareMode, compareStart, compareEnd } = productState;
  const [exporting, setExporting] = useState(false);
  const [localSearch, setLocalSearch] = useState(productState.search || '');

  // Columns definition (Memoized to prevent recreation)
  const columns = useMemo(() => [
    { id: 'landing_page_path', label: 'Landing Page', align: 'left' },
    { id: 'sessions', label: 'Sessions', align: 'right' },
    { id: 'atc', label: 'ATC Sessions', align: 'right' },
    { id: 'atc_rate', label: 'ATC Rate', align: 'right', format: formatPercent },
    { id: 'orders', label: 'Orders', align: 'right' },
    { id: 'sales', label: 'Sales', align: 'right' },
    { id: 'cvr', label: 'CVR', align: 'right', format: formatPercent },
  ], []);

  // Panel State (Boolean togglable)
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(columns.map(c => c.id));

  // Compute visible columns
  const visibleColumns = useMemo(() => {
    return columns.filter(c => visibleColumnIds.includes(c.id));
  }, [columns, visibleColumnIds]);

  // Handler for clearing all filters
  const handleClearFilters = () => {
    dispatch(clearFilters());
    triggerFetch({ filters: [] });
  };


  // const isDark = theme.palette.mode === 'dark'; // Handled in DateRangePicker
  const fetchTimer = useRef(null);
  const inflight = useRef(null);
  const paramsRef = useRef({ start, end, page, pageSize, sortBy, sortDir, compareMode, compareStart, compareEnd });

  // Effects for paramsRef and fetch cancellation
  useEffect(() => {
    return () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
      if (inflight.current?.abort) inflight.current.abort();
    };
  }, []);

  useEffect(() => {
    paramsRef.current = { start, end, page, pageSize, sortBy, sortDir, compareMode, compareStart, compareEnd };
  }, [start, end, page, pageSize, sortBy, sortDir, compareMode, compareStart, compareEnd]);

  const runFetch = useCallback((params = {}) => {
    if (fetchTimer.current) { clearTimeout(fetchTimer.current); fetchTimer.current = null; }
    if (!brandKey) return;
    if (inflight.current?.abort) inflight.current.abort();

    // Merge params and ensure dates are formatted as YYYY-MM-DD strings for the API
    const base = paramsRef.current || {};
    const merged = { ...base, ...params };

    const formatDate = (val) => {
      if (!val) return null;
      // If it's a dayjs object
      if (val.format) return val.format('YYYY-MM-DD');
      // If it's a string, try to parse and clean it, or just return strict substring if it looks like ISO
      if (typeof val === 'string') {
        if (val.includes('T')) return val.split('T')[0];
        return val;
      }
      // If it's a Date object
      if (val instanceof Date) return dayjs(val).format('YYYY-MM-DD');
      return val;
    };

    if (merged.start) merged.start = formatDate(merged.start);
    if (merged.end) merged.end = formatDate(merged.end);
    if (merged.compareStart) merged.compareStart = formatDate(merged.compareStart);
    if (merged.compareEnd) merged.compareEnd = formatDate(merged.compareEnd);

    const promise = dispatch(fetchProductConversion({ brand_key: brandKey, ...merged }));
    inflight.current = promise;
    promise.finally(() => { if (inflight.current === promise) inflight.current = null; });
  }, [brandKey, dispatch]);

  const triggerFetch = useCallback((params = {}) => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => { runFetch(params); }, 200);
  }, [runFetch]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== (productState.search || '')) {
        dispatch(setSearch(localSearch));
        triggerFetch({ search: localSearch, page: 1 });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch, productState.search, dispatch, triggerFetch]);

  useEffect(() => { if (brandKey) runFetch(); }, [brandKey, runFetch]);

  const applyDateChange = useCallback((s, e) => {
    const nextStart = s ? s.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const nextEnd = e ? e.format('YYYY-MM-DD') : nextStart;
    dispatch(setDateRange({ start: nextStart, end: nextEnd }));
    runFetch({ start: nextStart, end: nextEnd, page: 1 });
  }, [dispatch, runFetch]);

  const applyCompDateChange = useCallback((s, e) => {
    const nextStart = s ? s.format('YYYY-MM-DD') : null;
    const nextEnd = e ? e.format('YYYY-MM-DD') : nextStart;
    dispatch(setCompareDateRange({ start: nextStart, end: nextEnd }));
    triggerFetch({ compareStart: nextStart, compareEnd: nextEnd });
  }, [dispatch, triggerFetch]);

  const activePreset = useMemo(() => {
    const s = start ? dayjs(start) : null;
    const e = end ? dayjs(end) : null;
    if (!s || !e) return null;
    const found = DATE_PRESETS.find((preset) => {
      const [ps, pe] = preset.getValue();
      return s.isSame(ps, 'day') && e.isSame(pe, 'day');
    });
    return found?.label || null;
  }, [start, end]);

  const activeCompPreset = useMemo(() => {
    const s = compareStart ? dayjs(compareStart) : null;
    const e = compareEnd ? dayjs(compareEnd) : null;
    if (!s || !e) return null;
    const found = DATE_PRESETS.find((preset) => {
      const [ps, pe] = preset.getValue();
      return s.isSame(ps, 'day') && e.isSame(pe, 'day');
    });
    return found?.label || null;
  }, [compareStart, compareEnd]);

  const handleCompareModeChange = (e) => {
    const isCompare = e.target.value === 'compare';

    let currentStart = dayjs(start);
    let currentEnd = dayjs(end);
    let datesChanged = false;

    // 1. If enabling compare, clamp dates to yesterday
    if (isCompare) {
      const yesterday = dayjs().subtract(1, 'day').startOf('day');
      // If end is after yesterday (e.g. today or future)
      if (currentEnd.isAfter(yesterday)) {
        currentEnd = yesterday;
        datesChanged = true;
      }
      // If start is after the new end (e.g. start was today)
      if (currentStart.isAfter(currentEnd)) {
        currentStart = currentEnd;
        datesChanged = true;
      }
    }

    // Update main date range if clamped
    if (datesChanged) {
      dispatch(setDateRange({ start: currentStart.toISOString(), end: currentEnd.toISOString() }));
    }

    dispatch(setCompareMode(isCompare));

    if (isCompare && (datesChanged || !compareStart)) {
      // Default to same duration previous to the (potentially new) start date
      const s = currentStart;
      const e = currentEnd;
      const duration = e.diff(s, 'day');
      const prevEnd = s.subtract(1, 'day');
      const prevStart = prevEnd.subtract(duration, 'day');

      // We manually dispatch and trigger here to avoid double-fetching if we just called applyDateChange
      const startStr = currentStart.format('YYYY-MM-DD');
      const endStr = currentEnd.format('YYYY-MM-DD');
      const compStartStr = prevStart.format('YYYY-MM-DD');
      const compEndStr = prevEnd.format('YYYY-MM-DD');

      dispatch(setCompareDateRange({ start: compStartStr, end: compEndStr }));
      triggerFetch({
        start: startStr,
        end: endStr,
        compareMode: true,
        compareStart: compStartStr,
        compareEnd: compEndStr
      });
    } else {
      // Just toggle mode, possibly with new clamped dates
      triggerFetch({
        start: currentStart.format('YYYY-MM-DD'),
        end: currentEnd.format('YYYY-MM-DD'),
        compareMode: isCompare
      });
    }
  };

  const handleChangePage = (_e, newPage) => { const nextPage = newPage + 1; dispatch(setPage(nextPage)); triggerFetch({ page: nextPage }); };
  const handleChangeRowsPerPage = (e) => { const nextSize = parseInt(e.target.value, 10); dispatch(setPageSize(nextSize)); triggerFetch({ page: 1, pageSize: nextSize }); };
  const handleSort = (column) => {
    const isAsc = sortBy === column && sortDir === 'asc';
    const nextDir = isAsc ? 'desc' : 'asc';
    dispatch(setSort({ sortBy: column, sortDir: nextDir }));
    triggerFetch({ page: 1, sortBy: column, sortDir: nextDir });
  };

  const handleExport = async () => {
    setExporting(true);
    const resp = await exportProductConversionCsv({ brand_key: brandKey, start, end, sortBy, sortDir });
    setExporting(false);
    if (resp.error || !resp.blob) return;
    const url = URL.createObjectURL(resp.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resp.filename || 'product_conversion.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (

    <Stack spacing={2}>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', width: '100%', pr: { xs: 0, md: 1 } }}>
        <Box sx={{ width: { xs: '100%', md: 300 }, mb: { xs: 2, md: 0 } }}>
          <TextField
            size="small"
            placeholder="Search products..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
              sx: { bgcolor: 'background.paper', fontSize: '0.875rem' }
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: { xs: 1, md: 2 }, width: { xs: '100%', md: 'auto' } }}>

          <FormControl size="small" sx={{ minWidth: 150, width: { xs: '100%', md: 'auto' } }}>
            <Select
              value={compareMode ? 'compare' : 'none'}
              onChange={handleCompareModeChange}
              size="small"
              sx={{ bgcolor: 'background.paper', fontSize: '0.875rem' }}
            >
              <MenuItem value="none">No comparison</MenuItem>
              <MenuItem value="compare">Compare</MenuItem>
            </Select>
          </FormControl>

          <DateRangePicker
            startDate={compareStart}
            endDate={compareEnd}
            onApply={applyCompDateChange}
            label="Select comparison"
            activePresetLabel={activeCompPreset}
            disabled={!compareMode}
            disableDatesAfter={dayjs().subtract(1, 'day').toDate()}
            sx={{ width: { xs: '100%', md: 'auto' } }}
          />

          <DateRangePicker
            startDate={start}
            endDate={end}
            onApply={applyDateChange}
            variant="primary"
            activePresetLabel={activePreset}
            disableDatesAfter={compareMode ? dayjs().subtract(1, 'day').toDate() : null}
            sx={{ width: { xs: '100%', md: 'auto' } }}
          />

          <Button
            variant="outlined"
            size="small"
            startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
            onClick={handleExport}
            disabled={exporting || status === 'loading'}
            sx={{ height: 36, width: { xs: '100%', md: 'auto' } }}
          >
            Export CSV
          </Button>

          <Tooltip title="Filter">
            <IconButton
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              sx={{
                bgcolor: (showFilterPanel || productState.filters?.length > 0) ? 'primary.main' : 'background.paper',
                color: (showFilterPanel || productState.filters?.length > 0) ? 'primary.contrastText' : 'text.primary',
                border: '1px solid',
                borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'divider',
                borderRadius: 2,
                width: 36, height: 36,
                '&:hover': { bgcolor: (showFilterPanel || productState.filters?.length > 0) ? 'primary.dark' : 'action.hover' }
              }}
            >
              <FilterListIcon fontSize="small" />
            </IconButton>
          </Tooltip>

        </Box>
      </Box>

      {/* Filter Summary / Active Chips (optional display if panel is closed) */}
      {(productState.filters && productState.filters.length > 0 && !showFilterPanel) && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {productState.filters.map((f, idx) => {
            const col = columns.find(c => c.id === f.field);
            return (
              <Chip
                key={idx}
                label={`${col?.label || f.field} ${f.operator === 'gt' ? '>' : '<'} ${f.value}`}
                size="small"
                onDelete={() => {
                  dispatch(removeFilter(idx));
                  const newFilters = [...productState.filters];
                  newFilters.splice(idx, 1);
                  triggerFetch({ filters: newFilters });
                }}
                sx={{ borderRadius: 1 }}
              />
            );
          })}
          <Button size="small" color="primary" onClick={handleClearFilters} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>Clear all</Button>
        </Box>
      )}

      {/* Flex Container for Table + Side Panel */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, minHeight: 500 }}>

        {/* Main Table Content (Flex Grow) */}
        <Box sx={{ flex: 1, minWidth: 0, transition: 'all 0.3s ease' }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent sx={{ p: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <TableContainer sx={{ flex: 1, overflowY: 'auto' }}>
                <MemoizedTable
                  columns={visibleColumns}
                  rows={rows}
                  status={status}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  compareMode={compareMode}
                  handleSort={handleSort}
                  start={start}
                  end={end}
                  compareStart={compareStart}
                  compareEnd={compareEnd}
                  onOpenFilter={() => setShowFilterPanel(true)}
                  hasActiveFilters={productState.filters?.length > 0 || visibleColumnIds.length < columns.length}
                />
                {error && (
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.16)', px: 2 }}>
                    <Alert severity="error">Failed to load data</Alert>
                  </Box>
                )}
                {status === 'loading' && (
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.12)', pointerEvents: 'none' }}>
                    <CircularProgress size={24} />
                  </Box>
                )}
              </TableContainer>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <TablePagination
                  component="div"
                  count={totalCount}
                  page={Math.max(0, page - 1)}
                  onPageChange={handleChangePage}
                  rowsPerPage={pageSize}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  rowsPerPageOptions={[10, 25, 50]}
                  ActionsComponent={(props) => <PaginationActions {...props} disabled={status === 'loading' || exporting} />}
                  SelectProps={{ disabled: status === 'loading' || exporting }}
                />
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Filter Panel (Collapsible) */}
        <Collapse in={showFilterPanel} orientation="horizontal" timeout={300}>
          {/* Detailed Panel */}
          <DetailedFilterPanel
            onClose={() => setShowFilterPanel(false)}
            allColumns={columns}
            visibleColumnIds={visibleColumnIds}
            setVisibleColumnIds={setVisibleColumnIds}
            filters={productState.filters || []}
            onAddFilter={(newFilter) => {
              const existingIdx = (productState.filters || []).findIndex(f => f.field === newFilter.field && f.operator === newFilter.operator);
              if (existingIdx !== -1) {
                // Replace existing
                dispatch(removeFilter(existingIdx));
                dispatch(addFilter(newFilter));
                const updated = [...(productState.filters || [])];
                updated.splice(existingIdx, 1, newFilter);
                triggerFetch({ filters: updated });
              } else {
                // Add new
                dispatch(addFilter(newFilter));
                triggerFetch({ filters: [...(productState.filters || []), newFilter] });
              }
            }}
            onRemoveFilter={(idx) => {
              dispatch(removeFilter(idx));
              const newFilters = [...(productState.filters || [])];
              newFilters.splice(idx, 1);
              triggerFetch({ filters: newFilters });
            }}
            onClearFilters={handleClearFilters}
          />
        </Collapse>
      </Box>

    </Stack>
  );
}
