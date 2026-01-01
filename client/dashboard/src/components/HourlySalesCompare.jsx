import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Box, FormControl, Select, MenuItem, InputLabel, Checkbox, FormControlLabel, Stack } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Line, Bar } from 'react-chartjs-2';
import { useRef } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  BarElement,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { getHourlyTrend, getDailyTrend, getMonthlyTrend, getHourlySalesSummary } from '../lib/api.js';

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha || 1})`;
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, BarElement, ChartDataLabels);
// Configure datalabels defaults (adapted from StackOverflow suggestion)
if (!ChartJS.defaults.plugins) ChartJS.defaults.plugins = {};
ChartJS.defaults.plugins.datalabels = ChartJS.defaults.plugins.datalabels || {};
ChartJS.defaults.plugins.datalabels.anchor = ChartJS.defaults.plugins.datalabels.anchor || 'end';
ChartJS.defaults.plugins.datalabels.align = ChartJS.defaults.plugins.datalabels.align || 'end';
// Disable datalabels globally by default — enable only where needed (Bar charts below)
ChartJS.defaults.plugins.datalabels.display = false;
const defaultLegendLabels = ChartJS.defaults.plugins.legend.labels.generateLabels;

// Plugin to add extra padding below legend when options.padding isn't respected
const legendPadPlugin = {
  id: 'legendPadPlugin',
  beforeInit(chart) {
    const legend = chart.legend;
    if (!legend || typeof legend.fit !== 'function') return;
    const originalFit = legend.fit;
    legend.fit = function fit() {
      originalFit.bind(legend)();
      this.height += 15; // extra pixels below legend
    };
  }
};

const nfCurrency0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nfCurrency2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const nfInt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfPercent1 = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

// Short formatting for bar labels: prefer compact 'k' for thousands and 'lakhs' for millions
function shortNumberLabel(value) {
  const n = Number(value || 0);
  if (!isFinite(n)) return '';
  const abs = Math.abs(n);
  // Use Indian numbering abbreviations: Cr (crore), L (lakh), k (thousand)
  if (abs >= 10000000) {
    // 1 crore = 10,000,000
    const crores = n / 10000000;
    return `${crores.toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    // 1 lakh = 100,000
    const lakhs = n / 100000;
    return `${lakhs.toFixed(2)}L`;
  }
  if (abs >= 1000) {
    // Show in thousands (no decimals for clarity)
    const thousands = n / 1000;
    return `${thousands.toFixed(thousands >= 100 ? 0 : 1)}k`;
  }
  return nfInt0.format(n);
}

const METRIC_CONFIG = {
  aov: {
    label: 'Avg Order Value',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.14)',
    accessor: (metrics) => {
      const sales = Number(metrics?.sales || 0);
      const orders = Number(metrics?.orders || 0);
      return orders > 0 ? sales / orders : 0;
    },
    formatter: (value) => nfCurrency2.format(value || 0),
  },
  orders: {
    label: 'Total Orders',
    color: '#0ea5e9',
    bg: 'rgba(14,165,233,0.14)',
    accessor: (metrics) => metrics?.orders ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
  sales: {
    label: 'Total Sales',
    color: '#0b6bcb',
    bg: 'rgba(11,107,203,0.12)',
    accessor: (metrics) => metrics?.sales ?? 0,
    formatter: (value) => nfCurrency0.format(value || 0),
  },
  sessions: {
    label: 'Total Sessions',
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.12)',
    accessor: (metrics) => metrics?.sessions ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
  cvr: {
    label: 'Conversion Rate',
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.14)',
    accessor: (metrics) => metrics?.cvr_ratio ?? 0,
    formatter: (value) => nfPercent1.format(value || 0),
  },
  atc: {
    label: 'ATC Sessions',
    color: '#16a34a',
    bg: 'rgba(22,163,74,0.14)',
    accessor: (metrics) => metrics?.atc ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
};

function formatHourLabel(hour) {
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour >= 12 ? 'pm' : 'am';
  // Render without a space to reduce visual gap (e.g. '9pm')
  return `${normalized}${suffix}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Resolve Chart.js instance from different react-chartjs-2 ref shapes
const resolveChart = (ref) => {
  if (!ref) return null;
  const r = ref.current;
  if (!r) return null;
  if (r.chart) return r.chart;
  if (typeof r.getChart === 'function') return r.getChart();
  if (r.config || r.ctx || r.data) return r;
  return null;
};

// React-rendered custom legend component using MUI Checkbox controls
// Moved outside HourlySalesCompare to prevent recreation on every render
function CustomLegend({ chartRef, dataKey }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let intervalId = null;
    let mounted = true;
    const getChart = () => resolveChart(chartRef);

    const tryBuild = () => {
      const chart = getChart();
      if (!chart) return false;
      const build = () => {
        const datasets = chart.data?.datasets || [];
        const arr = datasets.map((ds, i) => {
          const dsHidden = chart.data?.datasets?.[i]?.hidden === true;
          const metaHidden = chart.getDatasetMeta?.(i)?.hidden;
          const visible = typeof chart.isDatasetVisible === 'function'
            ? chart.isDatasetVisible(i)
            : !(dsHidden === true || metaHidden === true);
          return {
            label: ds.label,
            color: ds.borderColor || ds.backgroundColor || '#1976d2',
            index: i,
            visible,
          };
        });
        if (mounted) setItems(arr);
      };

      build();
      const originalUpdate = chart.update.bind(chart);
      chart.update = function () {
        const ret = originalUpdate(...arguments);
        try { build(); } catch { /* ignore */ }
        return ret;
      };
      return () => {
        try { chart.update = originalUpdate; } catch { /* ignore */ }
      };
    };

    const cleanupPatch = tryBuild();
    if (!cleanupPatch) {
      let attempts = 0;
      intervalId = setInterval(() => {
        attempts += 1;
        const cleanup = tryBuild();
        if (cleanup || attempts > 20) {
          if (intervalId) clearInterval(intervalId);
        }
      }, 100);
    }

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [chartRef, dataKey]);

  const toggle = (idx) => {
    const chart = resolveChart(chartRef);
    if (!chart) return;
    const currentHidden = chart.data?.datasets?.[idx]?.hidden === true;
    const newHidden = !currentHidden;
    if (chart.data && chart.data.datasets && chart.data.datasets[idx]) {
      chart.data.datasets[idx].hidden = newHidden;
    }
    try {
      const meta = chart.getDatasetMeta(idx);
      if (meta) meta.hidden = newHidden;
    } catch {
      // ignore
    }
    try { chart.update(); } catch { /* ignore */ }
    const datasets2 = chart.data?.datasets || [];
    const arr = datasets2.map((ds, i) => {
      const dsHidden = chart.data?.datasets?.[i]?.hidden === true;
      const metaHidden = chart.getDatasetMeta?.(i)?.hidden;
      const isVisible = typeof chart.isDatasetVisible === 'function' ? chart.isDatasetVisible(i) : !(dsHidden === true || metaHidden === true);
      return { label: ds.label, color: ds.borderColor || ds.backgroundColor || '#1976d2', index: i, visible: isVisible };
    });
    setItems(arr);
  };

  if (!items.length) {
    return null;
  }
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 0, sm: 1 }}
      sx={{ flexWrap: 'wrap', mb: 1, alignItems: { xs: 'flex-start', sm: 'center' } }}
    >
      {items.map((item) => (
        <FormControlLabel
          key={item.index}
          control={(
            <Checkbox
              checked={Boolean(item.visible)}
              onChange={() => toggle(item.index)}
              sx={{ color: item.color, '&.Mui-checked': { color: item.color } }}
              size="small"
            />
          )}
          label={<Typography variant="caption" sx={{ ml: 0.25 }}>{item.label}</Typography>}
        />
      ))}
    </Stack>
  );
}

function formatRangeLabel(range) {
  if (!range || !range.start || !range.end) return '';
  const startDate = new Date(`${range.start}T00:00:00Z`);
  const endDate = new Date(`${range.end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';
  const sMonth = MONTH_NAMES[startDate.getUTCMonth()] || '';
  const eMonth = MONTH_NAMES[endDate.getUTCMonth()] || '';
  const sDay = startDate.getUTCDate();
  const eDay = endDate.getUTCDate();
  const sYear = startDate.getUTCFullYear();
  const eYear = endDate.getUTCFullYear();
  if (range.start === range.end) {
    return `${sMonth} ${sDay}, ${sYear}`;
  }
  if (sYear === eYear) {
    if (startDate.getUTCMonth() === endDate.getUTCMonth()) {
      return `${sMonth} ${sDay}-${eDay}, ${sYear}`;
    }
    return `${sMonth} ${sDay} - ${eMonth} ${eDay}, ${sYear}`;
  }
  return `${sMonth} ${sDay}, ${sYear} - ${eMonth} ${eDay}, ${eYear}`;
}

export default function HourlySalesCompare({ query, metric = 'sales' }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({
    labels: [],
    values: [],
    comparisonValues: [],
    points: [],
    comparisonPoints: [],
    timezone: 'IST',
    rangeLabel: '',
    comparisonLabel: '',
    error: null,
  });
  const [viewMode, setViewMode] = useState('hourly'); // 'hourly' | 'daily' | 'monthly'
  const start = query?.start;
  const end = query?.end;
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;
  const theme = useTheme();

  const totalDaysSelected = useMemo(() => {
    if (!start || !end) return 0;
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return diffDays + 1;
  }, [start, end]);

  useEffect(() => {
    if (viewMode === 'monthly' && totalDaysSelected < 30) {
      setViewMode('daily');
    }
  }, [totalDaysSelected, viewMode]);

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setState({
        labels: [],
        values: [],
        comparisonValues: [],
        points: [],
        comparisonPoints: [],
        timezone: 'IST',
        rangeLabel: '',
        comparisonLabel: '',
        error: null,
      });
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);

    const loadData = async () => {
      // optimization: use cached hourly summary if sales + hourly view + single day match
      if (viewMode === 'hourly' && (metric === 'sales' || metric === 'total_sales') && start === end) {
        try {
          const res = await getHourlySalesSummary({ brand_key: brandKey });
          if (!cancelled && res.data && res.data.today && res.data.today.date === start) {
            const todayPoints = res.data.today.data.map(d => ({
              hour: d.hour,
              metrics: {
                sales: d.total_sales,
                orders: d.number_of_orders,
                sessions: d.number_of_sessions,
                atc: d.number_of_atc_sessions
              }
            }));
            const yesterdayPoints = res.data.yesterday.data.map(d => ({
              hour: d.hour,
              metrics: {
                sales: d.total_sales,
                orders: d.number_of_orders,
                sessions: d.number_of_sessions,
                atc: d.number_of_atc_sessions
              }
            }));

            const configNext = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;
            setState({
              labels: todayPoints.map(p => formatHourLabel(p.hour)),
              values: todayPoints.map(p => configNext.accessor(p.metrics)),
              comparisonValues: yesterdayPoints.map(p => configNext.accessor(p.metrics)),
              points: todayPoints,
              comparisonPoints: yesterdayPoints,
              timezone: 'IST',
              rangeLabel: formatRangeLabel({ start: res.data.today.date, end: res.data.today.date }),
              comparisonLabel: formatRangeLabel({ start: res.data.yesterday.date, end: res.data.yesterday.date }),
              error: null
            });
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Optimized fetch failed, falling back', e);
        }
      }

      if (cancelled) return;

      const fetcher = viewMode === 'monthly' ? getMonthlyTrend : (viewMode === 'daily' ? getDailyTrend : getHourlyTrend);
      const base = (viewMode === 'daily' || viewMode === 'monthly')
        ? { start, end }
        : { start, end, aggregate: 'avg-by-hour' };
      const params = brandKey ? { ...base, brand_key: brandKey } : base;

      try {
        const res = await fetcher(params);
        if (cancelled) return;
        if (res?.error) {
          throw new Error('Fetch failed');
        }

        const configNext = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;
        let labels = [];
        let values = [];
        let comparisonValues = [];
        let points = [];
        let comparisonPoints = [];

        if (viewMode === 'daily') {
          const days = Array.isArray(res.days) ? res.days : [];
          const compDays = Array.isArray(res?.comparison?.days) ? res.comparison.days : [];
          const n = Math.min(days.length, compDays.length || days.length);
          const daysAligned = days.slice(0, n);
          const compAligned = compDays.slice(0, n);
          points = daysAligned;
          labels = daysAligned.map((d) => d.date);
          values = daysAligned.map((d) => (configNext.accessor(d?.metrics || {}) || 0));
          comparisonPoints = compAligned;
          comparisonValues = compAligned.map((d) => (configNext.accessor(d?.metrics || {}) || 0));
        } else if (viewMode === 'monthly') {
          points = Array.isArray(res.points) ? res.points : [];
          labels = points.map((p) => p.date);
          values = points.map((p) => configNext.accessor(p.metrics || {}));
          comparisonPoints = Array.isArray(res?.comparison?.points) ? res.comparison.points : [];
          comparisonValues = comparisonPoints.map((p) => configNext.accessor(p.metrics || {}));
        } else {
          points = Array.isArray(res.points) ? res.points : [];
          labels = points.map((p) => formatHourLabel(p.hour));
          values = points.map((p) => configNext.accessor(p.metrics || {}));
          comparisonPoints = Array.isArray(res?.comparison?.points) ? res.comparison.points : [];
          comparisonValues = comparisonPoints.map((p) => configNext.accessor(p.metrics || {}));
        }

        setState({
          labels,
          values,
          comparisonValues,
          points,
          comparisonPoints,
          timezone: res.timezone || 'IST',
          rangeLabel: formatRangeLabel(res.range),
          comparisonLabel: formatRangeLabel(res?.comparison?.range),
          error: null,
        });
        setLoading(false);

      } catch {
        if (!cancelled) {
          setState({
            labels: [],
            values: [],
            comparisonValues: [],
            points: [],
            comparisonPoints: [],
            timezone: 'IST',
            rangeLabel: '',
            comparisonLabel: '',
            error: true,
          });
          setLoading(false);
        }
      }
    };

    loadData();

    return () => { cancelled = true; };
  }, [start, end, metric, viewMode, brandKey, refreshKey]);

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;

  const showBarLabels = (viewMode === 'daily' || viewMode === 'monthly') && totalDaysSelected > 0 && totalDaysSelected <= 31;
  const barLabelColor = theme.palette.mode === 'dark'
    ? theme.palette.grey[100]
    : theme.palette.text.primary;

  const primaryLabel = state.rangeLabel ? `${config.label} (${state.rangeLabel})` : config.label;
  const comparisonLabel = state.comparisonLabel ? `${config.label} (${state.comparisonLabel})` : `${config.label} · Prev window`;

  const datasets = [
    {
      label: primaryLabel,
      data: state.values,
      borderColor: config.color,
      backgroundColor: config.bg,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.25,
    },
  ];

  if (state.comparisonValues.length) {
    datasets.push({
      label: comparisonLabel,
      data: state.comparisonValues,
      borderColor: config.color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 1,
      pointHoverRadius: 3,
      pointHitRadius: 8,
      tension: 0.25,
    });
  }

  const data = {
    labels: state.labels,
    datasets,
  };

  // Stable key for legend effect dependency (avoids re-running on every render)
  const dataKey = `${state.labels.length}|${state.values.length}|${state.comparisonValues.length}|${primaryLabel}|${comparisonLabel}`;

  function formatDay(dateStr, isMonthly = false, point = null) {
    if (!dateStr) return '';

    if (isMonthly && point?.startDate && point?.endDate) {
      const s = new Date(`${point.startDate}T00:00:00Z`);
      const e = new Date(`${point.endDate}T00:00:00Z`);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
        const sMonth = MONTH_NAMES[s.getUTCMonth()];
        const eMonth = MONTH_NAMES[e.getUTCMonth()];
        const sDay = s.getUTCDate();
        const eDay = e.getUTCDate();
        const sYear = s.getUTCFullYear();
        const eYear = e.getUTCFullYear();

        // If same month and year: "Nov 27 – 30, 2025"
        if (sMonth === eMonth && sYear === eYear) {
          return `${sMonth} ${sDay} – ${eDay}, ${sYear}`;
        }
        // If same year: "Nov 27 – Dec 26, 2025"
        if (sYear === eYear) {
          return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
        }
        // Different years: "Dec 27, 2024 – Jan 26, 2025"
        return `${sMonth} ${sDay}, ${sYear} – ${eMonth} ${eDay}, ${eYear}`;
      }
    }

    const dt = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return dateStr;
    if (isMonthly) {
      return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
    }
    return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: false,
        align: 'start',
        position: 'top',
        padding: 16,
        labels: {
          usePointStyle: true,
          pointStyle: 'rectRounded',
          boxWidth: 10,
          boxHeight: 10,
          padding: 18,
          font: { size: 10 },
          generateLabels: (chart) => {
            const labels = defaultLegendLabels(chart);
            return labels.map((item) => ({ ...item, text: `  ${item.text}` }));
          },
        },
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            if (!items || !items.length) return '';
            const idx = items[0].dataIndex;
            if (viewMode === 'daily' || viewMode === 'monthly') {
              const ds = items[0].datasetIndex;
              const point = ds === 0 ? state.points[idx] : state.comparisonPoints[idx];
              return formatDay(point?.date, viewMode === 'monthly', point);
            }
            const point = typeof idx === 'number' ? state.points[idx] : null;
            return point?.label || '';
          },
          label: (ctx) => {
            const value = config.formatter(ctx.parsed.y || 0);
            const datasetLabel = ctx.dataset?.label || config.label;
            if (viewMode === 'daily' || viewMode === 'monthly') {
              return `${datasetLabel}: ${value}`;
            }
            const idx = ctx.dataIndex;
            const label = state.labels[idx] || '';
            return label ? `${datasetLabel}: ${value} · ${label}` : `${datasetLabel}: ${value}`;
          },
        }
      }
    },
    layout: { padding: { top: 12, bottom: 4 } },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 0,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12,
          padding: 2,
          font: { size: 11 },
          color: theme.palette.mode === 'dark' ? '#e0e0e0' : '#666',
        }
      },
      y: {
        grid: { color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
        ticks: {
          padding: 4,
          callback: (v) => config.formatter(v),
          color: theme.palette.mode === 'dark' ? '#e0e0e0' : '#666',
        }
      }
    }
  };

  // ...existing code...

  // Chart ref for legend interaction
  const chartRef = useRef(null);

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              {viewMode === 'daily' ? 'Day-wise trend' : viewMode === 'monthly' ? 'Month-wise trend' : 'Hour-wise trend'} · {config.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Timezone: {state.timezone}
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 136 }} variant="outlined">
            <InputLabel id="trend-view-mode-label" sx={{ fontSize: 12 }}>View</InputLabel>
            <Select
              labelId="trend-view-mode-label"
              id="trend-view-mode"
              value={viewMode}
              label="View"
              onChange={(e) => setViewMode(e.target.value)}
              MenuProps={{
                PaperProps: { sx: { borderRadius: 0, mt: 0.5 } },
                disableScrollLock: true,
              }}
              sx={{
                borderRadius: 999,
                height: 32,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'text.secondary' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                '& .MuiSelect-select': { py: 0.25, px: 1.25, fontSize: 12 },
                '& .MuiSelect-icon': { fontSize: 18 },
              }}
            >
              <MenuItem value="hourly" sx={{ fontSize: 12, py: 0.5 }}>Hourly</MenuItem>
              <MenuItem value="daily" sx={{ fontSize: 12, py: 0.5 }}>Day wise</MenuItem>
              {totalDaysSelected >= 30 && (
                <MenuItem value="monthly" sx={{ fontSize: 12, py: 0.5 }}>Month wise</MenuItem>
              )}
            </Select>
          </FormControl>
        </Box>
        {/* Custom React-rendered legend */}
        <CustomLegend chartRef={chartRef} dataKey={dataKey} />
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={240} />
        ) : state.error ? (
          <Typography variant="body2" color="error.main">Failed to load hourly trend.</Typography>
        ) : state.labels.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No data available.</Typography>
        ) : (
          <div style={{ position: 'relative', flexGrow: 1 }}>
            {(viewMode === 'daily' || viewMode === 'monthly') ? (
              <Bar
                ref={chartRef}
                data={{
                  labels: state.labels.map(d => {
                    const dt = new Date(`${d}T00:00:00Z`);
                    if (viewMode === 'monthly') {
                      return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
                    }
                    return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
                  }),
                  datasets: [
                    {
                      label: primaryLabel,
                      data: state.values,
                      // enable datalabels for primary/current window only
                      datalabels: { display: showBarLabels },
                      backgroundColor: config.color,
                      borderColor: config.color,
                      borderWidth: 1,
                      barPercentage: 0.9,
                      categoryPercentage: 0.8,
                      borderRadius: 2,
                    },
                    ...(state.comparisonValues.length ? [{
                      label: comparisonLabel,
                      data: state.comparisonValues,
                      // explicitly disable datalabels for the previous-window comparison bars
                      datalabels: { display: false },
                      backgroundColor: hexToRgba(config.color, 0.25),
                      borderColor: config.color,
                      borderWidth: 1,
                      barPercentage: 0.9,
                      categoryPercentage: 0.8,
                      borderRadius: 2,
                    }] : []),
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    ...options.plugins,
                    datalabels: {
                      display: showBarLabels,
                      anchor: 'end',
                      align: 'end',
                      formatter: (value) => {
                        const v = value || 0;
                        if (metric === 'cvr' || metric === 'aov') return config.formatter(v);
                        return shortNumberLabel(v);
                      },
                      color: barLabelColor,
                      font: {
                        size: 11,
                        weight: 600,
                        family: theme.typography?.fontFamily || 'sans-serif',
                      },
                      padding: 6,
                    },
                  },
                  layout: options.layout,
                  scales: {
                    x: {
                      stacked: false,
                      grid: { color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                      ticks: { color: theme.palette.mode === 'dark' ? '#e0e0e0' : '#666' },
                    },
                    y: {
                      stacked: false,
                      grid: { display: false },
                      ticks: {
                        callback: (v) => config.formatter(v),
                        color: theme.palette.mode === 'dark' ? '#e0e0e0' : '#666',
                      }
                    },
                  },
                }}
                plugins={[legendPadPlugin]}
              />
            ) : (
              <Line ref={chartRef} data={data} options={options} plugins={[legendPadPlugin]} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
