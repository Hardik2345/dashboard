import { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, useTheme, Select, MenuItem, FormControl, Box, Grid } from '@mui/material';
import { Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip as ChartTooltip,
} from 'chart.js';
import { getTrafficSourceSplit } from '../lib/api.js';

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
            .then(res => { if (!cancelled) { setData(res); setLoading(false); } })
            .catch(() => setLoading(false));
        return () => { cancelled = true; };
    }, [query]);

    const getMetricValue = (sourceObj) => sourceObj ? Number(sourceObj[metric] || 0) : 0;

    const validData = data && !data.error;
    const metaVal = validData ? getMetricValue(data.meta) : 0;
    const googleVal = validData ? getMetricValue(data.google) : 0;
    const directVal = validData ? getMetricValue(data.direct) : 0;
    const othersVal = validData ? getMetricValue(data.others) : 0;

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

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: theme.palette.background.paper,
                titleColor: theme.palette.text.primary,
                bodyColor: theme.palette.text.primary,
                borderColor: theme.palette.divider,
                borderWidth: 1,
                padding: 10,
                titleFont: { size: 12, weight: 'bold' },
                bodyFont: { size: 12 },
                callbacks: {
                    label: (ctx) => {
                        const label = ctx.label;
                        const raw = ctx.parsed;
                        const pct = ctx.chart._metasets[ctx.datasetIndex].total > 0
                            ? (raw / ctx.chart._metasets[ctx.datasetIndex].total) * 100
                            : 0;
                        return `${label}: ${nfCompact.format(raw)} (${nfPct1.format(pct)}%)`;
                    }
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
    }), [theme]);

    const getPercent = (val) => total > 0 ? (val / total) * 100 : 0;

    // Count component for Total
    const AnimatedTotal = ({ val }) => {
        const count = useCountUp(val);
        return nfCompact.format(Math.round(count));
    };

    const DetailItem = ({ label, value, color }) => {
        // We calculate pct based on current valid total, not animated total to avoid jumpiness
        const pct = getPercent(value);
        const animatedValue = useCountUp(value);

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

                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack spacing={0.25}>
                        <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ fontSize: '0.8rem' }}>{label}</Typography>
                        <Stack direction="row" alignItems="baseline" spacing={0.5}>
                            <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '1rem' }}>
                                {nfCompact.format(Math.round(animatedValue))}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                ({nfPct1.format(pct)}%)
                            </Typography>
                        </Stack>
                    </Stack>
                    <Box sx={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}15` }}>
                        <Typography variant="caption" fontWeight={700} sx={{ color: color }}>{Math.round(pct)}%</Typography>
                    </Box>
                </Stack>
            </Box>
        );
    };

    return (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}> {/* Reduced main padding */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Stack spacing={0.25}>
                        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.1rem' }}>Traffic Split</Typography>
                        <Typography variant="caption" color="text.secondary">By Source Group</Typography>
                    </Stack>

                    <FormControl size="small">
                        <Select
                            value={metric}
                            onChange={(e) => setMetric(e.target.value)}
                            disableUnderline
                            variant="standard"
                            sx={{
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                bgcolor: theme.palette.action.selected,
                                px: 2,
                                py: 0.5,
                                borderRadius: 8,
                                '& .MuiSelect-select': { py: 0, pr: '24px !important' },
                                '&:hover': { bgcolor: theme.palette.action.hover },
                                transition: 'all 0.2s'
                            }}
                        >
                            <MenuItem value="sessions">Sessions</MenuItem>
                            <MenuItem value="atc_sessions">ATC Sessions</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>

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
                                    <DetailItem label="Meta" value={metaVal} color={colors.meta} />
                                </Grid>
                                <Grid item xs={6}>
                                    <DetailItem label="Google" value={googleVal} color={colors.google} />
                                </Grid>
                                <Grid item xs={6}>
                                    <DetailItem label="Direct" value={directVal} color={colors.direct} />
                                </Grid>
                                <Grid item xs={6}>
                                    <DetailItem label="Others" value={othersVal} color={colors.others} />
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                )}
            </CardContent>
        </Card>
    );
}
