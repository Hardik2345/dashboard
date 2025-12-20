import { useEffect, useMemo, useState, useCallback } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Card,
  CardContent,
  Divider,
  Paper,
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
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CheckIcon from '@mui/icons-material/Check';
import { Popover, DatePicker } from '@shopify/polaris';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import AuthorBrandSelector from './AuthorBrandSelector.jsx';
import { useAppDispatch, useAppSelector } from '../state/hooks.js';
import { fetchProductConversion, setDateRange, setPage, setPageSize, setSort } from '../state/slices/productConversionSlice.js';
import { exportProductConversionCsv } from '../lib/api.js';
import { useTheme } from '@mui/material/styles';

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

export default function ProductConversionTable({ brandKey, brands = [], onBrandChange, brandsLoading = false }) {
  const dispatch = useAppDispatch();
  const productState = useAppSelector((state) => state.productConversion);
  const { start, end, page, pageSize, sortBy, sortDir, rows, totalCount, status, error } = productState;
  const [exporting, setExporting] = useState(false);
  const [popoverActive, setPopoverActive] = useState(false);
  const [month, setMonth] = useState(dayjs().month());
  const [year, setYear] = useState(dayjs().year());
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const rangeValue = useMemo(() => {
    const startDay = start ? dayjs(start) : dayjs();
    const endDay = end ? dayjs(end) : startDay;
    return [startDay, endDay];
  }, [start, end]);

  useEffect(() => {
    if (!brandKey) return;
    dispatch(fetchProductConversion({ brand_key: brandKey, start, end, page, pageSize, sortBy, sortDir }));
  }, [dispatch, brandKey, start, end, page, pageSize, sortBy, sortDir]);

  useEffect(() => {
    const focus = rangeValue[1] || rangeValue[0];
    if (focus) {
      setMonth(focus.month());
      setYear(focus.year());
    }
  }, [rangeValue]);

  const applyDateChange = useCallback((s, e) => {
    const nextStart = s ? s.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const nextEnd = e ? e.format('YYYY-MM-DD') : nextStart;
    dispatch(setDateRange({ start: nextStart, end: nextEnd }));
    dispatch(fetchProductConversion({ brand_key: brandKey, start: nextStart, end: nextEnd, page: 1, pageSize, sortBy, sortDir }));
  }, [dispatch, brandKey, pageSize, sortBy, sortDir]);

  const handleChangePage = (_e, newPage) => {
    const nextPage = newPage + 1;
    dispatch(setPage(nextPage));
    dispatch(fetchProductConversion({ brand_key: brandKey, start, end, page: nextPage, pageSize, sortBy, sortDir }));
  };

  const handleChangeRowsPerPage = (e) => {
    const nextSize = parseInt(e.target.value, 10);
    dispatch(setPageSize(nextSize));
    dispatch(fetchProductConversion({ brand_key: brandKey, start, end, page: 1, pageSize: nextSize, sortBy, sortDir }));
  };

  const handleSort = (column) => {
    const isAsc = sortBy === column && sortDir === 'asc';
    const nextDir = isAsc ? 'desc' : 'asc';
    dispatch(setSort({ sortBy: column, sortDir: nextDir }));
    dispatch(fetchProductConversion({ brand_key: brandKey, start, end, page: 1, pageSize, sortBy: column, sortDir: nextDir }));
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

  const dateLabel = useMemo(() => {
    const [s, e] = rangeValue;
    if (s && e) {
      if (s.isSame(e, 'day')) return s.format('DD MMM YYYY');
      return `${s.format('DD MMM YYYY')} – ${e.format('DD MMM YYYY')}`;
    }
    if (s) return s.format('DD MMM YYYY');
    return 'Select dates';
  }, [rangeValue]);

  const selectedRange = useMemo(() => {
    const [s, e] = rangeValue;
    if (!s || !e) return undefined;
    return { start: s.startOf('day').toDate(), end: e.startOf('day').toDate() };
  }, [rangeValue]);

  const togglePopover = () => setPopoverActive((prev) => !prev);
  const handleClose = () => setPopoverActive(false);
  const handleMonthChange = (m, y) => {
    setMonth(m);
    setYear(y);
  };

  const handleRangeChange = ({ start: sRaw, end: eRaw }) => {
    const s = sRaw ? dayjs(sRaw).startOf('day') : null;
    const e = eRaw ? dayjs(eRaw).startOf('day') : null;
    const focus = e || s;
    if (focus) {
      setMonth(focus.month());
      setYear(focus.year());
    }
    if (s && e && s.isAfter(e)) {
      applyDateChange(e, s);
      return;
    }
    if (s && !e) {
      applyDateChange(s, s);
      return;
    }
    applyDateChange(s, e ?? s ?? null);
  };

  const handlePresetSelect = (preset) => {
    const [ps, pe] = preset.getValue();
    setMonth(pe.month());
    setYear(pe.year());
    applyDateChange(ps, pe);
    setPopoverActive(false);
  };

  const activePreset = useMemo(() => {
    const [s, e] = rangeValue;
    if (!s || !e) return null;
    const found = DATE_PRESETS.find((preset) => {
      const [ps, pe] = preset.getValue();
      return s.isSame(ps, 'day') && e.isSame(pe, 'day');
    });
    return found?.label || null;
  }, [rangeValue]);

  const columns = [
    { id: 'landing_page_path', label: 'Landing Page', align: 'left' },
    { id: 'sessions', label: 'Sessions', align: 'right' },
    { id: 'atc', label: 'ATC Sessions', align: 'right' },
    { id: 'orders', label: 'Orders', align: 'right' },
    { id: 'sales', label: 'Sales', align: 'right' },
    { id: 'cvr', label: 'CVR', align: 'right', format: formatPercent },
  ];

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, width: '100%', pr: { xs: 0, md: 1 } }}>
        <AppProvider
          i18n={enTranslations}
          theme={{
            colorScheme: isDark ? 'dark' : 'light',
          }}
        >
          <Popover
            active={popoverActive}
            activator={
              <Card
                elevation={0}
                onClick={togglePopover}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    togglePopover();
                  }
                }}
                sx={{
                  px: 1.25,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  minWidth: { xs: 160, md: 200 },
                  textAlign: 'center',
                  userSelect: 'none',
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: 'none',
                  bgcolor: '#5ba3e0',
                  color: '#0a1f33',
                  '&:hover': { filter: 'brightness(0.97)' },
                }}
              >
                <Typography variant="body2" noWrap sx={{ color: 'inherit' }}>{dateLabel}</Typography>
              </Card>
            }
            onClose={handleClose}
            preferredAlignment="right"
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                maxHeight: '80vh',
                overflowX: 'hidden',
                overflowY: 'auto',
                borderRadius: 1,
              }}
            >
              <Box sx={{ minWidth: 120, maxHeight: 320, overflowY: 'auto', borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: { xs: 'block', md: 'none' } }}>
                <List disablePadding>
                  {DATE_PRESETS.map((preset, idx) => {
                    const isSelected = activePreset === preset.label;
                    const showDivider = idx < DATE_PRESETS.length - 1 && DATE_PRESETS[idx + 1].group !== preset.group;
                    return (
                      <Box key={preset.label}>
                        <ListItemButton
                          selected={isSelected}
                          onClick={() => handlePresetSelect(preset)}
                          sx={{
                            py: 1,
                            px: 1.5,
                            bgcolor: isSelected ? 'action.selected' : 'transparent',
                            '&:hover': {
                              bgcolor: 'action.hover',
                            },
                            '&.Mui-selected': {
                              bgcolor: 'action.selected',
                            },
                          }}
                        >
                          <ListItemText
                            primary={preset.label}
                            primaryTypographyProps={{
                              variant: 'body2',
                              fontWeight: isSelected ? 600 : 400,
                              color: 'text.primary',
                              fontSize: 12,
                            }}
                          />
                          {isSelected && (
                            <CheckIcon sx={{ fontSize: 14, color: 'text.primary', ml: 0.5 }} />
                          )}
                        </ListItemButton>
                        {showDivider && <Divider />}
                      </Box>
                    );
                  })}
                </List>
              </Box>
              <Box sx={{ minWidth: 160, maxHeight: 320, overflowY: 'auto', borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: { xs: 'none', md: 'block' } }}>
                <List dense disablePadding>
                  {DATE_PRESETS.map((preset, idx) => {
                    const isSelected = activePreset === preset.label;
                    const showDivider = idx < DATE_PRESETS.length - 1 && DATE_PRESETS[idx + 1].group !== preset.group;
                    return (
                      <Box key={preset.label}>
                        <ListItemButton
                          selected={isSelected}
                          onClick={() => handlePresetSelect(preset)}
                          sx={{
                            py: 1,
                            px: 1.5,
                            bgcolor: isSelected ? 'action.selected' : 'transparent',
                            '&:hover': {
                              bgcolor: 'action.hover',
                            },
                            '&.Mui-selected': {
                              bgcolor: 'action.selected',
                            },
                          }}
                        >
                        <ListItemText
                          primary={preset.label}
                          primaryTypographyProps={{
                            variant: 'body2',
                            fontWeight: isSelected ? 600 : 400,
                            color: isSelected ? 'text.primary' : 'text.primary',
                          }}
                        />
                        {isSelected && (
                          <CheckIcon sx={{ fontSize: 16, ml: 0.5, color: 'text.primary' }} />
                        )}
                      </ListItemButton>
                      {showDivider && <Divider />}
                    </Box>
                  );
                  })}
                </List>
              </Box>
              <Box sx={{ flex: 1, p: 1, minWidth: 200, bgcolor: 'background.paper' }}>
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
        </AppProvider>
        <Button
          variant="outlined"
          size="small"
          startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
          onClick={handleExport}
          disabled={exporting || status === 'loading'}
          sx={{ height: 36 }}
        >
          Export CSV
        </Button>
      </Box>

      <Card variant="outlined">
        <CardContent sx={{ p: 0 }}>
          {error && (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">Failed to load data</Alert>
            </Box>
          )}
          <TableContainer sx={{ minHeight: 360 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.08)' }}>
                  {columns.map((col) => (
                    <TableCell key={col.id} align={col.align} sx={{ fontWeight: 600 }}>
                      <TableSortLabel
                        active={sortBy === col.id}
                        direction={sortBy === col.id ? sortDir : 'asc'}
                        onClick={() => handleSort(col.id)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {status === 'loading' && (
                  <TableRow>
                    <TableCell colSpan={columns.length} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                )}
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
                      return (
                        <TableCell
                          key={col.id}
                          align={col.align}
                          sx={col.id === 'landing_page_path' ? { maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}}
                        >
                          {display}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            />
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
