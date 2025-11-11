import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, Typography, Skeleton } from '@mui/material';
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
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_sessions: 0, total_atc_sessions: 0, total_orders: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const j = await getFunnelStats({ start: query.start, end: query.end });
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
  }, [query.start, query.end]);

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

  // Custom plugin to render percentage (relative to total sessions) and raw value above each bar
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
        ctx.fillStyle = '#0d47a1';
        // Percentage (upper line)
        ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(pctText, x, y - 22);
        // Raw count (lower line)
        ctx.font = '500 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(countText, x, y - 8);
      });
      ctx.restore();
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 44 } }, // extra space for two-line labels (percent + count)
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${nfInt.format(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { display: false }, border: { display: false } },
    },
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ height: 320, pt: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
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
