import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Box } from '@mui/material';
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
    key: 'sales',
    title: 'Total Sales',
    color: '#0b6bcb',
    background: 'rgba(11,107,203,0.1)',
    accessor: (metrics) => metrics?.sales ?? 0,
    formatter: (value) => nfCurrency0.format(value || 0),
  },
  sessions: {
    key: 'sessions',
    title: 'Total Sessions',
    color: '#2563eb',
    background: 'rgba(37,99,235,0.10)',
    accessor: (metrics) => metrics?.sessions ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
  cvr: {
    key: 'cvr',
    title: 'Conversion Rate',
    color: '#7c3aed',
    background: 'rgba(124,58,237,0.12)',
    accessor: (metrics) => metrics?.cvr ?? 0,
    formatter: (value) => nfPercent1.format(value || 0),
  },
  atc: {
    key: 'atc',
    title: 'ATC Sessions',
    color: '#16a34a',
    background: 'rgba(22,163,74,0.12)',
    accessor: (metrics) => metrics?.atc ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
};

export default function HourlyMetricTrend({ query, metric = 'sales' }) {
  const [state, setState] = useState({ loading: true, points: [], timezone: 'IST', error: null });
  const start = query?.start;
  const end = query?.end;

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setState((prev) => ({ ...prev, loading: false, points: [], error: null }));
      return () => { cancelled = true; };
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    getHourlyTrend({ start, end }).then((res) => {
      if (cancelled) return;
      if (res?.error) {
        setState({ loading: false, points: [], timezone: 'IST', error: true });
        return;
      }
      setState({ loading: false, points: res.points || [], timezone: res.timezone || 'IST', error: null });
    }).catch(() => {
      if (!cancelled) {
        setState({ loading: false, points: [], timezone: 'IST', error: true });
      }
    });
    return () => { cancelled = true; };
  }, [start, end]);

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;

  const chartData = useMemo(() => {
    const labels = state.points.map((p) => p.label);
    const values = state.points.map((p) => {
      const metrics = p.metrics || {};
      return config.accessor(metrics);
    });
    return { labels, values };
  }, [state.points, config]);

  const data = useMemo(() => ({
    labels: chartData.labels,
    datasets: [
      {
        label: config.title,
        data: chartData.values,
        borderColor: config.color,
        backgroundColor: config.background,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.25,
      },
    ],
  }), [chartData, config]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${config.title}: ${config.formatter(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, minRotation: 0 },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: {
          callback: (value) => config.formatter(value),
        },
      },
    },
  }), [config]);

  const showEmpty = !state.loading && !state.error && chartData.labels.length === 0;

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
          Hour-wise trend · {config.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
          Timezone: {state.timezone}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5 }}>
          Tap a KPI card to switch metrics.
        </Typography>
        {state.loading ? (
          <Skeleton variant="rounded" width="100%" height={240} />
        ) : state.error ? (
          <Typography variant="body2" color="error.main">Failed to load hourly trend.</Typography>
        ) : showEmpty ? (
          <Typography variant="body2" color="text.secondary">No hourly data available for this range.</Typography>
        ) : (
          <Box sx={{ position: 'relative', flexGrow: 1 }}>
            <Line data={data} options={options} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
