import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, Tooltip, useTheme } from '@mui/material';
import { GlassChip } from './ui/GlassChip.jsx';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { getPaymentSalesSplit } from '../lib/api.js';

ChartJS.register(ArcElement, ChartTooltip, Legend);

const nfPct1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nfCurrency0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nfCurrencyCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

export default function PaymentSalesSplit({ query }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ cod_sales: 0, prepaid_sales: 0, partial_sales: 0, total: 0, cod_percent: 0, prepaid_percent: 0, partial_percent: 0 });
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;
  const productId = query?.product_id || '';

  useEffect(() => {
    let cancelled = false;
    if (!query?.start || !query?.end) {
      setData({ cod_sales: 0, prepaid_sales: 0, partial_sales: 0, total: 0, cod_percent: 0, prepaid_percent: 0, partial_percent: 0 });
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    const params = {
      start: query.start,
      end: query.end,
      brand_key: brandKey,
      product_id: productId,
      utm_source: query.utm_source,
      utm_medium: query.utm_medium,
      utm_campaign: query.utm_campaign,
      sales_channel: query.sales_channel,
      refreshKey,
    };
    getPaymentSalesSplit(params)
      .then(res => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [query.start, query.end, brandKey, productId, refreshKey, query.utm_source, query.utm_medium, query.utm_campaign, query.sales_channel]);

  const empty = data.total === 0;

  const chartData = {
    labels: ['COD', 'Prepaid', 'Partially paid'],
    datasets: [
      {
        data: [data.cod_sales, data.prepaid_sales, data.partial_sales],
        // Darken partial slice slightly for better contrast (emerald-300)
        backgroundColor: ['#f59e0b', '#10b981', '#6ee7b7'],
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
        labels: {
          color: isDark ? '#e0e0e0' : '#666'
        }
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
    <Card elevation={0} sx={{ backgroundColor: 'transparent', backgroundImage: 'none' }}>
      <CardContent sx={{ minHeight: 260 }}>
        <Typography variant="subtitle2" color="text.primary" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
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
              <GlassChip
                size="small"
                label={`COD ${nfPct1.format(data.cod_percent)}% (${nfCurrencyCompact.format(data.cod_sales)})`}
                color="warning"
                isDark={isDark}
              />
              <GlassChip
                size="small"
                label={`Prepaid ${nfPct1.format(data.prepaid_percent)}% (${nfCurrencyCompact.format(data.prepaid_sales)})`}
                color="success"
                isDark={isDark}
              />
              <GlassChip
                size="small"
                label={`Partial ${nfPct1.format(data.partial_percent)}% (${nfCurrencyCompact.format(data.partial_sales)})`}
                color="primary"
                isDark={isDark}
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
