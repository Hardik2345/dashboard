import React, { useEffect, useState } from "react";
import Grid from "@mui/material/Grid2";
import {
  Box,
  Typography,
  Divider,
  Select,
  MenuItem,
  FormControl,
  useTheme,
  Link,
} from "@mui/material";
import { useAppSelector } from "../state/hooks.js";

const StatBox = ({ children }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: isDark ? 'grey.700' : '#e0e0e0',
        borderRadius: "8px",
        padding: "14px 16px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: isDark ? 'grey.900' : '#fff',
      }}
    >
      {children}
    </Box>
  );
};

const METRIC_KEYS = {
  FCP: "fcp",
  LCP: "lcp",
  TTFB: "ttfb",
  SESSIONS: "sessions",
  PERFORMANCE: "performance",
};

const WebVitals = ({ query }) => {
  const [metric, setMetric] = useState("FCP"); // dropdown selection
  const [webVitals, setWebVitals] = useState({
    performanceAvg: null,
    performancePrev: null,
    performanceChange: null,
    topPages: [],
  });
  const { user } = useAppSelector((state) => state.auth);
  const globalBrandKey = useAppSelector((state) => state.brand.brand);

  const activeBrandKey = (globalBrandKey || user?.brandKey || "").toString().trim().toUpperCase();

  let brand_name;
  switch (activeBrandKey) {
    case "TMC":
      brand_name = "TMC";
      break;
    case "BBB":
      brand_name = "BlaBliBluLife";
      break;
    case "PTS":
      brand_name = "SkincarePersonalTouch";
      break;
    default:
      brand_name = activeBrandKey || "";
  }

  // Use dates from query prop if available, otherwise fall back to localStorage
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

  // Calculate the previous equivalent date window
  // e.g., if selected range is Nov 27-30 (4 days), prev range should be Nov 23-26
  const getPreviousDateWindow = (startStr, endStr) => {
    if (!startStr || !endStr) return { prev_start: null, prev_end: null };

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);

    // Calculate the number of days in the selected range (inclusive)
    const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    // Previous window ends one day before current start
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);

    // Previous window starts (daysDiff) days before prevEnd
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff + 1);

    return {
      prev_start: prevStart.toISOString().split("T")[0],
      prev_end: prevEnd.toISOString().split("T")[0],
    };
  };

  const { prev_start, prev_end } = getPreviousDateWindow(start_date, end_date);

  const fetchData = async (start, end) => {
    if (!brand_name) return []; // <-- don't call API without brand
    const res = await fetch(
      `/api/external-pagespeed/pagespeed?brand_key=${encodeURIComponent(
        brand_name
      )}&start_date=${start}&end_date=${end}`
    );
    return (await res.json()).results;
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
    if (!brand_name || !start_date || !end_date) return; // <-- nothing to do yet

    const metricKey = METRIC_KEYS[metric];

    const currentData = await fetchData(start_date, end_date);
    const prevData = await fetchData(prev_start, prev_end);

    if (!currentData.length && !prevData.length) {
      setWebVitals({
        performanceAvg: null,
        performancePrev: null,
        performanceChange: null,
        topPages: [],
      });
      return;
    }

    // Performance block
    const curPerf =
      currentData.reduce((a, b) => a + b.performance, 0) /
      (currentData.length || 1);

    const prevPerf =
      prevData.reduce((a, b) => a + b.performance, 0) / (prevData.length || 1);

    const perfChange =
      prevPerf > 0 ? ((curPerf - prevPerf) / prevPerf) * 100 : null;

    // Page metric block (dynamic)
    const todayPages = calculatePageMetric(currentData, metricKey);
    const yesterdayPages = calculatePageMetric(prevData, metricKey);

    const combined = todayPages.map((t) => {
      const match = yesterdayPages.find((y) => y.url === t.url);

      let change = null;
      if (match && match.avg > 0) {
        if (metric === "SESSIONS" || metric === "PERFORMANCE") {
          // Higher is better -> (Current - Prev) / Prev
          change = ((t.avg - match.avg) / match.avg) * 100;
        } else {
          // Lower is better -> (Prev - Current) / Prev
          change = ((match.avg - t.avg) / match.avg) * 100;
        }
      }

      return {
        url: t.url,
        avg: t.avg,
        change,
      };
    });

    const isDesc = metric === "SESSIONS" || metric === "PERFORMANCE";
    const top5 = combined
      .sort((a, b) => (isDesc ? b.avg - a.avg : a.avg - b.avg))
      .slice(0, 5);

    setWebVitals({
      performanceAvg: curPerf,
      performancePrev: prevPerf,
      performanceChange: perfChange,
      topPages: top5,
    });
  };

  useEffect(() => {
    getWebVitalsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, brand_name, start_date, end_date]);

  const perfChange = webVitals.performanceChange;
  const perfImproved = perfChange > 0;

  return (
    <>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", my: 2 }}>
        <Box sx={{ flexGrow: 1, height: "1px", bgcolor: "divider" }} />
        <Typography
          variant="subtitle2"
          sx={{ mx: 2, color: "text.primary", fontWeight: 600 }}
        >
          Web Vitals
        </Typography>
        <Box sx={{ flexGrow: 1, height: "1px", bgcolor: "divider" }} />
      </Box>

      <Grid container spacing={1.5} columns={{ xs: 2, sm: 6 }}>
        {/* PERFORMANCE TILE */}
        <Grid size={{ xs: 2, sm: 3 }}>
          <StatBox>
            <Box
              sx={{
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ color: "text.secondary", fontWeight: 600 }}
              >
                Performance (Avg)
              </Typography>

              <Typography variant="h4" fontWeight="bold" sx={{ mt: 0.5, color: "text.primary" }}>
                {webVitals.performanceAvg
                  ? webVitals.performanceAvg.toFixed(2)
                  : "---"}
              </Typography>

              {perfChange !== null && (
                <Typography
                  variant="caption"
                  sx={{
                    color: perfImproved ? "green" : "red",
                    fontWeight: 600,
                  }}
                >
                  {perfChange > 0 ? "▲" : "▼"} {Math.abs(perfChange).toFixed(2)}%
                </Typography>
              )}
            </Box>
          </StatBox>
        </Grid>

        {/* PDP TILE */}
        <Grid size={{ xs: 2, sm: 3 }}>
          <StatBox>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ color: "text.primary", fontWeight: 600 }}
              >
                Top 5 Pages ({metric})
              </Typography>

              {/* METRIC DROPDOWN */}
              <FormControl size="small">
                <Select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  sx={{
                    height: 28,
                    fontSize: "12px",
                    color: "text.primary",
                    '& .MuiSelect-icon': {
                      color: "text.primary"
                    }
                  }}
                >
                  <MenuItem value="FCP">FCP</MenuItem>
                  <MenuItem value="LCP">LCP</MenuItem>
                  <MenuItem value="TTFB">TTFB</MenuItem>
                  <MenuItem value="PERFORMANCE">Performance</MenuItem>
                  <MenuItem value="SESSIONS">Sessions</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ maxHeight: "150px", overflowY: "auto", pr: 1 }}>
              {webVitals.topPages.map((page, idx) => {
                const improved = page.change > 0;

                // Fix double domain issue in URL/Path
                // e.g. https://site.com/site.myshopify.com/products/... -> https://site.com/products/...
                let cleanUrl = page.url.replace(/\/[a-z0-9-]+\.myshopify\.com(\/|$)/i, "/");
                // Ensure no double slashes after protocol
                cleanUrl = cleanUrl.replace(/([^:]\/)\/+/g, "$1");

                let displayUrl = cleanUrl;
                try {
                  displayUrl = new URL(cleanUrl).pathname;
                } catch {
                  // fallback
                }

                return (
                  <Box key={idx} sx={{ mb: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ mr: 0.5 }}>
                        {idx + 1}.
                      </Typography>
                      <Link
                        href={cleanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        color="text.primary"
                        underline="hover"
                        variant="body2"
                        sx={{ fontWeight: 600, wordBreak: "break-all" }}
                      >
                        {displayUrl}
                      </Link>
                    </Box>

                    <Typography variant="caption" color="text.secondary" component="div">
                      {metric === "SESSIONS" ? "Sessions" : metric}: {Math.round(page.avg * 100) / 100}
                      {metric !== "TTFB" && metric !== "SESSIONS" && metric !== "PERFORMANCE" ? "s" : ""}

                      {page.change !== null && (
                        <Box component="span" sx={{ ml: 1.5, color: improved ? "green" : "red", fontWeight: 700 }}>
                          {(metric === "SESSIONS" || metric === "PERFORMANCE")
                            ? (improved ? "▲" : "▼")
                            : (improved ? "▼" : "▲")
                          } {Math.abs(page.change).toFixed(2)}%
                        </Box>
                      )}
                    </Typography>

                    {idx !== 4 && <Divider sx={{ mt: 1 }} />}
                  </Box>
                );
              })}
            </Box>
          </StatBox>
        </Grid>
      </Grid>
    </>
  );
};

export default WebVitals;
