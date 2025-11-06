import { useEffect, useState } from 'react';
import Grid from '@mui/material/Grid2';
import KPIStat from './KPIStat.jsx';
import {
  getTotalOrders,
  getTotalSales,
  getAOV,
  getCVR,
  getCVRDelta,
  getFunnelStats,
  getTotalSalesDelta,
  getTotalSessionsDelta,
  getAtcSessionsDelta,
  getAOVDelta,
} from '../lib/api.js';

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfMoney = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nfMoney2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const nfPct = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

export default function KPIs({ query, selectedMetric, onSelectMetric }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const start = query?.start;
  const end = query?.end;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const range = { start, end };
    Promise.all([
      getTotalOrders(range),
      getTotalSales(range),
      getAOV(range),
      getCVR(range),
      getCVRDelta({ ...range, compare: 'prev-range-avg' }),
      getFunnelStats(range),
      getTotalSalesDelta({ ...range, align: 'hour' }),
      getTotalSessionsDelta({ ...range, compare: 'prev-range-avg' }),
      getAtcSessionsDelta({ ...range, compare: 'prev-range-avg' }),
      getAOVDelta({ ...range, compare: 'prev-range-avg' }),
    ]).then(([orders, sales, aov, cvr, cvrDelta, funnel, salesDelta, sessDelta, atcDelta, aovDelta]) => {
      if (cancelled) return;
      setData({ orders, sales, aov, cvr, cvrDelta, funnel, salesDelta, sessDelta, atcDelta, aovDelta });
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [start, end]);

  const totalSessions = data.cvr?.total_sessions || 0;
  const totalAtcSessions = data.funnel?.total_atc_sessions || 0;

  return (
    <Grid container spacing={1.5} columns={{ xs: 2, sm: 6 }}>
      <Grid size={{ xs: 1, sm: 2 }}>
        <KPIStat
          label="Total Orders"
          value={data.orders?.value ?? 0}
          loading={loading}
          formatter={(v) => nfInt.format(v)}
          onSelect={onSelectMetric ? () => onSelectMetric('orders') : undefined}
          selected={selectedMetric === 'orders'}
        />
      </Grid>
      <Grid size={{ xs: 1, sm: 2 }}>
        <KPIStat
          label="Total Sales"
          value={data.sales?.value ?? 0}
          loading={loading}
          formatter={(v) => nfMoney.format(v)}
          delta={data.salesDelta ? { value: data.salesDelta.diff_pct, direction: data.salesDelta.direction } : undefined}
          onSelect={onSelectMetric ? () => onSelectMetric('sales') : undefined}
          selected={selectedMetric === 'sales'}
        />
      </Grid>
      <Grid size={{ xs: 1, sm: 2 }}>
        <KPIStat
          label="Avg Order Value"
          value={data.aov?.aov ?? 0}
          loading={loading}
          formatter={(v) => nfMoney2.format(v)}
          delta={data.aovDelta ? { value: data.aovDelta.diff_pct, direction: data.aovDelta.direction } : undefined}
        />
      </Grid>
      <Grid size={{ xs: 1, sm: 2 }}>
        <KPIStat
          label="Conversion Rate"
          value={data.cvr?.cvr ?? 0}
          loading={loading}
          formatter={(v) => nfPct.format(v)}
          delta={data.cvrDelta ? { value: data.cvrDelta.diff_pp, direction: data.cvrDelta.direction } : undefined}
          onSelect={onSelectMetric ? () => onSelectMetric('cvr') : undefined}
          selected={selectedMetric === 'cvr'}
        />
      </Grid>
      <Grid size={{ xs: 1, sm: 2 }}>
        <KPIStat
          label="Total Sessions"
          value={totalSessions}
          loading={loading}
          formatter={(v) => nfInt.format(v)}
          delta={data.sessDelta ? { value: data.sessDelta.diff_pct, direction: data.sessDelta.direction } : undefined}
          onSelect={onSelectMetric ? () => onSelectMetric('sessions') : undefined}
          selected={selectedMetric === 'sessions'}
        />
      </Grid>
      <Grid size={{ xs: 1, sm: 2 }}>
        <KPIStat
          label="ATC Sessions"
          value={totalAtcSessions}
          loading={loading}
          formatter={(v) => nfInt.format(v)}
          delta={data.atcDelta ? { value: data.atcDelta.diff_pct, direction: data.atcDelta.direction } : undefined}
          onSelect={onSelectMetric ? () => onSelectMetric('atc') : undefined}
          selected={selectedMetric === 'atc'}
        />
      </Grid>
    </Grid>
  );
}
