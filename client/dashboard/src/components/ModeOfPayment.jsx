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

export default function ModeOfPayment({ query }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [loading, setLoading] = useState(true);
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
                const prevRange = getPreviousRange(start, end);

                const [currOrders, currSales, prevOrders, prevSales] = await Promise.all([
                    getOrderSplit({ start, end, ...rest }),
                    getPaymentSalesSplit({ start, end, ...rest }),
                    prevRange.start ? getOrderSplit({ start: prevRange.start, end: prevRange.end, ...rest }) : Promise.resolve({}),
                    prevRange.start ? getPaymentSalesSplit({ start: prevRange.start, end: prevRange.end, ...rest }) : Promise.resolve({})
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
                    totalValue: valData.formattedTotal
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

    const renderChart = (title, chartData, totalLabel) => (
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
        </div>
    );

    return (
        <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 4 }}>
            <CardContent>
                <Typography variant="h6" component="div" sx={{ mb: 0.5, fontSize: '1rem', fontWeight: 600 }}>
                    Mode of Payment <span className="text-muted-foreground text-sm font-normal">(excluding cancelled orders)</span>
                </Typography>

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
                        {/* Legend Skeleton */}
                        <div className="flex justify-center gap-6 mt-6">
                            {[1, 2, 3].map((i) => (
                                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Skeleton variant="rectangular" width={12} height={12} sx={{ borderRadius: 0.5 }} />
                                    <Skeleton variant="text" width={60} />
                                </Box>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="mt-4">
                        <div className="flex flex-wrap justify-around gap-8">
                            {renderChart('By Order count', data.quantity, data.totalQuantity)}
                            {renderChart('By Sales', data.value, data.totalValue)}
                        </div>

                        {/* Legend */}
                        <div className="flex justify-center gap-6 mt-6 flex-wrap">
                            {Object.entries(COLORS).map(([key, color]) => (
                                <div key={key} className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                                    <span className="text-sm text-muted-foreground">{LABELS[key]}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
