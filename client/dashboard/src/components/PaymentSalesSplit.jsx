import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, Chip, Tooltip } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { getPaymentSalesSplit } from '../lib/api.js';

ChartJS.register(ArcElement, ChartTooltip, Legend);

const nfInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nfPct1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nfCurrency0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nfCurrencyCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

export default function PaymentSalesSplit({ query }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ cod_sales: 0, prepaid_sales: 0, partial_sales: 0, total: 0, cod_percent: 0, prepaid_percent: 0, partial_percent: 0 });
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;

  useEffect(() => {
    let cancelled = false;
    if (!query?.start || !query?.end) {
      setData({ cod_sales: 0, prepaid_sales: 0, partial_sales: 0, total: 0, cod_percent: 0, prepaid_percent: 0, partial_percent: 0 });
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    const params = brandKey
      ? { start: query.start, end: query.end, brand_key: brandKey }
      : { start: query.start, end: query.end };
    getPaymentSalesSplit(params)
      .then(res => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [query.start, query.end, brandKey, refreshKey]);

  const empty = data.total === 0;

  const colors = useMemo(() => {
    const isDark = theme.palette.mode === 'dark';
    const cod = isDark ? '#facc15' : '#f59e0b';
    const prepaid = isDark ? '#34d399' : '#10b981';
    const partial = isDark ? '#38bdf8' : '#6ee7b7';
    return { cod, prepaid, partial };
  }, [theme]);

  const chipStyles = {
    cod: {
      bgcolor: alpha(colors.cod, theme.palette.mode === 'dark' ? 0.22 : 0.18),
      color: theme.palette.mode === 'dark' ? '#fef08a' : '#7c2d12',
    },
    prepaid: {
      bgcolor: alpha(colors.prepaid, theme.palette.mode === 'dark' ? 0.22 : 0.18),
      color: theme.palette.mode === 'dark' ? '#ecfdf5' : '#065f46',
    },
    partial: {
      bgcolor: alpha(colors.partial, theme.palette.mode === 'dark' ? 0.22 : 0.18),
      color: theme.palette.mode === 'dark' ? '#e0f2fe' : '#0f766e',
    },
  };

  const chartData = {
    labels: ['COD', 'Prepaid', 'Partially paid'],
    datasets: [
      {
        data: [data.cod_sales, data.prepaid_sales, data.partial_sales],
        backgroundColor: [colors.cod, colors.prepaid, colors.partial],
        borderWidth: 0,
      },
    ],
  };

  const options = {
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
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={0.75}
              sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.75, columnGap: 0.75 }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <Chip
                size="small"
                label={`COD ${nfPct1.format(data.cod_percent)}% (${nfCurrencyCompact.format(data.cod_sales)})`}
                sx={{ ...chipStyles.cod, maxWidth: '100%' }}
              />
              <Chip
                size="small"
                label={`Prepaid ${nfPct1.format(data.prepaid_percent)}% (${nfCurrencyCompact.format(data.prepaid_sales)})`}
                sx={{ ...chipStyles.prepaid, maxWidth: '100%' }}
              />
              <Chip
                size="small"
                label={`Partial ${nfPct1.format(data.partial_percent)}% (${nfCurrencyCompact.format(data.partial_sales)})`}
                sx={{ ...chipStyles.partial, maxWidth: '100%' }}
              />
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
