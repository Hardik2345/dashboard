import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Skeleton, useTheme, Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { getOrderSplit, getPaymentSalesSplit } from '../lib/api';
import dayjs from 'dayjs';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useInrCurrency } from '../lib/currency.js';

const COLORS = {
    Prepaid: '#2cc995',
    Partial: '#8da399',
    COD: '#1f5748',
};

const LABELS = {
    Prepaid: 'Prepaid',
    Partial: 'Partially paid',
    COD: 'COD'
};

const METRIC_TYPES = {
    QUANTITY: 'quantity',
    VALUE: 'value'
};

const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-popover text-popover-foreground p-2 rounded-lg shadow-lg border border-border text-xs">
                <div className="font-semibold mb-1">{data.name}</div>
                <div className="flex items-center gap-2">
                    <span>{data.name}: {data.formattedValue}</span>
                    <span className="text-muted-foreground">({data.percent}%)</span>
                </div>
                {data.delta !== undefined && (
                    <div className={`flex items-center mt-1 ${data.delta > 0 ? 'text-emerald-500' : data.delta < 0 ? 'text-rose-500' : 'text-gray-500'}`}>
                        {data.delta > 0 ? <ArrowUp size={12} /> : data.delta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                        <span className="ml-1">{Math.abs(data.delta)}%</span>
                    </div>
                )}
            </div>
        );
    }
    return null;
};

function getPreviousRange(start, end) {
    if (!start || !end) return { start: null, end: null };
    const s = dayjs(start);
    const e = dayjs(end);
    const diff = e.diff(s, 'day') + 1;
    const prevEnd = s.subtract(1, 'day');
    const prevStart = prevEnd.subtract(diff - 1, 'day');
    return {
        start: prevStart.format('YYYY-MM-DD'),
        end: prevEnd.format('YYYY-MM-DD')
    };
}

function getTimezoneParts(date, timezone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
    }, {});
    const hour = Number(parts.hour || 0);
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        hour: hour === 24 ? 0 : hour,
    };
}

function getHourlyCutoffForTodayRange(start, end, timezone) {
    if (!start || !end) return null;

    const nowLocal = getTimezoneParts(new Date(), timezone);
    const includesToday = start <= nowLocal.date && end >= nowLocal.date;

    if (!includesToday) return null;

    return Math.max(0, nowLocal.hour - 1);
}

const TREND_RADIOS = {
    quantity: 'payment_orders',
    value: 'payment_sales',
};

const ModeOfPayment = React.memo(function ModeOfPayment({
    query,
    selectedMetrics = [],
    onToggleMetric,
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [loading, setLoading] = useState(true);
    const [prevRange, setPrevRange] = useState(null);
    const start = query?.start;
    const end = query?.end;
    const brandKey = query?.brand_key;
    const productId = query?.product_id;
    const utmSource = query?.utm_source;
    const utmMedium = query?.utm_medium;
    const utmCampaign = query?.utm_campaign;
    const salesChannel = query?.sales_channel;
    const deviceType = query?.device_type;
    const discountCode = query?.discount_code;
    const city = query?.city;
    const timezone = query?.timezone;
    const { convertAmount, formatConvertedAmount } = useInrCurrency(brandKey, end);
    const [data, setData] = useState({
        quantity: [],
        value: [],
        totalQuantity: 0,
        totalValue: 0
    });

    useEffect(() => {
        let cancelled = false;
        if (!start || !end) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const fetchData = async () => {
            try {
                const prevRangeData = getPreviousRange(start, end);
                setPrevRange(prevRangeData);
                const baseParams = {
                    brand_key: brandKey,
                    product_id: productId,
                    utm_source: utmSource,
                    utm_medium: utmMedium,
                    utm_campaign: utmCampaign,
                    sales_channel: salesChannel,
                    device_type: deviceType,
                    discount_code: discountCode,
                    city,
                };

                const [
                    currOrders,
                    currSales,
                    prevFullOrders,
                    prevFullSales
                ] = await Promise.all([
                    getOrderSplit({ ...baseParams, start, end }),
                    getPaymentSalesSplit({ ...baseParams, start, end }),
                    prevRangeData.start ? getOrderSplit({ ...baseParams, start: prevRangeData.start, end: prevRangeData.end }) : Promise.resolve({}),
                    prevRangeData.start ? getPaymentSalesSplit({ ...baseParams, start: prevRangeData.start, end: prevRangeData.end }) : Promise.resolve({})
                ]);

                const splitTimezone = currOrders?.timezone || currSales?.timezone || timezone || 'Asia/Kolkata';
                const hourLte = getHourlyCutoffForTodayRange(start, end, splitTimezone);
                const compareArgs = Number.isInteger(hourLte)
                    ? { ...baseParams, hour_lte: hourLte }
                    : baseParams;

                const [
                    currCompareOrders,
                    currCompareSales,
                    prevCompareOrders,
                    prevCompareSales
                ] = Number.isInteger(hourLte)
                    ? await Promise.all([
                        getOrderSplit({ start, end, ...compareArgs }),
                        getPaymentSalesSplit({ start, end, ...compareArgs }),
                        prevRangeData.start ? getOrderSplit({ start: prevRangeData.start, end: prevRangeData.end, ...compareArgs }) : Promise.resolve({}),
                        prevRangeData.start ? getPaymentSalesSplit({ start: prevRangeData.start, end: prevRangeData.end, ...compareArgs }) : Promise.resolve({})
                    ])
                    : [null, null, prevFullOrders, prevFullSales];

                if (cancelled) return;

                const processMetric = (curr, compareCurr, comparePrev, type) => {
                    const isValue = type === METRIC_TYPES.VALUE;
                    const total = Number(curr?.total || 0);
                    const comparisonCurrent = compareCurr || curr;
                    const comparisonPrevious = comparePrev || {};
                    const compareTotal = Number(comparisonCurrent?.total || 0);
                    const prevTotal = Number(comparisonPrevious?.total || 0);

                    const segments = ['Prepaid', 'COD', 'Partial'].map((key) => {
                        const valKey = isValue
                            ? (key === 'Partial' ? 'partial_sales' : `${key.toLowerCase()}_sales`)
                            : (key === 'Partial' ? 'partially_paid_orders' : `${key.toLowerCase()}_orders`);

                        const currVal = Number(curr?.[valKey] || 0);
                        const compareCurrVal = Number(comparisonCurrent?.[valKey] || 0);
                        const prevVal = Number(comparisonPrevious?.[valKey] || 0);
                        const currPct = total > 0 ? (currVal / total) * 100 : 0;
                        const compareCurrPct = compareTotal > 0 ? (compareCurrVal / compareTotal) * 100 : 0;
                        const prevPct = prevTotal > 0 ? (prevVal / prevTotal) * 100 : 0;
                        const delta = prevPct > 0
                            ? ((compareCurrPct - prevPct) / prevPct) * 100
                            : compareCurrPct > 0
                                ? 100
                                : 0;

                        const displayValue = isValue ? convertAmount(currVal) : currVal;

                        return {
                            name: LABELS[key],
                            value: displayValue,
                            percent: currPct.toFixed(1),
                            delta: Math.round(delta),
                            color: COLORS[key],
                            formattedValue: isValue
                                ? formatConvertedAmount(displayValue, { notation: 'compact', maximumFractionDigits: 1 })
                                : currVal.toLocaleString()
                        };
                    });

                    const displayTotal = isValue ? convertAmount(total) : total;
                    return {
                        segments,
                        total: displayTotal,
                        formattedTotal: isValue
                            ? formatConvertedAmount(displayTotal, { notation: 'compact', maximumFractionDigits: 1 })
                            : total.toLocaleString()
                    };
                };

                const qtyData = processMetric(currOrders, currCompareOrders, prevCompareOrders, METRIC_TYPES.QUANTITY);
                const valData = processMetric(currSales, currCompareSales, prevCompareSales, METRIC_TYPES.VALUE);

                setData({
                    quantity: qtyData.segments,
                    value: valData.segments,
                    totalQuantity: qtyData.formattedTotal,
                    totalValue: valData.formattedTotal,
                    rawTotalQuantity: qtyData.total,
                    rawTotalValue: valData.total
                });
            } catch (err) {
                console.error('Failed to load payment split', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchData();

        return () => { cancelled = true; };
    }, [start, end, brandKey, productId, utmSource, utmMedium, utmCampaign, salesChannel, deviceType, discountCode, city, timezone, convertAmount, formatConvertedAmount]);

    const renderChart = (title, chartData, totalLabel, rawTotal, trendMetricKey) => (
        <div className="flex flex-col items-center flex-1 min-w-0">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">{title}</Typography>
                {typeof onToggleMetric === 'function' && (
                    <Box
                        component="button"
                        type="button"
                        aria-pressed={selectedMetrics.includes(trendMetricKey)}
                        aria-label={`${selectedMetrics.includes(trendMetricKey) ? 'Deselect' : 'Select'} ${title}`}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onToggleMetric(trendMetricKey);
                        }}
                        sx={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: '1.5px solid',
                            borderColor: selectedMetrics.includes(trendMetricKey)
                                ? '#10b981'
                                : alpha(theme.palette.text.secondary, 0.35),
                            bgcolor: selectedMetrics.includes(trendMetricKey)
                                ? '#10b981'
                                : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.18s ease',
                            boxShadow: selectedMetrics.includes(trendMetricKey)
                                ? `0 2px 6px ${alpha('#10b981', 0.35)}`
                                : 'none',
                            cursor: 'pointer',
                            p: 0,
                            outline: 'none',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            '&:focus-visible': {
                                boxShadow: `0 0 0 2px ${alpha('#10b981', 0.28)}`,
                            },
                        }}
                    >
                        {selectedMetrics.includes(trendMetricKey) && (
                            <Box
                                component="span"
                                sx={{
                                    width: 7,
                                    height: 4,
                                    borderLeft: '2px solid #fff',
                                    borderBottom: '2px solid #fff',
                                    transform: 'rotate(-45deg) translateY(-1px)',
                                }}
                            />
                        )}
                    </Box>
                )}
            </Box>
            <div className="relative w-full h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            innerRadius={58}
                            outerRadius={88}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <RechartsTooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1000 }} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-muted-foreground">{title === 'By Order count' ? 'Total Orders' : 'Total Sales'}</span>
                    <span className="text-2xl font-bold dark:text-white text-gray-900">{totalLabel}</span>
                </div>
            </div>

            <div className="flex flex-col gap-2 w-full mt-6 px-2 md:px-4">
                {chartData.map((entry, index) => {
                    const pctLabel = entry.percent !== undefined
                        ? Number(entry.percent).toFixed(1)
                        : (rawTotal > 0 ? ((entry.value / rawTotal) * 100).toFixed(1) : '0.0');
                    return (
                        <div key={index} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.08] transition-colors">
                            <div className="flex items-center gap-2.5">
                                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{entry.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{entry.formattedValue}</span>
                                <span className="text-[13px] font-semibold text-gray-500 dark:text-gray-400 w-10 text-right">
                                    {pctLabel}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const isToday = end ? dayjs(end).isSame(dayjs(), 'day') : false;

    return (
        <Card elevation={0} sx={{ width: '100%', height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1 }}>
                    <Box sx={{ flex: '1 1 auto', minWidth: '150px' }}>
                        <Typography variant="h6" component="div" sx={{ mb: 0.5, fontSize: '1rem', fontWeight: 600 }}>
                            Mode of Payment
                        </Typography>
                    </Box>

                    {prevRange && start && end && !isToday && (
                        <Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', px: 1, py: 0.4, borderRadius: 1.5, display: 'inline-block', fontSize: '0.7rem' }}>
                                {(() => {
                                    const fmt = (s, e) => {
                                        const start = dayjs(s);
                                        const end = dayjs(e);
                                        if (start.isSame(end, 'day')) {
                                            return start.format('MMM D');
                                        }
                                        return `${start.format('MMM D')} - ${end.format('MMM D')}`;
                                    };
                                    return `${fmt(start, end)} vs ${fmt(prevRange.start, prevRange.end)}`;
                                })()}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {loading ? (
                    <div className="mt-4">
                        <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-6">
                            {[1, 2].map((i) => (
                                <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                                    <Skeleton variant="text" width={100} sx={{ mb: 2, borderRadius: 1 }} />
                                    <Skeleton variant="circular" width={176} height={176} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="mt-4">
                        <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-6">
                            {renderChart('By Order count', data.quantity, data.totalQuantity, data.rawTotalQuantity, TREND_RADIOS.quantity)}
                            {renderChart('By Sales', data.value, data.totalValue, data.rawTotalValue, TREND_RADIOS.value)}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});

export default ModeOfPayment;
