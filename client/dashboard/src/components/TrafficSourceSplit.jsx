import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, useTheme, Select, MenuItem, FormControl, Box, Grid } from '@mui/material';
import { ArrowDropUp, ArrowDropDown } from '@mui/icons-material';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip as ChartTooltip,
} from 'chart.js';
import { getTrafficSourceSplit } from '../lib/api.js';
import dayjs from 'dayjs';

ChartJS.register(ArcElement, ChartTooltip);

const nfPct1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nfCompact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

function useCountUp(end, duration = 800) {
    const [count, setCount] = useState(0);
    const countRef = useRef(0);

    useEffect(() => {
        let startTime = null;
        const startVal = countRef.current;
        const diff = end - startVal;

        if (diff === 0) return;

        let frameId;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);

            // Ease Out Quart
            const ease = 1 - Math.pow(1 - percentage, 4);

            const current = startVal + (diff * ease);
            setCount(current);
            countRef.current = current;

            if (progress < duration) {
                frameId = requestAnimationFrame(animate);
            } else {
                setCount(end);
                countRef.current = end;
            }
        };

        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, [end, duration]);

    return count;
}

export default function TrafficSourceSplit({ query }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [metric, setMetric] = useState('sessions'); // 'sessions' or 'atc_sessions'

    useEffect(() => {
        let cancelled = false;
        if (!query?.start || !query?.end) {
            setData(null);
            setLoading(false);
            return () => { cancelled = true; };
        }
        setLoading(true);

        getTrafficSourceSplit(query)
            .then(res => {
                if (!cancelled) { setData(res); setLoading(false); }
            })
            .catch(() => setLoading(false));
        return () => { cancelled = true; };
    }, [query]);

    const getMetricValue = (sourceObj) => sourceObj ? Number(sourceObj[metric] || 0) : 0;

    const validData = data && !data.error;
    const metaVal = validData ? getMetricValue(data.meta) : 0;
    const googleVal = validData ? getMetricValue(data.google) : 0;
    const directVal = validData ? getMetricValue(data.direct) : 0;
    const othersVal = validData ? getMetricValue(data.others) : 0;

    const getDelta = (sourceObj) => {
        if (!sourceObj || !validData) return undefined;
        const d = metric === 'sessions' ? sourceObj.delta : sourceObj.atc_delta;
        // If atc_delta is missing but we are in atc_sessions mode, it might be 0 or backend not updated
        if (d === undefined || d === null) return 0;
        return d;
    };


    // Derived comparison range
    const comparisonRange = useMemo(() => {
        if (data?.prev_range) return data.prev_range;
        if (!query?.start || !query?.end) return null;
        try {
            const s = dayjs(query.start);
            const e = dayjs(query.end);
            const diffDays = e.diff(s, 'day') + 1;
            const pEnd = s.subtract(1, 'day');
            const pStart = pEnd.subtract(diffDays - 1, 'day');
            return {
                start: pStart.format('YYYY-MM-DD'),
                end: pEnd.format('YYYY-MM-DD')
            };
        } catch (err) {
            console.error("Error deriving comparison range:", err);
            return null;
        }
    }, [data?.prev_range, query?.start, query?.end]);

    const total = metaVal + googleVal + directVal + othersVal;
    const empty = total === 0;

    // Vibrant Colors (No Grey)
    const colors = {
        meta: '#2979FF',      // Bright Blue
        google: '#FF1744',    // Bright Red
        direct: '#00E676',    // Bright Green/Teal (Replacing Grey)
        others: '#D500F9',    // Bright Purple
    };

    const chartData = useMemo(() => ({
        labels: ['Meta', 'Google', 'Direct', 'Others'],
        datasets: [
            {
                label: 'Traffic Sources',
                data: [metaVal, googleVal, directVal, othersVal],
                backgroundColor: [colors.meta, colors.google, colors.direct, colors.others],
                borderWidth: 0,
                hoverOffset: 6,
            },
        ],
    }), [metaVal, googleVal, directVal, othersVal]);

    const tooltipRef = useRef(null);
    const tooltipHoverRef = useRef(false);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: false,
                external: (context) => {
                    const { chart, tooltip } = context;
                    const tooltipEl = tooltipRef.current;

                    if (!tooltipEl) return;

                    if (tooltip.opacity === 0) {
                        // Only hide if not hovering the tooltip itself
                        if (!tooltipHoverRef.current) {
                            tooltipEl.style.opacity = 0;
                        }
                        return;
                    }

                    // Set Content
                    if (tooltip.body) {
                        const dataPoint = tooltip.dataPoints[0];
                        const datasetIndex = dataPoint.datasetIndex;
                        const index = dataPoint.dataIndex;
                        const label = chart.data.labels[index];

                        let contentHtml = '';

                        // Header
                        contentHtml += `<div style="font-weight: 700; font-size: 13px; margin-bottom: 6px; color: ${isDark ? '#fff' : '#000'}">${label}</div>`;

                        // Main Value
                        const raw = dataPoint.raw;
                        const totalVal = chart._metasets[datasetIndex].total;
                        const pct = totalVal > 0 ? (raw / totalVal) * 100 : 0;
                        contentHtml += `<div style="font-size: 12px; margin-bottom: 8px;">${nfCompact.format(raw)} (${nfPct1.format(pct)}%)</div>`;

                        // Breakdown logic (Others or Meta)
                        const isOthers = label === 'Others' && data?.others_breakdown?.length > 0;
                        const isMeta = label === 'Meta' && data?.meta_breakdown?.length > 0;

                        if (isOthers || isMeta) {
                            const breakdown = isOthers ? data.others_breakdown : data.meta_breakdown;

                            contentHtml += `<div style="border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; margin: 4px 0; padding-top: 4px;"></div>`;
                            contentHtml += `<div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px;">Top Sources</div>`;

                            // Scrollable container
                            contentHtml += `<div style="max-height: 120px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: ${isDark ? 'rgba(255,255,255,0.2) transparent' : 'rgba(0,0,0,0.2) transparent'};">`;

                            breakdown.forEach(d => {
                                contentHtml += `
                                    <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; align-items: center;">
                                        <span style="opacity: 0.9;">${d.name}</span>
                                        <span style="opacity: 0.7; font-family: monospace;">${nfCompact.format(d.sessions)}</span>
                                    </div>
                                `;
                            });

                            contentHtml += `</div>`;
                        }

                        tooltipEl.innerHTML = contentHtml;
                    }

                    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;

                    // Display, position, and set styles for font
                    tooltipEl.style.opacity = 1;

                    const tooltipRect = tooltipEl.getBoundingClientRect();

                    // Center horizontal
                    let left = positionX + tooltip.caretX;

                    // Vertical Positioning: Pivot based on chart center
                    const yOffset = 10;
                    const centerY = chart.height / 2;
                    let top;

                    if (tooltip.caretY > centerY) {
                        // Keep tooltip TOP if cursor is in BOTTOM half
                        top = positionY + tooltip.caretY - tooltipRect.height - yOffset;
                    } else {
                        // Keep tooltip BOTTOM if cursor is in TOP half
                        top = positionY + tooltip.caretY + yOffset;
                    }

                    // Horizontal Clamping
                    if (left + (tooltipRect.width / 2) > chart.width) {
                        left = positionX + chart.width - (tooltipRect.width / 2);
                    } else if (left - (tooltipRect.width / 2) < 0) {
                        left = positionX + (tooltipRect.width / 2);
                    }

                    tooltipEl.style.left = left + 'px';
                    tooltipEl.style.top = top + 'px';
                }
            }
        },
        cutout: '70%',
        animation: {
            animateScale: true,
            animateRotate: true,
            duration: 800,
            easing: 'easeInOutQuart'
        },
        transitions: {
            active: {
                animation: {
                    duration: 400
                }
            }
        }
    }), [theme, data]);

    const getPercent = (val) => total > 0 ? (val / total) * 100 : 0;

    // Count component for Total
    const AnimatedTotal = ({ val }) => {
        const count = useCountUp(val);
        return nfCompact.format(Math.round(count));
    };

    const DetailItem = ({ label, value, color, delta }) => {
        // We calculate pct based on current valid total, not animated total to avoid jumpiness
        const pct = getPercent(value);
        const animatedValue = useCountUp(value);

        const deltaColor = delta > 0 ? '#00C853' : delta < 0 ? '#FF1744' : 'text.secondary';
        const deltaIcon = delta > 0 ? '+' : '';
        const formattedDelta = delta !== undefined && delta !== null ? `${deltaIcon}${Math.round(delta)}%` : '-';

        return (
            <Box
                sx={{
                    p: 1.25, // Slightly reduced padding
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    border: '1px solid',
                    borderColor: 'divider',
                    mb: 1.5,
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease' // Smooth transition for hover effects or updates
                }}
            >
                {/* Background color hint - Only Left Border */}
                <Box
                    sx={{
                        position: 'absolute', top: 0, bottom: 0, left: 0, width: 4,
                        bgcolor: color
                    }}
                />

                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Stack spacing={0.25} sx={{ minWidth: 'fit-content' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ fontSize: '0.8rem' }}>{label}</Typography>
                        <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                                {nfCompact.format(Math.round(animatedValue))}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                ({nfPct1.format(pct)}%)
                            </Typography>
                        </Stack>
                    </Stack>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8, flexShrink: 0, flexWrap: 'nowrap' }}>
                        <Box sx={{ width: 34, height: 24, borderRadius: '30%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: isDark ? 'rgba(102, 119, 121, 0.44)' : 'rgba(102, 119, 121, 0.06)', flexShrink: 0 }}>
                            <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{Math.round(pct)}%</Typography>
                        </Box>
                        {delta !== undefined && (
                            <Stack direction="row" alignItems="center" spacing={0} sx={{ bgcolor: delta > 0 ? '#00c85315' : delta < 0 ? '#ff174415' : 'transparent', px: 0.5, py: 0.2, borderRadius: 1 }}>
                                {delta > 0 ? (
                                    <ArrowDropUp sx={{ color: deltaColor, fontSize: '1.1rem', ml: -0.5 }} />
                                ) : delta < 0 ? (
                                    <ArrowDropDown sx={{ color: deltaColor, fontSize: '1.1rem', ml: -0.5 }} />
                                ) : null}
                                <Typography variant="caption" fontWeight={700} sx={{ color: deltaColor, fontSize: '0.75rem' }}>
                                    {Math.abs(Math.round(delta))}%
                                </Typography>
                            </Stack>
                        )}
                    </Box>
                </Stack>
            </Box>
        );
    };

    return (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}> {/* Reduced main padding */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                        <Box sx={{ flex: '1 1 auto', minWidth: '150px' }}>
                            <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.1rem', lineHeight: 1.2 }}>Traffic Split</Typography>
                            <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ display: 'block', mt: 0.25 }}>By Source Group</Typography>
                        </Box>

                        <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                                value={metric}
                                onChange={(e) => setMetric(e.target.value)}
                                sx={{
                                    height: 32,
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    borderRadius: 1.5,
                                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                    '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                                    '&:hover .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                }}
                            >
                                <MenuItem value="sessions" sx={{ fontSize: '0.75rem' }}>Sessions</MenuItem>
                                <MenuItem value="atc_sessions" sx={{ fontSize: '0.75rem' }}>ATC Sessions</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    {comparisonRange && query?.start && query?.end && (
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
                                    return `${fmt(query.start, query.end)} vs ${fmt(comparisonRange.start, comparisonRange.end)}`;
                                })()}
                            </Typography>
                        </Box>
                    )}
                </Box>

                {loading ? (
                    <Skeleton variant="rounded" width="100%" height={240} />
                ) : empty ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                        <Typography variant="body1" color="text.secondary">No data available.</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2} alignItems="center"> {/* Reduced spacing */}
                        <Grid item xs={12} md={5}>
                            <Box sx={{ position: 'relative', height: 180, width: '100%', display: 'flex', justifyContent: 'center' }}> {/* Reduced height */}
                                <Doughnut data={chartData} options={options} />
                                <div
                                    ref={tooltipRef}
                                    onMouseEnter={() => { tooltipHoverRef.current = true; }}
                                    onMouseLeave={() => {
                                        tooltipHoverRef.current = false;
                                        if (tooltipRef.current) tooltipRef.current.style.opacity = 0;
                                    }}
                                    style={{
                                        opacity: 0,
                                        position: 'absolute',
                                        background: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                        color: isDark ? '#fff' : '#000',
                                        borderRadius: '8px',
                                        pointerEvents: 'auto',
                                        transform: 'translate(-50%, 0)',
                                        transition: 'all .1s ease',
                                        padding: '12px',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                                        fontSize: '12px',
                                        zIndex: 10,
                                        border: `1px solid ${theme.palette.divider}`,
                                        minWidth: '180px',
                                        backdropFilter: 'blur(4px)',
                                    }}
                                />
                                <Box sx={{
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                    textAlign: 'center', pointerEvents: 'none',
                                    transition: 'opacity 0.3s ease'
                                }}>
                                    <Typography variant="h6" fontWeight={800} lineHeight={1}>
                                        <AnimatedTotal val={total} />
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>Total</Typography>
                                </Box>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={7}>
                            <Grid container spacing={1.5}> {/* Reduced inner spacing */}
                                <Grid item xs={6}>
                                    <DetailItem label="Meta" value={metaVal} color={colors.meta} delta={getDelta(data.meta)} />
                                </Grid>
                                <Grid item xs={6}>
                                    <DetailItem label="Google" value={googleVal} color={colors.google} delta={getDelta(data.google)} />
                                </Grid>
                                <Grid item xs={6}>
                                    <DetailItem label="Direct" value={directVal} color={colors.direct} delta={getDelta(data.direct)} />
                                </Grid>
                                <Grid item xs={6}>
                                    <DetailItem label="Others" value={othersVal} color={colors.others} delta={getDelta(data.others)} />
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                )}
            </CardContent>
        </Card>
    );
}