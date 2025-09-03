import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, Chip } from '@mui/material';
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
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ cod_orders: 0, prepaid_orders: 0, total: 0, cod_percent: 0, prepaid_percent: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOrderSplit(query)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [query.start, query.end]);

  const empty = data.total === 0;

  const chartData = {
    labels: ['Payment split'],
    datasets: [
      {
        label: 'COD',
        data: [data.cod_percent],
        backgroundColor: '#f59e0b',
        borderRadius: 8,
        barThickness: 28,
        stack: 'percent',
      },
      {
        label: 'Prepaid',
        data: [data.prepaid_percent],
        backgroundColor: '#10b981',
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
      legend: { display: true, position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label || '';
            const isCod = label === 'COD';
            const count = isCod ? data.cod_orders : data.prepaid_orders;
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
      y: { stacked: true, grid: { display: false }, border: { display: false } },
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
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" label={`COD ${nfPct1.format(data.cod_percent)}% (${nfInt.format(data.cod_orders)})`} sx={{ bgcolor: '#fff7ed', color: '#92400e' }} />
              <Chip size="small" label={`Prepaid ${nfPct1.format(data.prepaid_percent)}% (${nfInt.format(data.prepaid_orders)})`} sx={{ bgcolor: '#ecfdf5', color: '#065f46' }} />
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
