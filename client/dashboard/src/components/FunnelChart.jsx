import { Card, CardContent, Typography, Skeleton, useTheme } from '@mui/material';
import { Bar } from 'react-chartjs-2';
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

/**
 * FunnelChart displays session drop-off visualization.
 * Data is passed from parent via funnelData prop (from KPIs component)
 * to avoid redundant API calls.
 */
export default function FunnelChart({ funnelData }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const loading = funnelData?.loading ?? true;
  const stats = funnelData?.stats || { total_sessions: 0, total_atc_sessions: 0, total_orders: 0 };
  const deltas = funnelData?.deltas || { sessions: null, atc: null, orders: null };

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

  /**
   * Helper function to draw trend arrows on canvas
   */
  const drawTrendArrow = (ctx, delta, x, y) => {
    if (!delta || typeof delta.diff_pct !== 'number') return;

    const val = delta.diff_pct;
    const isUp = delta.direction === 'up';
    const isDown = delta.direction === 'down';

    ctx.save();
    ctx.font = '700 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    if (isUp) {
      ctx.fillStyle = theme.palette.success.main;
      ctx.fillText(`▲ ${Math.abs(val).toFixed(1)}%`, x, y);
    } else if (isDown) {
      ctx.fillStyle = theme.palette.error.main;
      ctx.fillText(`▼ ${Math.abs(val).toFixed(1)}%`, x, y);
    } else {
      ctx.fillStyle = theme.palette.text.secondary;
      ctx.fillText(`${Math.abs(val).toFixed(1)}%`, x, y);
    }
    ctx.restore();
  };

  // Custom plugin to render:
  // 1. "count (pct%)"
  // 2. Trend arrow + % change
  const valueLabelPlugin = {
    id: 'valueLabelPlugin',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const dataset = chart.data.datasets[0];
      if (!dataset) return;
      const meta = chart.getDatasetMeta(0);
      const totalSessions = stats.total_sessions || 0;

      const deltaList = [deltas.sessions, deltas.atc, deltas.orders];

      ctx.save();
      meta.data.forEach((bar, idx) => {
        const raw = dataset.data[idx];
        if (raw == null) return;
        const { x, y } = bar.tooltipPosition();

        // --- Line 1: Count (xx%) ---
        const pct = idx === 0 ? 100 : (totalSessions > 0 ? (raw / totalSessions) * 100 : 0);
        const pctText = `${pct.toFixed(pct >= 99.95 || pct === 0 ? 0 : 1)}%`;
        const countText = nfInt.format(raw);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Main text color
        ctx.fillStyle = isDark ? '#ffffffff' : '#0d47a1';
        ctx.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        // Position it a bit higher to make room for the trend line
        ctx.fillText(`${countText} (${pctText})`, x, y - 20);

        // --- Line 2: Trend Delta via Helper ---
        drawTrendArrow(ctx, deltaList[idx], x, y - 6);
      });
      ctx.restore();
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 55 } }, // increased space for labels
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
