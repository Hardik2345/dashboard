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

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, BarElement);
const defaultLegendLabels = ChartJS.defaults.plugins.legend.labels.generateLabels;

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
    fetcher({ start, end }).then((res) => {
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
        points = days; // reuse naming for simplicity
        labels = days.map((d) => d.date);
        // Always use total sales for daily view
        values = days.map((d) => (d?.metrics?.sales ?? 0));
        const compDays = Array.isArray(res?.comparison?.days) ? res.comparison.days : [];
        comparisonPoints = [];
        comparisonValues = [];
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
  const renderConfig = viewMode === 'daily' ? METRIC_CONFIG.sales : config;

  const primaryLabel = state.rangeLabel ? `${renderConfig.label} (${state.rangeLabel})` : renderConfig.label;
  const comparisonLabel = state.comparisonLabel ? `${renderConfig.label} (${state.comparisonLabel})` : `${renderConfig.label} · Prev window`;

  const datasets = [
    {
      label: primaryLabel,
      data: state.values,
  borderColor: renderConfig.color,
  backgroundColor: renderConfig.bg,
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
  borderColor: renderConfig.color,
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
            const idx = items?.[0]?.dataIndex;
            const point = typeof idx === 'number' ? state.points[idx] : null;
            return point?.label || '';
          },
          label: (ctx) => {
            const idx = ctx.dataIndex;
            const label = state.labels[idx] || '';
            const value = renderConfig.formatter(ctx.parsed.y || 0);
            const datasetLabel = ctx.dataset?.label || renderConfig.label;
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
        ticks: { padding: 4, callback: (v) => renderConfig.formatter(v) }
      }
    }
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
          Hour-wise trend · {config.label}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Timezone: {state.timezone}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 136 }} variant="outlined">
            <InputLabel id="trend-view-mode-label" sx={{ fontSize: 12 }}>View</InputLabel>
            <Select
              labelId="trend-view-mode-label"
              id="trend-view-mode"
              value={viewMode}
              label="View"
              onChange={(e) => setViewMode(e.target.value)}
              MenuProps={{
                PaperProps: { sx: { borderRadius: 2, mt: 0.5 } },
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
                      backgroundColor: renderConfig.color,
                      borderColor: renderConfig.color,
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  indexAxis: 'y',
                  plugins: { ...options.plugins, legend: { display: false } },
                  layout: options.layout,
                  scales: {
                    x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => renderConfig.formatter(v) } },
                    y: { grid: { display: false } },
                  },
                }}
              />
            ) : (
              <Line data={data} options={options} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
