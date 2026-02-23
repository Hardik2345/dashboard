import { useEffect, useMemo, useState, memo } from 'react';
import { Card, CardContent, Typography, Skeleton, Box, FormControl, Select, MenuItem, InputLabel, Stack, useMediaQuery } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LabelList
} from 'recharts';
import { getHourlyTrend, getDailyTrend, getMonthlyTrend, getHourlySalesSummary } from '../lib/api.js';

const nfCurrency0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const nfCurrency2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const nfInt0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfPercent1 = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 });

// Design color: Emerald/Greenish for the main line
// Image 1 shows a green line for current, dotted grey for previous?
// Actually Image 1 legend says: "Aug 24" (grey square) "Aug 25" (green square).
// So Current = Green, Previous = Grey.

const MAIN_COLOR = '#10b981'; // Emerald 500
const PREV_COLOR = '#9ca3af'; // Gray 400

const METRIC_CONFIG = {
  aov: {
    label: 'Avg Order Value',
    accessor: (metrics) => {
      const sales = Number(metrics?.sales || 0);
      const orders = Number(metrics?.orders || 0);
      return orders > 0 ? sales / orders : 0;
    },
    formatter: (value) => nfCurrency2.format(value || 0),
  },
  orders: {
    label: 'Total Orders',
    accessor: (metrics) => metrics?.orders ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
  sales: {
    label: 'Total Revenue', // Changed to match "Total Revenue" in KPI
    accessor: (metrics) => metrics?.sales ?? 0,
    formatter: (value) => nfCurrency0.format(value || 0),
  },
  sessions: {
    label: 'Total Sessions',
    accessor: (metrics) => metrics?.sessions ?? 0,
    formatter: (value) => nfInt0.format(value || 0),
  },
  cvr: {
    label: 'Conversion Rate',
    accessor: (metrics) => metrics?.cvr_ratio ?? 0,
    formatter: (value) => nfPercent1.format(value || 0),
  },
  atc: {
    label: 'ATC Sessions',
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
        borderRadius: 2, // More rounded per design
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', // Tailwind shadow-md
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
              borderRadius: 2, // Square with slight radius per design image
              bgcolor: entry.stroke, // Use stroke color which matches legend
            }}
          />
          {/* <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
            {entry.name}:
          </Typography> */}
          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
            {entry.name}
          </Typography>
          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, ml: 'auto' }}>
            {formatter(entry.value)}
          </Typography>
          {/* Delta if available? The tooltip in image 1 shows "40,000 ~ 4%". Recharts payload doesn't easily carry extra data unless we put it in the data object. */}
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
  const compare = query?.compare;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
    // If viewMode is monthly but range is now < 30, reset to daily or hourly
    if (viewMode === 'monthly' && daysInRange < 30) {
      setViewMode('daily'); // or hourly
    }
    setLoading(true);

    const loadData = async () => {
      const utmParams = { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, sales_channel: salesChannel, device_type: deviceType, product_id: productId };
      const configNext = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;

      // Determine view mode based on range if strict logic needed, but user wants dropdown.
      // We will respect `viewMode` state.

      if (cancelled) return;

      const fetcher = viewMode === 'monthly' ? getMonthlyTrend : (viewMode === 'daily' ? getDailyTrend : getHourlyTrend);

      // For design image matching, defaulting to monthly often looks best for long ranges.
      // But we stick to logic: if viewMode is set, use it.

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
              if (viewMode === 'monthly') label = MONTH_NAMES[dt.getUTCMonth()]; // Just month name for clean look
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
  }, [start, end, metric, viewMode, brandKey, refreshKey, utmSource, utmMedium, utmCampaign, salesChannel, deviceType, productId, compare]);

  const toggleLine = (line) => {
    setVisibleLines(prev =>
      prev.includes(line) ? prev.filter(l => l !== line) : [...prev, line]
    );
  };

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.sales;

  return (
    <Card elevation={0} sx={{
      borderRadius: isMobile ? 2 : 3,
      height: isMobile ? 'auto' : '310px',
      minHeight: isMobile ? '340px' : '310px'
    }}>
      {/* Increased borderRadius to 3 (12px) or more to match image design */}
      <CardContent sx={{ minHeight: 260, display: 'flex', flexDirection: 'column', px: 2, py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 500 }}>
              {viewMode === 'daily' ? 'Day-wise trend' : viewMode === 'monthly' ? 'Month-wise trend' : 'Hour-wise trend'} · {config.label}
            </Typography>

            <Stack direction="row" spacing={isMobile ? 1.5 : 3} alignItems="center" sx={{ flexWrap: 'wrap', gap: isMobile ? 1 : 0 }}>
              {/* Actual Design Legend (Checkbox style) */}
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
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, // Remove border for cleaner look
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
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 15, bottom: 5 }}>
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
                    tickFormatter={config.formatter}
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
                    dot={{ r: 3, fill: 'white', stroke: PREV_COLOR, strokeWidth: 1.5 }}
                  >
                    <LabelList dataKey="comparisonValue" position="top" formatter={config.formatter} fontSize={10} fill={theme.palette.text.secondary} />
                  </Area>
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
                    <LabelList dataKey="value" position="top" formatter={config.formatter} fontSize={10} fill={theme.palette.text.secondary} />
                  </Area>
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 15, bottom: 5 }} barGap={0}>
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
                    tickFormatter={config.formatter}
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
                  >
                    <LabelList dataKey="comparisonValue" position="top" formatter={config.formatter} fontSize={10} fill={theme.palette.text.secondary} />
                  </Bar>
                  <Bar
                    hide={!visibleLines.includes('primary')}
                    dataKey="value"
                    name={rangeLabels.current || 'Current'}
                    fill={MAIN_COLOR}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  >
                    <LabelList dataKey="value" position="top" formatter={config.formatter} fontSize={10} fill={theme.palette.text.secondary} />
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
