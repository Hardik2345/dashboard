import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, Typography, Skeleton, useTheme, Grid, Box } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Label } from 'recharts';
import { getOrderSplit, getPaymentSalesSplit } from '../lib/api';
import dayjs from 'dayjs';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

const COLORS = {
    Prepaid: '#2cc995', // Teal/Green
    Partial: '#8da399', // Greyish Teal
    COD: '#1f5748', // Dark Green
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

// Helper to calculate previous period
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

const ModeOfPayment = React.memo(function ModeOfPayment({ query }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [loading, setLoading] = useState(true);
    const [prevRange, setPrevRange] = useState(null);
    const [data, setData] = useState({
        quantity: [],
        value: [],
        totalQuantity: 0,
        totalValue: 0
    });

    useEffect(() => {
        let cancelled = false;
        if (!query?.start || !query?.end) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const fetchData = async () => {
            try {
                const { start, end, ...rest } = query;
                const prevRangeData = getPreviousRange(start, end);
                setPrevRange(prevRangeData);

                const [currOrders, currSales, prevOrders, prevSales] = await Promise.all([
                    getOrderSplit({ start, end, ...rest }),
                    getPaymentSalesSplit({ start, end, ...rest }),
                    prevRangeData.start ? getOrderSplit({ start: prevRangeData.start, end: prevRangeData.end, ...rest }) : Promise.resolve({}),
                    prevRangeData.start ? getPaymentSalesSplit({ start: prevRangeData.start, end: prevRangeData.end, ...rest }) : Promise.resolve({})
                ]);

                if (cancelled) return;

                // Process Quantity Data
                const processMetric = (curr, prev, type) => {
                    const isValue = type === METRIC_TYPES.VALUE;
                    const total = isValue ? curr.total : curr.total; // total_orders_from_split vs total_sales_from_split
                    const prevTotal = isValue ? prev.total : prev.total;

                    const segments = ['Prepaid', 'COD', 'Partial'].map(key => {
                        const valKey = isValue
                            ? (key === 'Partial' ? 'partial_sales' : `${key.toLowerCase()}_sales`)
                            : (key === 'Partial' ? 'partially_paid_orders' : `${key.toLowerCase()}_orders`);

                        const currVal = curr[valKey] || 0;
                        const prevVal = prev[valKey] || 0;
                        const currPct = total > 0 ? (currVal / total) * 100 : 0;
                        // Delta calculation on the raw value
                        const delta = prevVal > 0 ? ((currVal - prevVal) / prevVal) * 100 : 0;

                        return {
                            name: LABELS[key],
                            value: currVal,
                            percent: currPct.toFixed(1),
                            delta: Math.round(delta),
                            color: COLORS[key],
                            formattedValue: isValue
                                ? (currVal >= 100000 ? `₹${(currVal / 100000).toFixed(2)}L` : `₹${(currVal / 1000).toFixed(1)}K`)
                                : currVal.toLocaleString()
                        };
                    });

                    // Sort order: Prepaid, Partial, COD (to match visual design roughly)
                    // Actually, let's keep consistent order: Prepaid, Partial, COD
                    return {
                        segments,
                        total,
                        formattedTotal: isValue
                            ? (total >= 100000 ? `${(total / 100000).toFixed(2)}L` : `${(total / 1000).toFixed(1)}K`)
                            : total.toLocaleString()
                    };
                };

                const qtyData = processMetric(currOrders, prevOrders, METRIC_TYPES.QUANTITY);
                const valData = processMetric(currSales, prevSales, METRIC_TYPES.VALUE);

                setData({
                    quantity: qtyData.segments,
                    value: valData.segments,
                    totalQuantity: qtyData.formattedTotal,
                    totalValue: valData.formattedTotal,
                    rawTotalQuantity: qtyData.total,
                    rawTotalValue: valData.total
                });

            } catch (err) {
                console.error("Failed to load payment split", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchData();

        return () => { cancelled = true; };
    }, [query.start, query.end, query.brand_key, query.product_id, query.refreshKey, query.utm_source, query.utm_medium, query.utm_campaign, query.sales_channel]);

    const renderChart = (title, chartData, totalLabel, rawTotal) => (
        <div className="flex flex-col items-center flex-1 min-w-[250px]">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{title}</Typography>
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
                {/* Center Text Overlay alternative if Label doesn't behave */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-muted-foreground">{title === 'By Order count' ? 'Total Orders' : 'Total Sales'}</span>
                    <span className="text-2xl font-bold dark:text-white text-gray-900">{totalLabel}</span>
                </div>
            </div>

            {/* Always visible chips */}
            <div className="flex flex-col gap-2 w-full mt-6 max-w-[240px]">
                {chartData.map((entry, index) => {
                    const pctLabel = entry.percent !== undefined ? Number(entry.percent).toFixed(1) : (rawTotal > 0 ? ((entry.value / rawTotal) * 100).toFixed(1) : '0.0');
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

    const isToday = query?.end ? dayjs(query.end).isSame(dayjs(), 'day') : false;

    return (
        <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <CardContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 1 }}>
                    <Box sx={{ flex: '1 1 auto', minWidth: '150px' }}>
                        <Typography variant="h6" component="div" sx={{ mb: 0.5, fontSize: '1rem', fontWeight: 600 }}>
                            Mode of Payment <span className="text-muted-foreground text-sm font-normal">(excluding cancelled orders)</span>
                        </Typography>
                    </Box>

                    {prevRange && query?.start && query?.end && !isToday && (
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
                                    return `${fmt(query.start, query.end)} vs ${fmt(prevRange.start, prevRange.end)}`;
                                })()}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {loading ? (
                    <div className="mt-4">
                        <div className="flex flex-wrap justify-around gap-8">
                            {[1, 2].map((i) => (
                                <div key={i} className="flex flex-col items-center flex-1 min-w-[250px]">
                                    <Skeleton variant="text" width={100} sx={{ mb: 2, borderRadius: 1 }} />
                                    <Skeleton variant="circular" width={176} height={176} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="mt-4">
                        <div className="flex flex-wrap justify-around gap-8">
                            {renderChart('By Order count', data.quantity, data.totalQuantity, data.rawTotalQuantity)}
                            {renderChart('By Sales', data.value, data.totalValue, data.rawTotalValue)}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});

export default ModeOfPayment;
