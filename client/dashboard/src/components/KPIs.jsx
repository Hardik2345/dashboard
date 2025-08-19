import { useEffect, useMemo, useState } from 'react';
import Grid from '@mui/material/Grid2';
import KPIStat from './KPIStat.jsx';
import { getTotalOrders, getTotalSales, getAOV, getCVR } from '../lib/api.js';

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfMoney = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nfMoney2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const nfPct = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

export default function KPIs({ query }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getTotalOrders(query),
      getTotalSales(query),
      getAOV(query),
      getCVR(query)
    ]).then(([orders, sales, aov, cvr]) => {
      if (cancelled) return;
      setData({ orders, sales, aov, cvr });
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [query.start, query.end]);

  return (
    <Grid container spacing={1.5} columns={{ xs: 2 }}>
      <Grid size={1}>
        <KPIStat
          label="Total Orders"
          value={data.orders?.value ?? 0}
          loading={loading}
          formatter={(v) => nfInt.format(v)}
        />
      </Grid>
      <Grid size={1}>
        <KPIStat
          label="Total Sales"
          value={data.sales?.value ?? 0}
          loading={loading}
          formatter={(v) => nfMoney.format(v)}
        />
      </Grid>
      <Grid size={1}>
        <KPIStat
          label="Avg Order Value"
          value={data.aov?.aov ?? 0}
          loading={loading}
          formatter={(v) => nfMoney2.format(v)}
        />
      </Grid>
      <Grid size={1}>
        <KPIStat
          label="Conversion Rate"
          value={data.cvr?.cvr ?? 0}
          loading={loading}
          formatter={(v) => nfPct.format(v)}
        />
      </Grid>
    </Grid>
  );
}
