import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, Chip, Tooltip } from '@mui/material';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { getPaymentSalesSplit } from '../lib/api.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const nfInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nfPct1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nfCurrency0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function PaymentSalesSplit({ query }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ cod_sales: 0, prepaid_sales: 0, total: 0, cod_percent: 0, prepaid_percent: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPaymentSalesSplit(query)
      .then(res => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [query.start, query.end]);

  const empty = data.total === 0;

  const chartData = {
    labels: ['COD', 'Prepaid'],
    datasets: [
      {
        data: [data.cod_sales, data.prepaid_sales],
        backgroundColor: ['#f59e0b', '#10b981'],
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const label = ctx.label;
            const raw = ctx.parsed;
            const pct = data.total > 0 ? (raw / data.total) * 100 : 0;
            return `${label}: ${nfCurrency0.format(raw)} (${nfPct1.format(pct)}%)`;
          }
        }
      }
    }
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 260 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
          Payment split (By Sales)
          <Tooltip title="Does not include cancelled orders" arrow placement="right">
            <Typography component="span" variant="inherit" sx={{ fontWeight: 'bold', ml: 0.5, cursor: 'help' }}>*</Typography>
          </Tooltip>
        </Typography>
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={180} />
        ) : empty ? (
          <Typography variant="body2" color="text.secondary">No sales in selected range.</Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
              <Chip size="small" label={`COD ${nfPct1.format(data.cod_percent)}% (${nfCurrency0.format(data.cod_sales)})`} sx={{ bgcolor: '#fff7ed', color: '#92400e' }} />
              <Chip size="small" label={`Prepaid ${nfPct1.format(data.prepaid_percent)}% (${nfCurrency0.format(data.prepaid_sales)})`} sx={{ bgcolor: '#ecfdf5', color: '#065f46' }} />
            </Stack>
            <div style={{ position: 'relative', height: 180 }}>
              <Doughnut data={chartData} options={options} />
            </div>
          </>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          * Cancellations not included.
        </Typography>
      </CardContent>
    </Card>
  );
}
