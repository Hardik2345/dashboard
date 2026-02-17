import React, { useMemo, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, LabelList, YAxis, Tooltip } from 'recharts';
import { Card, CardContent, useTheme } from '@mui/material';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function FunnelChart({
    data = [],
    height = 300,
    className,
    showHeader = true
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [hoveredIndex, setHoveredIndex] = useState(null);

    // Process data to calculate scaling and centering
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        const maxValue = Math.max(...data.map(d => d.value)) || 1;
        const maxSqrtValue = Math.sqrt(maxValue); // Use SQRT for visual scaling

        // Text is approx 24px tall.
        const minHeightPx = 24;
        const minPct = (minHeightPx / height) * 100;

        return data.map((item, index) => {
            // Calculate VISUAL percentage using square root to compress the range
            // This makes smaller values appear larger relative to the max
            const rawPct = (Math.sqrt(item.value) / maxSqrtValue) * 100;

            // Enforce minimum thickness so label fits inside
            const conversionPct = Math.max(rawPct, minPct);

            // Calculation for centering
            const spacer = (100 - conversionPct) / 2;

            // Calculate percentage label relative to the FIRST item (100% base)
            const firstValue = data[0]?.value || 1;
            const pctLabel = index === 0 ? '100%' : `${Math.round((item.value / firstValue) * 100)}%`;

            return {
                ...item,
                conversionPct,
                spacer,
                displayValue: pctLabel,
                rawValue: item.value,
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
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                {showHeader && (
                    <div className="flex justify-between mb-8">
                        {data.map((step, i) => (
                            <div key={i} className="flex flex-col flex-1 min-w-0 pl-2 md:pl-4 first:pl-0 border-l first:border-l-0 border-dashed border-gray-200 dark:border-gray-800">
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

                <div style={{ height }} className="relative w-full">
                    {/* Vertical Separators */}
                    <div className="absolute inset-0 flex pointer-events-none z-0">
                        {data.slice(0, -1).map((_, i) => (
                            <div
                                key={i}
                                className="flex-1 border-r border-gray-300 dark:border-gray-700 h-full relative"
                            >
                                <div className="absolute top-0 bottom-0 right-[-1px] w-[1px] bg-gray-300 dark:bg-gray-700"></div>
                            </div>
                        ))}
                        <div className="flex-1" />
                    </div>

                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            layout="horizontal"
                            margin={{ top: 20, right: 0, left: 0, bottom: 20 }}
                            stackOffset="none"
                            overflow="visible"
                            onMouseMove={(state) => {
                                if (state && state.activeTooltipIndex !== undefined) {
                                    setHoveredIndex(state.activeTooltipIndex);
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
                                isAnimationActive={true}
                                animationDuration={1000}
                                activeDot={false}
                            >
                                <LabelList
                                    dataKey="displayValue"
                                    position="center"
                                    content={({ x, width, value, index }) => {
                                        if (!value) return null;
                                        const centerY = (height) / 2;

                                        let textAnchor = "middle";
                                        let xPos = x + width / 2;

                                        if (index === 0) {
                                            textAnchor = "start";
                                            xPos = x + 10;
                                        } else if (index === data.length - 1) {
                                            textAnchor = "end";
                                            xPos = x + width - 10;
                                        }

                                        const isHovered = index === hoveredIndex;

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
                                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                                    transform: isHovered ? 'translateY(-6px) scale(1.15)' : 'translateY(0) scale(1)', // The "Uplift" Animation
                                                    transformOrigin: `${xPos}px ${centerY}px`, // Ensure scale bubbles from center
                                                    opacity: isHovered ? 1 : 0.9 // Subtle focus
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
                </div>
            </CardContent>
        </Card>
    );
}
