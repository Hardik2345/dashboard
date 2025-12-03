import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, useTheme } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { getFunnelStats } from '../lib/api.js';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export default function FunnelChart({ query }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_sessions: 0, total_atc_sessions: 0, total_orders: 0 });
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;

  useEffect(() => {
    let cancelled = false;
    if (!query?.start || !query?.end) {
      setStats({ total_sessions: 0, total_atc_sessions: 0, total_orders: 0 });
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    (async () => {
      const params = brandKey ? { start: query.start, end: query.end, brand_key: brandKey } : { start: query.start, end: query.end };
      const j = await getFunnelStats(params);
      if (cancelled) return;
      if (!j.error) {
        setStats({
          total_sessions: j.total_sessions,
          total_atc_sessions: j.total_atc_sessions,
          total_orders: j.total_orders,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [query.start, query.end, brandKey, refreshKey]);

  const data = {
    labels: ['Sessions', 'Add to Cart', 'Orders'],
    datasets: [
      {
        label: 'Count',
        data: [stats.total_sessions, stats.total_atc_sessions, stats.total_orders],
        backgroundColor: ['#90caf9', '#64b5f6', '#42a5f5'],
        borderRadius: 8,
        barThickness: 40,
      },
    ],
  };

  // Custom plugin to render a single-line label: "count (pct%)" just above each bar
  const valueLabelPlugin = {
    id: 'valueLabelPlugin',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const dataset = chart.data.datasets[0];
      if (!dataset) return;
      const meta = chart.getDatasetMeta(0);
      const totalSessions = stats.total_sessions || 0;
      ctx.save();
      meta.data.forEach((bar, idx) => {
        const raw = dataset.data[idx];
        if (raw == null) return;
        const { x, y } = bar.tooltipPosition();
        // Percentage relative to sessions (first bar always 100%)
        const pct = idx === 0 ? 100 : (totalSessions > 0 ? (raw / totalSessions) * 100 : 0);
        const pctText = `${pct.toFixed(pct >= 99.95 || pct === 0 ? 0 : 1)}%`;
        const countText = nfInt.format(raw);
        ctx.textAlign = 'center';
        ctx.fillStyle = isDark ? '#ffffffff' : '#0d47a1';
        // Single line: count (xx%)
        ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${countText} (${pctText})`, x, y - 10);
      });
      ctx.restore();
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
  layout: { padding: { top: 30 } }, // reduced space for single-line labels
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${nfInt.format(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { 
        grid: { display: false },
        ticks: { color: isDark ? '#e0e0e0' : '#666' }
      },
      y: { 
        beginAtZero: true, 
        grid: { display: false }, 
        border: { display: false },
        ticks: { color: isDark ? '#e0e0e0' : '#666' }
      },
    },
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ height: 320, pt: 1 }}>
        <Typography variant="subtitle2" color="text.primary" sx={{ mb: 0.5 }}>
          Session drop-offs
        </Typography>
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={268} />
        ) : (
          <div style={{ position: 'relative', height: 268 }}>
            <Bar data={data} options={options} plugins={[valueLabelPlugin]} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
