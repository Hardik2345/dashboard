import { useState, useEffect, useMemo } from 'react';
import { useAppSelector } from '../state/hooks.js';

const METRIC_KEYS = {
    FCP: "fcp",
    LCP: "lcp",
    TTFB: "ttfb",
    SESSIONS: "sessions",
    PERFORMANCE: "performance",
};

export default function useWebVitals(query, metric = 'FCP') {
    const [data, setData] = useState({
        performanceAvg: null,
        performancePrev: null,
        performanceChange: null,
        topPages: [],
        loading: true,
    });

    const { user } = useAppSelector((state) => state.auth);
    const globalBrandKey = useAppSelector((state) => state.brand.brand);
    const activeBrandKey = (query?.brand_key || globalBrandKey || user?.brandKey || "").toString().trim().toUpperCase();

    const brand_name = useMemo(() => {
        switch (activeBrandKey) {
            case "TMC": return "TMC";
            case "BBB": return "BlaBliBluLife";
            case "PTS": return "SkincarePersonalTouch";
            default: return activeBrandKey || "";
        }
    }, [activeBrandKey]);

    let start_date, end_date;
    if (query?.start && query?.end) {
        start_date = query.start;
        end_date = query.end;
    } else {
        try {
            const date_range = JSON.parse(localStorage.getItem("pts_date_range_v2"));
            start_date = date_range?.start?.split(":")[0]?.split("T")[0];
            end_date = date_range?.end?.split(":")[0]?.split("T")[0];
        } catch {
            start_date = null;
            end_date = null;
        }
    }

    useEffect(() => {
        let cancelled = false;

        const getPreviousDateWindow = (startStr, endStr) => {
            if (!startStr || !endStr) return { prev_start: null, prev_end: null };
            const startDate = new Date(startStr);
            const endDate = new Date(endStr);
            const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            const prevEnd = new Date(startDate);
            prevEnd.setDate(prevEnd.getDate() - 1);
            const prevStart = new Date(prevEnd);
            prevStart.setDate(prevStart.getDate() - daysDiff + 1);
            return {
                prev_start: prevStart.toISOString().split("T")[0],
                prev_end: prevEnd.toISOString().split("T")[0],
            };
        };

        const fetchData = async (start, end) => {
            if (!brand_name) return [];
            try {
                const res = await fetch(
                    `/api/external-pagespeed/pagespeed?brand_key=${encodeURIComponent(brand_name)}&start_date=${start}&end_date=${end}`
                );
                const json = await res.json();
                return json.results || [];
            } catch (e) {
                console.error("Failed to fetch web vitals", e);
                return [];
            }
        };

        const calculatePageMetric = (results, metricKey) => {
            const grouped = {};
            results.forEach((p) => {
                if (!grouped[p.url]) grouped[p.url] = [];
                grouped[p.url].push(p[metricKey]);
            });
            return Object.entries(grouped).map(([url, arr]) => {
                const isSum = metricKey === "sessions";
                const sum = arr.reduce((a, b) => a + (b || 0), 0);
                return {
                    url,
                    avg: isSum ? sum : sum / arr.length,
                };
            });
        };

        const getWebVitalsData = async () => {
            if (!brand_name || !start_date || !end_date) {
                if (!cancelled) setData(prev => ({ ...prev, loading: false }));
                return;
            }

            if (!cancelled) setData(prev => ({ ...prev, loading: true }));

            const { prev_start, prev_end } = getPreviousDateWindow(start_date, end_date);
            const metricKey = METRIC_KEYS[metric] || 'fcp';

            const [currentData, prevData] = await Promise.all([
                fetchData(start_date, end_date),
                fetchData(prev_start, prev_end)
            ]);

            if (cancelled) return;

            if (!currentData.length && !prevData.length) {
                setData({
                    performanceAvg: null,
                    performancePrev: null,
                    performanceChange: null,
                    topPages: [],
                    loading: false,
                });
                return;
            }

            const curPerf = currentData.reduce((a, b) => a + b.performance, 0) / (currentData.length || 1);
            const prevPerf = prevData.reduce((a, b) => a + b.performance, 0) / (prevData.length || 1);
            const perfChange = prevPerf > 0 ? ((curPerf - prevPerf) / prevPerf) * 100 : null;

            const todayPages = calculatePageMetric(currentData, metricKey);
            const yesterdayPages = calculatePageMetric(prevData, metricKey);

            const combined = todayPages.map((t) => {
                const match = yesterdayPages.find((y) => y.url === t.url);
                let change = null;
                if (match && match.avg > 0) {
                    if (metric === "SESSIONS" || metric === "PERFORMANCE") {
                        change = ((t.avg - match.avg) / match.avg) * 100;
                    } else {
                        change = ((match.avg - t.avg) / match.avg) * 100;
                    }
                }
                return { url: t.url, avg: t.avg, change };
            });

            const isDesc = metric === "SESSIONS" || metric === "PERFORMANCE";
            const top5 = combined
                .sort((a, b) => (isDesc ? b.avg - a.avg : a.avg - b.avg))
                .slice(0, 5);

            setData({
                performanceAvg: curPerf,
                performancePrev: prevPerf,
                performanceChange: perfChange,
                topPages: top5,
                loading: false,
            });
        };

        getWebVitalsData();

        return () => { cancelled = true; };
    }, [brand_name, start_date, end_date, metric]);

    return data;
}
