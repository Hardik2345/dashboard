import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, Chip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { getOrderSplit } from '../lib/api.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfPct1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export default function OrderSplit({ query }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ cod_orders: 0, prepaid_orders: 0, partially_paid_orders: 0, total: 0, cod_percent: 0, prepaid_percent: 0, partially_paid_percent: 0 });
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;

  useEffect(() => {
    let cancelled = false;
    if (!query?.start || !query?.end) {
      setData({ cod_orders: 0, prepaid_orders: 0, partially_paid_orders: 0, total: 0, cod_percent: 0, prepaid_percent: 0, partially_paid_percent: 0 });
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    const params = brandKey
      ? { start: query.start, end: query.end, brand_key: brandKey }
      : { start: query.start, end: query.end };
    getOrderSplit(params)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [query.start, query.end, brandKey, refreshKey]);

  const empty = data.total === 0;

  const colors = useMemo(() => {
    const isDark = theme.palette.mode === 'dark';
    const cod = isDark ? '#fbbf24' : '#f59e0b';
    const prepaid = isDark ? '#34d399' : '#10b981';
    const partial = isDark ? '#38bdf8' : '#6ee7b7';
    return { cod, prepaid, partial };
  }, [theme]);

  const chipStyles = {
    cod: {
      bgcolor: alpha(colors.cod, theme.palette.mode === 'dark' ? 0.18 : 0.16),
      color: theme.palette.mode === 'dark' ? '#fef3c7' : '#7c2d12',
    },
    prepaid: {
      bgcolor: alpha(colors.prepaid, theme.palette.mode === 'dark' ? 0.2 : 0.18),
      color: theme.palette.mode === 'dark' ? '#ecfdf5' : '#065f46',
    },
    partial: {
      bgcolor: alpha(colors.partial, theme.palette.mode === 'dark' ? 0.2 : 0.18),
      color: theme.palette.mode === 'dark' ? '#e0f2fe' : '#0f766e',
    },
  };

  const chartData = {
    labels: ['Payment split'],
    datasets: [
      {
        label: 'COD',
        data: [data.cod_percent],
        backgroundColor: colors.cod,
        borderRadius: 8,
        barThickness: 28,
        stack: 'percent',
      },
      {
        label: 'Prepaid',
        data: [data.prepaid_percent],
        backgroundColor: colors.prepaid,
        borderRadius: 8,
        barThickness: 28,
        stack: 'percent',
      },
      {
        label: 'Partially paid',
        data: [data.partially_paid_percent],
        backgroundColor: colors.partial,
        borderRadius: 8,
        barThickness: 28,
        stack: 'percent',
      },
    ],
  };

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { color: theme.palette.text.secondary },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label || '';
            let count = 0;
            if (label === 'COD') count = data.cod_orders;
            else if (label === 'Prepaid') count = data.prepaid_orders;
            else if (label === 'Partially paid') count = data.partially_paid_orders;
            const pct = ctx.parsed.x;
            return `${label}: ${nfInt.format(count)} (${nfPct1.format(pct)}%)`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        max: 100,
        ticks: { display: false },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        stacked: true,
        grid: { display: false },
        border: { display: false },
        ticks: { color: theme.palette.text.secondary },
      },
    },
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 180 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Payment split (By Order Count)
        </Typography>
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={120} />
        ) : empty ? (
          <Typography variant="body2" color="text.secondary">No orders in selected range.</Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.5, columnGap: 0.5 }}>
              <Chip size="small" label={`COD ${nfPct1.format(data.cod_percent)}% (${nfInt.format(data.cod_orders)})`} sx={chipStyles.cod} />
              <Chip size="small" label={`Prepaid ${nfPct1.format(data.prepaid_percent)}% (${nfInt.format(data.prepaid_orders)})`} sx={chipStyles.prepaid} />
              <Chip size="small" label={`Partially paid ${nfPct1.format(data.partially_paid_percent)}% (${nfInt.format(data.partially_paid_orders)})`} sx={chipStyles.partial} />
            </Stack>
            <div style={{ position: 'relative', height: 120 }}>
              <Bar data={chartData} options={options} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
