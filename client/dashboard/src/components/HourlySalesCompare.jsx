import { useEffect, useMemo, useState, memo } from 'react';
import { Card, CardContent, Typography, Skeleton, Box, FormControl, Select, MenuItem, Stack, useMediaQuery } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LabelList
} from 'recharts';
import { getHourlyTrend, getDailyTrend, getMonthlyTrend } from '../lib/api.js';
import { formatInrAmount, useInrCurrency } from '../lib/currency.js';

const nfInt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfPercent1 = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 });
const nfCompactInt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

const MAIN_COLOR = '#10b981';

const CustomTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        p: 1.5,
        minWidth: 160,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 500 }}>
        {label}
      </Typography>
      {payload.map((entry, index) => (
        <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: 2,
              bgcolor: entry.stroke,
            }}
          />
          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
            {entry.name}
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
  return `${normalized}${hour >= 12 ? 'pm' : 'am'}`;
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

export default memo(function HourlySalesCompare({ query, metric = 'sales' }) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState([]);
  const [viewMode, setViewMode] = useState('hourly');
  const [rangeLabels, setRangeLabels] = useState({ current: '', previous: '' });
  const [visibleLines, setVisibleLines] = useState(['primary']);

  const start = query?.start;
  const end = query?.end;
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;
  const utmSource = query?.utm_source;
  const utmMedium = query?.utm_medium;
  const utmCampaign = query?.utm_campaign;
  const salesChannel = query?.sales_channel;
  const deviceType = query?.device_type;
  const productId = query?.product_id;
  const discountCode = query?.discount_code;
  const compare = query?.compare;
  const compareStart = query?.compare_start;
  const compareEnd = query?.compare_end;
  const { convertAmount } = useInrCurrency(brandKey, end);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const metricConfig = {
    aov: {
      label: 'Avg Order Value',
      accessor: (metrics) => {
        const sales = convertAmount(metrics?.sales || 0);
        const orders = Number(metrics?.orders || 0);
        return orders > 0 ? sales / orders : 0;
      },
      formatter: (value) => formatInrAmount(value || 0, { maximumFractionDigits: 2 }),
      compactFormatter: (value) =>
        formatInrAmount(value || 0, { notation: 'compact', maximumFractionDigits: 1 }),
    },
    orders: {
      label: 'Total Orders',
      accessor: (metrics) => metrics?.orders ?? 0,
      formatter: (value) => nfInt0.format(value || 0),
      compactFormatter: (value) => nfCompactInt.format(value || 0),
    },
    sales: {
      label: 'Total Revenue',
      accessor: (metrics) => convertAmount(metrics?.sales ?? 0),
      formatter: (value) => formatInrAmount(value || 0, { maximumFractionDigits: 0 }),
      compactFormatter: (value) =>
        formatInrAmount(value || 0, { notation: 'compact', maximumFractionDigits: 1 }),
    },
    sessions: {
      label: 'Total Sessions',
      accessor: (metrics) => metrics?.sessions ?? 0,
      formatter: (value) => nfInt0.format(value || 0),
      compactFormatter: (value) => nfCompactInt.format(value || 0),
    },
    cvr: {
      label: 'Conversion Rate',
      accessor: (metrics) => metrics?.cvr_ratio ?? 0,
      formatter: (value) => nfPercent1.format(value || 0),
      compactFormatter: (value) => nfPercent1.format(value || 0),
    },
    atc: {
      label: 'ATC Sessions',
      accessor: (metrics) => metrics?.atc ?? 0,
      formatter: (value) => nfInt0.format(value || 0),
      compactFormatter: (value) => nfCompactInt.format(value || 0),
    },
    ci_events: {
      label: 'Checkout Initiated Events',
      accessor: (metrics) => metrics?.ci_events ?? 0,
      formatter: (value) => nfInt0.format(value || 0),
      compactFormatter: (value) => nfCompactInt.format(value || 0),
    },
    atc_rate: {
      label: 'ATC Rate',
      accessor: (metrics) => {
        const atc = Number(metrics?.atc || 0);
        const sessions = Number(metrics?.sessions || 0);
        return sessions > 0 ? atc / sessions : 0;
      },
      formatter: (value) => nfPercent1.format(value || 0),
      compactFormatter: (value) => nfPercent1.format(value || 0),
    },
  };

  const daysInRange = useMemo(() => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    return Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
  }, [start, end]);

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setChartData([]);
      setLoading(false);
      return () => { cancelled = true; };
    }
    if (viewMode === 'monthly' && daysInRange < 30) {
      setViewMode('daily');
    }
    setLoading(true);

    const loadData = async () => {
      const utmParams = { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, sales_channel: salesChannel, device_type: deviceType, product_id: productId, discount_code: discountCode };
      const configNext = metricConfig[metric] || metricConfig.sales;
      if (cancelled) return;

      const fetcher = viewMode === 'monthly' ? getMonthlyTrend : (viewMode === 'daily' ? getDailyTrend : getHourlyTrend);
      const base = (viewMode === 'daily' || viewMode === 'monthly')
        ? { start, end, compare, compare_start: compareStart, compare_end: compareEnd, ...utmParams }
        : { start, end, compare, compare_start: compareStart, compare_end: compareEnd, aggregate: 'avg-by-hour', ...utmParams };
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
              if (viewMode === 'monthly') label = MONTH_NAMES[dt.getUTCMonth()];
              else label = `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
            }
          }

          return {
            label,
            value: configNext.accessor(p.metrics || {}),
            comparisonValue: comparisonPoints[i] ? configNext.accessor(comparisonPoints[i].metrics || {}) : null
          };
        });

        setRangeLabels({
          current: formatRangeLabel(res.range),
          previous: formatRangeLabel(res?.comparison?.range)
        });
        setChartData(data);
        setLoading(false);

      } catch {
        if (!cancelled) {
          setChartData([]);
          setLoading(false);
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [start, end, metric, viewMode, brandKey, refreshKey, utmSource, utmMedium, utmCampaign, salesChannel, deviceType, productId, discountCode, compare, compareStart, compareEnd, convertAmount]);

  const toggleLine = (line) => {
    setVisibleLines(prev =>
      prev.includes(line) ? prev.filter(l => l !== line) : [...prev, line]
    );
  };

  const config = metricConfig[metric] || metricConfig.sales;

  return (
    <Card elevation={0} sx={{
      borderRadius: isMobile ? 2 : 3,
      height: isMobile ? 'auto' : '310px',
      minHeight: isMobile ? '340px' : '310px'
    }}>
      <CardContent sx={{ minHeight: 260, display: 'flex', flexDirection: 'column', px: 2, py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {viewMode === 'daily' ? 'Day-wise trend' : viewMode === 'monthly' ? 'Month-wise trend' : 'Hour-wise trend'} · {config.label}
            </Typography>

            <Stack direction="row" spacing={isMobile ? 1.5 : 3} alignItems="center" sx={{ flexWrap: 'wrap', gap: isMobile ? 1 : 0 }}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                onClick={() => toggleLine('primary')}
                sx={{ cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
              >
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '3px',
                    bgcolor: visibleLines.includes('primary') ? MAIN_COLOR : 'transparent',
                    border: '1px solid',
                    borderColor: MAIN_COLOR,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {visibleLines.includes('primary') && <Box sx={{ width: 6, height: 6, bgcolor: 'white', borderRadius: '1px' }} />}
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: visibleLines.includes('primary') ? 'text.primary' : 'text.secondary' }}>
                  {rangeLabels.current}
                </Typography>
              </Stack>

              {rangeLabels.previous && (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  onClick={() => toggleLine('comparison')}
                  sx={{ cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
                >
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: '3px',
                      border: '1px solid',
                      borderColor: MAIN_COLOR,
                      bgcolor: visibleLines.includes('comparison') ? MAIN_COLOR : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {visibleLines.includes('comparison') && <Box sx={{ width: 6, height: 6, bgcolor: 'white', borderRadius: '1px' }} />}
                  </Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: visibleLines.includes('comparison') ? 'text.secondary' : alpha(theme.palette.text.secondary, 0.5) }}>
                    {rangeLabels.previous}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Stack>

          <FormControl size="small" sx={{ minWidth: 110 }}>
            <Select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': 'View mode' }}
              sx={{
                borderRadius: 2,
                height: 30,
                fontSize: 13,
                fontWeight: 500,
                bgcolor: alpha(theme.palette.action.active, 0.04),
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              }}
            >
              <MenuItem value="hourly">Hourly</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              {daysInRange >= 30 && <MenuItem value="monthly">Monthly</MenuItem>}
            </Select>
          </FormControl>
        </Box>

        {loading ? (
          <Skeleton variant="rounded" width="100%" height={200} />
        ) : chartData.length === 0 ? (
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">No data available.</Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === 'hourly' ? (
                <AreaChart data={chartData} margin={{ top: 25, right: 20, left: 15, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradient-main" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={MAIN_COLOR} stopOpacity={0.1} />
                      <stop offset="95%" stopColor={MAIN_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    minTickGap={isMobile ? 15 : 0}
                    interval={isMobile ? 'preserveStartEnd' : 0}
                    tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={config.compactFormatter}
                    tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                    width={60}
                  />
                  <Tooltip
                    cursor={{ stroke: theme.palette.divider, strokeWidth: 1, strokeDasharray: '4 4' }}
                    content={<CustomTooltip formatter={config.formatter} />}
                  />
                  <Area
                    type="monotone"
                    hide={!visibleLines.includes('comparison')}
                    dataKey="comparisonValue"
                    name={rangeLabels.previous || 'Previous'}
                    stroke={MAIN_COLOR}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    fill="transparent"
                    activeDot={false}
                    dot={{ r: 3, fill: 'white', stroke: MAIN_COLOR, strokeWidth: 1.5 }}
                  />
                  <Area
                    type="monotone"
                    hide={!visibleLines.includes('primary')}
                    dataKey="value"
                    name={rangeLabels.current || 'Current'}
                    stroke={MAIN_COLOR}
                    strokeWidth={2.5}
                    fill={`url(#gradient-main)`}
                    fillOpacity={1}
                    activeDot={{ r: 6, fill: MAIN_COLOR, stroke: 'white', strokeWidth: 3 }}
                    dot={{ r: 3, fill: 'white', stroke: MAIN_COLOR, strokeWidth: 1.5 }}
                  >
                    {viewMode !== 'hourly' && <LabelList dataKey="value" position="top" formatter={config.compactFormatter} fontSize={9} offset={8} fill={theme.palette.text.primary} />}
                  </Area>
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 25, right: 20, left: 15, bottom: 5 }} barGap={0}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    minTickGap={isMobile ? 15 : 0}
                    interval={isMobile ? 'preserveStartEnd' : 0}
                    tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={config.compactFormatter}
                    tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                    width={60}
                  />
                  <Tooltip
                    cursor={{ fill: alpha(theme.palette.divider, 0.2) }}
                    content={<CustomTooltip formatter={config.formatter} />}
                  />
                  <Bar
                    hide={!visibleLines.includes('comparison')}
                    dataKey="comparisonValue"
                    name={rangeLabels.previous || 'Previous'}
                    fill={alpha(MAIN_COLOR, 0.4)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    hide={!visibleLines.includes('primary')}
                    dataKey="value"
                    name={rangeLabels.current || 'Current'}
                    fill={MAIN_COLOR}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  >
                    {viewMode !== 'hourly' && <LabelList dataKey="value" position="top" formatter={config.compactFormatter} fontSize={9} offset={8} fill={theme.palette.text.primary} />}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
});
