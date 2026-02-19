import React, { useMemo, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, LabelList, YAxis, XAxis, Tooltip } from 'recharts';
import { Card, CardContent, useTheme } from '@mui/material';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

const FunnelChart = React.memo(function FunnelChart({
    data = [],
    height = 300,
    className,
    showHeader = true
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const [viewMode, setViewMode] = useState('new'); // 'new' | 'legacy'

    // Process data to calculate scaling and centering
    const funnelPoints = useMemo(() => {
        if (!data || data.length === 0) return [];

        const count = data.length;
        const maxValue = Math.max(...data.map(d => d.value)) || 1;
        const maxSqrtValue = Math.sqrt(maxValue);
        const minHeightPx = 24;
        const minPct = (minHeightPx / height) * 100;

        const points = [];

        // Add padding at start
        points.push({ val: data[0].value, x: 0, isPadding: true });

        // Add real step centers
        data.forEach((item, i) => {
            points.push({ ...item, val: item.value, x: i + 0.5, isPadding: false });
        });

        // Add padding at end
        points.push({ val: data[count - 1].value, x: count, isPadding: true });

        return points.map((p, index) => {
            const rawPct = (Math.sqrt(p.val) / maxSqrtValue) * 100;
            const conversionPct = Math.max(rawPct, minPct);
            const spacer = (100 - conversionPct) / 2;

            const firstValue = data[0]?.value || 1;
            const pctLabel = p.isPadding ? '' : (p.label === data[0].label ? '100%' : `${Math.round((p.val / firstValue) * 100)}%`);

            return {
                ...p,
                conversionPct,
                spacer,
                displayValue: pctLabel,
                rawValue: p.val,
                xOffset: p.x
            };
        });
    }, [data, height]);

    // Generate gradient stops for segmented look
    const gradientStops = useMemo(() => {
        const colors = [
            '#0d9488', // teal-600
            '#14b8a6', // teal-500
            '#2dd4bf', // teal-400
            '#5eead4', // teal-300
            '#99f6e4', // teal-200
        ];

        return data.map((_, index) => {
            const color = colors[index % colors.length];
            const startPct = (index / data.length) * 100;
            const endPct = ((index + 1) / data.length) * 100;

            return (
                <React.Fragment key={index}>
                    <stop offset={`${startPct}%`} stopColor={color} stopOpacity={0.9} />
                    <stop offset={`${endPct}%`} stopColor={color} stopOpacity={0.9} />
                </React.Fragment>
            );
        });
    }, [data]);


    return (
        <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }} className={className}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 }, position: 'relative' }}>
                {/* View Mode Toggle */}
                <div className="absolute top-3 right-3 z-30 flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setViewMode('new')}
                        className={cn(
                            "px-3 py-1 text-[10px] md:text-xs font-medium rounded-md transition-all duration-200",
                            viewMode === 'new'
                                ? "bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                        )}
                    >
                        New
                    </button>
                    <button
                        onClick={() => setViewMode('legacy')}
                        className={cn(
                            "px-3 py-1 text-[10px] md:text-xs font-medium rounded-md transition-all duration-200",
                            viewMode === 'legacy'
                                ? "bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                        )}
                    >
                        Legacy
                    </button>
                </div>

                {/* Background Hover Layer */}
                <div className="absolute inset-0 flex z-0 m-6">
                    {data.map((_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex-1 h-full transition-all duration-300 ease-in-out border-r border-dashed border-gray-200 dark:border-gray-800 last:border-r-0",
                                hoveredIndex === i ? "bg-gradient-to-t from-teal-500/20 to-transparent" : "bg-transparent"
                            )}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        />
                    ))}
                </div>

                <div className="relative z-10 pointer-events-none">
                    {showHeader && (
                        <div className="flex justify-between mb-8">
                            {data.map((step, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex flex-col flex-1 min-w-0 pl-2 md:pl-4 first:pl-0 transition-transform duration-300 ease-in-out",
                                        hoveredIndex === i ? "translate-y-1" : ""
                                    )}
                                >
                                    <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium truncate">{step.label}</span>
                                    <div className="flex flex-wrap items-end gap-x-2 gap-y-0 mt-1">
                                        <span style={{ color: isDark ? '#fff' : '#111827' }} className="text-lg md:text-2xl font-bold tracking-tight truncate">
                                            {step.value.toLocaleString()}
                                        </span>
                                        {step.change !== undefined && (
                                            <div className={cn(
                                                "flex items-center text-[10px] md:text-xs font-medium mb-1 md:mb-1.5",
                                                step.change > 0 ? "text-emerald-500" : step.change < 0 ? "text-rose-500" : "text-gray-500"
                                            )}>
                                                {step.change > 0 ? <ArrowUp className="w-2.5 h-2.5 md:w-3 md:h-3 mr-0.5" /> : step.change < 0 ? <ArrowDown className="w-2.5 h-2.5 md:w-3 md:h-3 mr-0.5" /> : <Minus className="w-2.5 h-2.5 md:w-3 md:h-3 mr-0.5" />}
                                                <span className="ml-[1px]">{Math.abs(step.change)}%</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ height }} className="relative w-full pointer-events-auto">
                        {viewMode === 'new' ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={funnelPoints}
                                    layout="horizontal"
                                    margin={{ top: 20, right: 0, left: 0, bottom: 20 }}
                                    stackOffset="none"
                                    overflow="visible"
                                    onMouseMove={(state) => {
                                        if (state && state.activeTooltipIndex !== undefined) {
                                            // Map the chart index back to data index if needed
                                            // The chart uses internal indices based on funnelPoints
                                            // calculating correct data index from tooltip index:
                                            // funnelPoints: [padding, data0, data1, ..., padding]
                                            // If tooltip index is 1 -> data index 0
                                            // If tooltip index is len-2 -> data index len-1
                                            // Actually simplest is to rely on the generic hover behavior which seems to just work with setHoveredIndex(state.activeTooltipIndex) in the previous code?
                                            // Wait, Previous logic:
                                            // if (i === 0) isActive = hoveredIndex <= 1;
                                            // else if (i === data.length - 1) isActive = hoveredIndex >= funnelPoints.length - 2;
                                            // else isActive = hoveredIndex === i + 1;

                                            // This implies chart hover index is shifted by +1 due to padding.
                                            // EXCEPT, if I hover the background layer, I set index 0, 1, 2 directly.
                                            // If I hover the chart, I get 1, 2, 3...
                                            // I need to normalize.

                                            // Let's adjust the chart's onMouseMove to set the correct data index.
                                            const chartIndex = state.activeTooltipIndex;
                                            let dataIndex = -1;
                                            if (chartIndex <= 1) dataIndex = 0;
                                            else if (chartIndex >= funnelPoints.length - 2) dataIndex = data.length - 1;
                                            else dataIndex = chartIndex - 1;

                                            if (dataIndex >= 0 && dataIndex < data.length) {
                                                setHoveredIndex(dataIndex);
                                            }
                                        } else {
                                            setHoveredIndex(null);
                                        }
                                    }}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                >
                                    <defs>
                                        <filter id="funnelCombinedShadow" x="-50%" y="-50%" width="200%" height="200%">
                                            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(0, 0, 0, 0.3)" result="shadowDown" />
                                            <feDropShadow dx="0" dy="-15" stdDeviation="20" floodColor="#14b8a6" floodOpacity="0.4" result="shadowUp" />
                                            <feMerge>
                                                <feMergeNode in="shadowDown" />
                                                <feMergeNode in="shadowUp" />
                                                <feMergeNode in="SourceGraphic" />
                                            </feMerge>
                                        </filter>
                                        <linearGradient id="funnelGradient" x1="0" y1="0" x2="1" y2="0">
                                            {gradientStops}
                                        </linearGradient>
                                    </defs>

                                    <XAxis type="number" dataKey="xOffset" domain={[0, data.length]} hide />
                                    <YAxis type="number" domain={[0, 100]} hide />

                                    {/* Required for hover state calculation in Recharts */}
                                    <Tooltip content={() => null} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />

                                    <Area
                                        type="monotone"
                                        dataKey="spacer"
                                        stackId="1"
                                        stroke="none"
                                        fill="transparent"
                                        isAnimationActive={false}
                                        activeDot={false}
                                        tooltipType="none"
                                    />

                                    <Area
                                        type="monotone"
                                        dataKey="conversionPct"
                                        stackId="1"
                                        stroke="none"
                                        fill="url(#funnelGradient)"
                                        filter="url(#funnelCombinedShadow)"
                                        isAnimationActive={false}
                                        activeDot={false}
                                    >
                                        <LabelList
                                            dataKey="displayValue"
                                            position="center"
                                            content={({ x, width, value, index }) => {
                                                if (!value || funnelPoints[index]?.isPadding) return null;
                                                const centerY = (height) / 2;

                                                const textAnchor = "middle";
                                                const xPos = x + width / 2;

                                                return (
                                                    <text
                                                        x={xPos}
                                                        y={centerY}
                                                        fill="white"
                                                        textAnchor={textAnchor}
                                                        dominantBaseline="middle"
                                                        className="text-sm font-bold drop-shadow-md pointer-events-none"
                                                        style={{
                                                            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                            opacity: 1
                                                        }}
                                                    >
                                                        {value}
                                                    </text>
                                                );
                                            }}
                                        />
                                    </Area>

                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-end pb-5 px-2">
                                {data.map((d, i) => {
                                    const maxValue = Math.max(...data.map(item => item.value)) || 1;
                                    const heightPct = Math.max((d.value / maxValue) * 100, 5); // Min 5% height

                                    const firstValue = data[0]?.value || 1;
                                    const pctLabel = (d.label === data[0].label ? '100%' : `${Math.round((d.value / firstValue) * 100)}%`);

                                    return (
                                        <div key={i} className="flex-1 flex flex-col justify-end items-center h-full">
                                            <div
                                                className="w-[80%] bg-teal-500 rounded-t-md relative flex items-center justify-center transition-all duration-500 ease-out hover:opacity-90"
                                                style={{ height: `${heightPct}%` }}
                                            >
                                                {/* Percentage Label inside bar */}
                                                <span className="text-white font-bold text-sm drop-shadow-md">
                                                    {pctLabel}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});

export default FunnelChart;
