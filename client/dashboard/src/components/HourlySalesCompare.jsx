import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Skeleton } from '@mui/material';
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
import { getHourlySalesCompare } from '../lib/api.js';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const nfCurrency0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function HourlySalesCompare({ hours = 6 }) {
  const [loading, setLoading] = useState(true);
  const [labels, setLabels] = useState([]);
  const [current, setCurrent] = useState([]);
  const [yesterday, setYesterday] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHourlySalesCompare({ hours }).then(res => {
      if (cancelled) return;
      setLabels(res.labels || []);
      setCurrent(res.current || []);
      setYesterday(res.yesterday || []);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [hours]);

  const data = {
    labels,
    datasets: [
      {
        label: 'Today',
        data: current,
        borderColor: '#0b6bcb',
        backgroundColor: 'rgba(11,107,203,0.1)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
      },
      {
        label: 'Yesterday',
        data: yesterday,
        borderColor: '#9ca3af',
        backgroundColor: 'rgba(156,163,175,0.1)',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 2,
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${nfCurrency0.format(ctx.parsed.y || 0)}`,
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          callback: (v) => nfCurrency0.format(v),
        }
      }
    }
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 280 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Sales last {hours} hours vs same hours yesterday
        </Typography>
        {loading ? (
          <Skeleton variant="rounded" width="100%" height={220} />
        ) : labels.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No data available.</Typography>
        ) : (
          <div style={{ position: 'relative', height: 220 }}>
            <Line data={data} options={options} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
