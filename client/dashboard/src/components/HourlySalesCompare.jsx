import { useEffect, useMemo, useState } from 'react';
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

function formatLabels(points) {
  if (!Array.isArray(points) || !points.length) return [];
  const timeFormatter = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    hour12: true,
  });
  const dayFormatter = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    day: 'numeric',
  });
  return points.map((point, idx) => {
    const [year, month, day] = (point.date || '').split('-').map(Number);
    const hour = typeof point.hour === 'number' ? point.hour : Number(point.hour || 0);
    const utcDate = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1, hour || 0, 0, 0, 0));
    const base = timeFormatter.format(utcDate);
    if (idx === 0 || points[idx - 1]?.date !== point.date) {
      return `${dayFormatter.format(utcDate)} ${base}`;
    }
    return base;
  });
}

export default function HourlySalesCompare({ query, metric = 'sales' }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({ points: [], timezone: 'IST', error: null });
  const start = query?.start;
  const end = query?.end;

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setState({ points: [], timezone: 'IST', error: null });
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    getHourlyTrend({ start, end }).then((res) => {
      if (cancelled) return;
      if (res?.error) {
        setState({ points: [], timezone: 'IST', error: true });
        setLoading(false);
        return;
      }
      setState({ points: Array.isArray(res.points) ? res.points : [], timezone: res.timezone || 'IST', error: null });
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setState({ points: [], timezone: 'IST', error: true });
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [start, end]);

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;
  const labels = useMemo(() => formatLabels(state.points), [state.points]);
  const values = useMemo(
    () => state.points.map((p) => config.accessor(p.metrics || {})),
    [state.points, config]
  );

  const data = useMemo(() => ({
    labels,
    datasets: [
      {
        label: config.label,
        data: values,
        borderColor: config.color,
        backgroundColor: config.bg,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        cubicInterpolationMode: 'monotone',
        tension: 0.4,
      },
    ],
  }), [labels, values, config]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    elements: { point: { radius: 0, hoverRadius: 0 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${config.label}: ${config.formatter(ctx.parsed.y || 0)}`,
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
          callback: (value, index) => (index % 2 === 0 ? labels[index] : ''),
        },
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          callback: (v) => config.formatter(v),
        }
      }
    }
  }), [config, labels]);

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
        ) : state.points.length === 0 ? (
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
