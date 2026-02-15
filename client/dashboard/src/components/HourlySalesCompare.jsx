import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Box, FormControl, Select, MenuItem, InputLabel, Stack } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { getHourlyTrend, getDailyTrend, getMonthlyTrend, getHourlySalesSummary } from '../lib/api.js';

const nfCurrency0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nfCurrency2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const nfInt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfPercent1 = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 });

const METRIC_CONFIG = {
  aov: {
    label: 'Avg Order Value',
    color: '#f59e0b', // amber-500
    accessor: (metrics) => {
      const sales = Number(metrics?.sales || 0);
      const orders = Number(metrics?.orders || 0);
      return orders > 0 ? sales / orders : 0;
    },
    formatter: (value) => nfCurrency2.format(value || 0),
  },
  orders: {
    label: 'Total Orders',
    color: '#0ea5e9', // sky-500
    accessor: (metrics) => metrics?.orders ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
  sales: {
    label: 'Total Sales',
    color: '#0b6bcb', // blue-600 (Mui primary)
    accessor: (metrics) => metrics?.sales ?? 0,
    formatter: (value) => nfCurrency0.format(value || 0),
  },
  sessions: {
    label: 'Total Sessions',
    color: '#3b82f6', // blue-500
    accessor: (metrics) => metrics?.sessions ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
  cvr: {
    label: 'Conversion Rate',
    color: '#8b5cf6', // violet-500
    accessor: (metrics) => metrics?.cvr_ratio ?? 0,
    formatter: (value) => nfPercent1.format(value || 0),
  },
  atc: {
    label: 'ATC Sessions',
    color: '#10b981', // emerald-500
    accessor: (metrics) => metrics?.atc ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
};

const CustomTooltip = ({ active, payload, label, formatter }) => {
  const theme = useTheme();
  if (!active || !payload || !payload.length) return null;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        boxShadow: theme.shadows[3],
        p: 1.5,
        minWidth: 160,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {label}
      </Typography>
      {payload.map((entry, index) => (
        <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: entry.color,
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
            {entry.name}:
          </Typography>
          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, ml: 'auto' }}>
            {formatter(entry.value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

function formatHourLabel(hour) {
  const normalized = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour >= 12 ? 'pm' : 'am';
  return `${normalized}${suffix}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRangeLabel(range) {
  if (!range || !range.start || !range.end) return '';
  const startDate = new Date(`${range.start}T00:00:00Z`);
  const endDate = new Date(`${range.end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';
  const sMonth = MONTH_NAMES[startDate.getUTCMonth()] || '';
  const eMonth = MONTH_NAMES[endDate.getUTCMonth()] || '';
  const sDay = startDate.getUTCDate();
  const eDay = endDate.getUTCDate();
  const sYear = startDate.getUTCFullYear();
  const eYear = endDate.getUTCFullYear();
  if (range.start === range.end) {
    return `${sMonth} ${sDay}, ${sYear}`;
  }
  if (sYear === eYear) {
    if (startDate.getUTCMonth() === endDate.getUTCMonth()) {
      return `${sMonth} ${sDay}-${eDay}, ${sYear}`;
    }
    return `${sMonth} ${sDay} - ${eMonth} ${eDay}, ${sYear}`;
  }
  return `${sMonth} ${sDay}, ${sYear} - ${eMonth} ${eDay}, ${eYear}`;
}

export default function HourlySalesCompare({ query, metric = 'sales' }) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [meta, setMeta] = useState({ timezone: 'IST', rangeLabel: '', comparisonLabel: '', error: null });
  const [viewMode, setViewMode] = useState('hourly'); // 'hourly' | 'daily' | 'monthly'
  const start = query?.start;
  const end = query?.end;
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;
  const utmSource = query?.utm_source;
  const utmMedium = query?.utm_medium;
  const utmCampaign = query?.utm_campaign;
  const salesChannel = query?.sales_channel;
  const productId = query?.product_id;
  const compare = query?.compare;
  const theme = useTheme();

  const totalDaysSelected = useMemo(() => {
    if (!start || !end) return 0;
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return diffDays + 1;
  }, [start, end]);

  useEffect(() => {
    if (viewMode === 'monthly' && totalDaysSelected < 30) {
      setViewMode('daily');
    }
  }, [totalDaysSelected, viewMode]);

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setChartData([]);
      setMeta({ timezone: 'IST', rangeLabel: '', comparisonLabel: '', error: null });
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);

    const loadData = async () => {
      const utmParams = { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, sales_channel: salesChannel, product_id: productId };
      const configNext = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;

      // optimization: use cached hourly summary
      if (viewMode === 'hourly' && (metric === 'sales' || metric === 'total_sales') && start === end && !utmParams.utm_source && !utmParams.utm_medium && !compare) {
        try {
          const res = await getHourlySalesSummary({ brand_key: brandKey });
          if (!cancelled && res.data && res.data.today && res.data.today.date === start) {
            let todayPoints = res.data.today.data.map(d => ({
              hour: d.hour,
              metrics: { sales: d.total_sales, orders: d.number_of_orders, sessions: d.number_of_sessions, atc: d.number_of_atc_sessions }
            }));
            const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            if (viewMode === 'hourly' && start === todayIST) {
              const currentHour = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: 'numeric' }));
              todayPoints = todayPoints.filter(p => p.hour <= currentHour);
            }
            const yesterdayPoints = res.data.yesterday.data.map(d => ({
              hour: d.hour,
              metrics: { sales: d.total_sales, orders: d.number_of_orders, sessions: d.number_of_sessions, atc: d.number_of_atc_sessions }
            }));

            // Transform to Recharts format
            const data = todayPoints.map((p, i) => ({
              label: formatHourLabel(p.hour),
              value: configNext.accessor(p.metrics),
              comparisonValue: yesterdayPoints[i] ? configNext.accessor(yesterdayPoints[i].metrics) : null
            }));

            setChartData(data);
            setMeta({
              timezone: 'IST',
              rangeLabel: formatRangeLabel({ start: res.data.today.date, end: res.data.today.date }),
              comparisonLabel: formatRangeLabel({ start: res.data.yesterday.date, end: res.data.yesterday.date }),
              error: null
            });
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Optimized fetch failed, falling back', e);
        }
      }

      if (cancelled) return;

      const fetcher = viewMode === 'monthly' ? getMonthlyTrend : (viewMode === 'daily' ? getDailyTrend : getHourlyTrend);
      const base = (viewMode === 'daily' || viewMode === 'monthly')
        ? { start, end, compare, ...utmParams }
        : { start, end, compare, aggregate: 'avg-by-hour', ...utmParams };
      const params = brandKey ? { ...base, brand_key: brandKey } : base;

      try {
        const res = await fetcher(params);
        if (cancelled) return;
        if (res?.error) throw new Error('Fetch failed');

        let points = [];
        let comparisonPoints = [];

        if (viewMode === 'daily') {
          const days = Array.isArray(res.days) ? res.days : [];
          const compDays = Array.isArray(res?.comparison?.days) ? res.comparison.days : [];
          const n = Math.min(days.length, compDays.length || days.length);
          points = days.slice(0, n);
          comparisonPoints = compDays.slice(0, n);
        } else if (viewMode === 'monthly') {
          points = Array.isArray(res.points) ? res.points : [];
          comparisonPoints = Array.isArray(res?.comparison?.points) ? res.comparison.points : [];
        } else {
          points = Array.isArray(res.points) ? res.points : [];
          const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          if (viewMode === 'hourly' && start === todayIST) {
            const currentHour = parseInt(new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false, hour: 'numeric' }));
            points = points.filter(p => p.hour <= currentHour);
          }
          comparisonPoints = Array.isArray(res?.comparison?.points) ? res.comparison.points : [];
        }

        const data = points.map((p, i) => {
          let label = p.date;
          if (viewMode === 'hourly') label = formatHourLabel(p.hour);
          else {
            const dt = new Date(`${p.date}T00:00:00Z`);
            if (!Number.isNaN(dt.getTime())) {
              if (viewMode === 'monthly') label = `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
              else label = `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
            }
          }

          return {
            label,
            value: configNext.accessor(p.metrics || {}),
            comparisonValue: comparisonPoints[i] ? configNext.accessor(comparisonPoints[i].metrics || {}) : null
          };
        });

        setChartData(data);
        setMeta({
          timezone: res.timezone || 'IST',
          rangeLabel: formatRangeLabel(res.range),
          comparisonLabel: formatRangeLabel(res?.comparison?.range),
          error: null,
        });
        setLoading(false);

      } catch {
        if (!cancelled) {
          setChartData([]);
          setMeta({ timezone: 'IST', rangeLabel: '', comparisonLabel: '', error: true, });
          setLoading(false);
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [start, end, metric, viewMode, brandKey, refreshKey, utmSource, utmMedium, utmCampaign, salesChannel, productId, compare]);

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;
  const primaryLabel = meta.rangeLabel ? `${config.label} (${meta.rangeLabel})` : config.label;
  const comparisonLabel = `${config.label} (${meta.comparisonLabel || 'Prev window'})`;

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              {viewMode === 'daily' ? 'Day-wise trend' : viewMode === 'monthly' ? 'Month-wise trend' : 'Hour-wise trend'} · {config.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Timezone: {meta.timezone}
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 120 }} variant="outlined">
            <InputLabel id="trend-view-mode-label" sx={{ fontSize: 12 }}>View</InputLabel>
            <Select
              labelId="trend-view-mode-label"
              id="trend-view-mode"
              value={viewMode}
              label="View"
              onChange={(e) => setViewMode(e.target.value)}
              MenuProps={{ PaperProps: { sx: { borderRadius: 1, mt: 0.5 } }, disableScrollLock: true }}
              sx={{
                borderRadius: 999, height: 28, fontSize: 12,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
              }}
            >
              <MenuItem value="hourly" sx={{ fontSize: 12, py: 0.5 }}>Hourly</MenuItem>
              <MenuItem value="daily" sx={{ fontSize: 12, py: 0.5 }}>Day wise</MenuItem>
              {totalDaysSelected >= 30 && (
                <MenuItem value="monthly" sx={{ fontSize: 12, py: 0.5 }}>Month wise</MenuItem>
              )}
            </Select>
          </FormControl>
        </Box>

        {loading ? (
          <Skeleton variant="rounded" width="100%" height={240} />
        ) : meta.error ? (
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="error.main">Failed to load trend data.</Typography>
          </Box>
        ) : chartData.length === 0 ? (
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">No data available.</Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={config.formatter}
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                />
                <Tooltip
                  cursor={{ stroke: theme.palette.divider, strokeWidth: 1 }}
                  content={<CustomTooltip formatter={config.formatter} />}
                />
                {/* Comparison Line (Dashed) */}
                <Area
                  type="monotone"
                  dataKey="comparisonValue"
                  name={comparisonLabel}
                  stroke={config.color}
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  strokeOpacity={0.5}
                  fill="transparent"
                  activeDot={false}
                />
                {/* Primary Metric (Gradient Area) */}
                <Area
                  type="monotone"
                  dataKey="value"
                  name={primaryLabel}
                  stroke={config.color}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#gradient-${metric})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
