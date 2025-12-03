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
};

const WebVitals = ({ query }) => {
  const [metric, setMetric] = useState("FCP"); // dropdown selection
  const [webVitals, setWebVitals] = useState({
    performanceAvg: null,
    performancePrev: null,
    performanceChange: null,
    topPDPs: [],
  });
  const { user } = useAppSelector((state) => state.auth);
  const globalBrandKey = useAppSelector((state) => state.brand.brand);

  const isAuthor = !!user?.isAuthor;
  const activeBrandKey = isAuthor
    ? (globalBrandKey || "").toString().trim().toUpperCase()
    : (user?.brandKey || "").toString().trim().toUpperCase();

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
    case "MILA":
      brand_name = "MilaBeaute";
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
      `https://speed-audit-service.onrender.com/api/pagespeed?brand_name=${encodeURIComponent(
        brand_name
      )}&start_date=${start}&end_date=${end}`
    );
    return (await res.json()).results;
  };

  const calculatePDPMetric = (results, metricKey) => {
    const pdps = results.filter((r) => r.url.includes("products"));
    const grouped = {};

    pdps.forEach((p) => {
      if (!grouped[p.url]) grouped[p.url] = [];
      grouped[p.url].push(p[metricKey]);
    });

    return Object.entries(grouped).map(([url, arr]) => ({
      url,
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
    }));
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
        topPDPs: [],
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

    // PDP metric block (dynamic)
    const todayPDP = calculatePDPMetric(currentData, metricKey);
    const yesterdayPDP = calculatePDPMetric(prevData, metricKey);

    const combined = todayPDP.map((t) => {
      const match = yesterdayPDP.find((y) => y.url === t.url);

      let change = null;
      if (match && match.avg > 0) {
        // Lower is better → change positive means improvement
        change = ((match.avg - t.avg) / match.avg) * 100;
      }

      return {
        url: t.url,
        avg: t.avg,
        change,
      };
    });

    const top5 = combined.sort((a, b) => a.avg - b.avg).slice(0, 5);

    setWebVitals({
      performanceAvg: curPerf,
      performancePrev: prevPerf,
      performanceChange: perfChange,
      topPDPs: top5,
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
                Top 5 PDPs ({metric})
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
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ maxHeight: "150px", overflowY: "auto", pr: 1 }}>
              {webVitals.topPDPs.map((pdp, idx) => {
                const improved = pdp.change > 0;

                return (
                  <Box key={idx} sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight={600} color="text.primary">
                      {idx + 1}. {pdp.url.split("/products/")[1]}
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                      {metric}: {pdp.avg.toFixed(2)}
                      {metric !== "TTFB" ? "s" : ""}
                    </Typography>

                    {pdp.change !== null && (
                      <Typography
                        variant="caption"
                        sx={{
                          ml: 1.5,
                          color: improved ? "green" : "red",
                          fontWeight: 600,
                        }}
                      >
                        {improved ? "▼" : "▲"} {Math.abs(pdp.change).toFixed(2)}
                        %
                      </Typography>
                    )}

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
