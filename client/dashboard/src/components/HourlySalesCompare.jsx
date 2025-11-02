import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Skeleton } from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { getHourlyTrend } from '../lib/api.js';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

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
    getHourlyTrend({ start, end }).then((res) => {
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
      const points = Array.isArray(res.points) ? res.points : [];
      const labels = points.map((p) => formatHourLabel(p.hour));
      const values = points.map((p) => configNext.accessor(p.metrics || {}));
      const comparisonPoints = Array.isArray(res?.comparison?.points) ? res.comparison.points : [];
      const comparisonValues = comparisonPoints.map((p) => configNext.accessor(p.metrics || {}));
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
  }, [start, end, metric]);

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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: Boolean(state.comparisonValues.length),
        align: 'start',
        labels: { usePointStyle: true, boxWidth: 6 },
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
            const value = config.formatter(ctx.parsed.y || 0);
            const datasetLabel = ctx.dataset?.label || config.label;
            return label ? `${datasetLabel}: ${value} · ${label}` : `${datasetLabel}: ${value}`;
          },
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxRotation: 0,
          minRotation: 0,
          autoSkip: false,
          callback: (value, index) => {
            const total = state.labels.length || 1;
            const maxTicks = 8;
            const step = Math.max(1, Math.ceil(total / maxTicks));
            if (index % step === 0 || index === total - 1) {
              return state.labels[index] || value;
            }
            return '';
          },
        }
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          callback: (v) => config.formatter(v),
        }
      }
    }
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
          Hour-wise trend · {config.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
          Timezone: {state.timezone}
        </Typography>
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={240} />
        ) : state.error ? (
          <Typography variant="body2" color="error.main">Failed to load hourly trend.</Typography>
        ) : state.labels.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No data available.</Typography>
        ) : (
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Line data={data} options={options} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
