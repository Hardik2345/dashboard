import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Box, FormControl, Select, MenuItem, InputLabel } from '@mui/material';
import { Line, Bar } from 'react-chartjs-2';
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
import { getHourlyTrend, getDailyTrend } from '../lib/api.js';

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha || 1})`;
  const clean = hex.replace('#','');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map(c=>c+c).join('') : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, BarElement);
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
const nfInt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfPercent1 = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

const METRIC_CONFIG = {
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
  return `${normalized} ${suffix}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
  const [viewMode, setViewMode] = useState('hourly'); // 'hourly' | 'daily'
  const start = query?.start;
  const end = query?.end;

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
  const fetcher = viewMode === 'daily' ? getDailyTrend : getHourlyTrend;
  const params = viewMode === 'daily' ? { start, end } : { start, end, aggregate: 'avg-by-hour' };
  fetcher(params).then((res) => {
      if (cancelled) return;
      if (res?.error) {
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
        return;
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
        // Align by index (day 1 with previous window day 1, etc.) and trim to shortest length
        const n = Math.min(days.length, compDays.length || days.length);
        const daysAligned = days.slice(0, n);
        const compAligned = compDays.slice(0, n);
        points = daysAligned; // reuse naming for simplicity
        labels = daysAligned.map((d) => d.date);
        // Use selected metric for daily view
        values = daysAligned.map((d) => (configNext.accessor(d?.metrics || {}) || 0));
        comparisonPoints = compAligned;
        comparisonValues = compAligned.map((d) => (configNext.accessor(d?.metrics || {}) || 0));
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
    }).catch(() => {
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
    });
    return () => { cancelled = true; };
  }, [start, end, metric, viewMode]);

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;

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

  function formatDay(dateStr) {
    if (!dateStr) return '';
    const dt = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return dateStr;
    return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: Boolean(state.comparisonValues.length),
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
            if (viewMode === 'daily') {
              const ds = items[0].datasetIndex;
              const dateStr = ds === 0 ? state.points[idx]?.date : state.comparisonPoints[idx]?.date;
              return formatDay(dateStr);
            }
            const point = typeof idx === 'number' ? state.points[idx] : null;
            return point?.label || '';
          },
          label: (ctx) => {
            const value = config.formatter(ctx.parsed.y || 0);
            const datasetLabel = ctx.dataset?.label || config.label;
            if (viewMode === 'daily') {
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
          autoSkip: false,
          padding: 4,
          callback: (value, index) => {
            const total = state.labels.length || 1;
            const maxTicks = 8;
            const step = Math.max(1, Math.ceil(total / maxTicks));
            if (index === total - 1) return state.labels[index] || value;
            if (index % step === 0) {
              const distanceToEnd = (total - 1) - index;
              if (distanceToEnd <= step / 2) return '';
              return state.labels[index] || value;
            }
            return '';
          },
        }
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { padding: 4, callback: (v) => config.formatter(v) }
      }
    }
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              Hour-wise trend · {config.label}
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
            </Select>
          </FormControl>
        </Box>
        
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={240} />
        ) : state.error ? (
          <Typography variant="body2" color="error.main">Failed to load hourly trend.</Typography>
        ) : state.labels.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No data available.</Typography>
        ) : (
          <div style={{ position: 'relative', flexGrow: 1 }}>
            {viewMode === 'daily' ? (
              <Bar
                data={{
                  labels: state.labels.map(d => {
                    const dt = new Date(`${d}T00:00:00Z`);
                    return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
                  }),
                  datasets: [
                    {
                      label: primaryLabel,
                      data: state.values,
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
                  plugins: options.plugins,
                  layout: options.layout,
                  scales: {
                    x: { stacked: false, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { stacked: false, grid: { display: false }, ticks: { callback: (v) => config.formatter(v) } },
                  },
                }}
                plugins={[legendPadPlugin]}
              />
            ) : (
              <Line data={data} options={options} plugins={[legendPadPlugin]} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
