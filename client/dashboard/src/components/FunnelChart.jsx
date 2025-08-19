import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, Typography, Skeleton } from '@mui/material';
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

export default function FunnelChart({ query }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total_sessions: 0, total_atc_sessions: 0, total_orders: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3000'}/metrics/funnel-stats?start=${encodeURIComponent(query.start || '')}&end=${encodeURIComponent(query.end || '')}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        setStats({
          total_sessions: Number(j?.total_sessions || 0),
          total_atc_sessions: Number(j?.total_atc_sessions || 0),
          total_orders: Number(j?.total_orders || 0),
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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
      <CardContent sx={{ height: 320 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Session drop-offs
        </Typography>
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={260} />
        ) : (
          <div style={{ position: 'relative', height: 260 }}>
            <Bar data={data} options={options} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
