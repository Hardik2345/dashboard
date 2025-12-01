import React, { useEffect, useState } from "react";
import Grid from "@mui/material/Grid2";
import { Box, Typography, Divider } from "@mui/material";

const StatBox = ({ children }) => (
  <Box
    sx={{
      border: "1px solid #e0e0e0",
      borderRadius: "8px",
      padding: "14px 16px",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "#fff",
    }}
  >
    {children}
  </Box>
);

const WebVitals = () => {
  const [webVitals, setWebVitals] = useState({
    performanceAvg: null,
    performancePrev: null,
    performanceChange: null,
    topPDPs: [],
  });

  const brand_name = localStorage.getItem("author_active_brand_v1");
  const date_range = JSON.parse(localStorage.getItem("pts_date_range_v2"));
  const start_date = date_range.start.split(":")[0].split("T")[0];
  const end_date = date_range.end.split(":")[0].split("T")[0];

  const getYesterday = (dateStr) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  };

  const prev_start = getYesterday(start_date);
  const prev_end = getYesterday(end_date);

  const fetchData = async (start, end) => {
    const res = await fetch(
      `https://speed-audit-service.onrender.com/api/pagespeed?brand_name=${brand_name}&start_date=${start}&end_date=${end}`
    );
    return (await res.json()).results;
  };

  const calculatePDPFCP = (results) => {
    const pdps = results.filter((r) => r.url.includes("products"));
    const grouped = {};

    pdps.forEach((p) => {
      if (!grouped[p.url]) grouped[p.url] = [];
      grouped[p.url].push(p.fcp);
    });

    return Object.entries(grouped).map(([url, arr]) => ({
      url,
      avgFCP: arr.reduce((a, b) => a + b, 0) / arr.length,
    }));
  };

  const getWebVitalsData = async () => {
    const currentData = await fetchData(start_date, end_date);
    const prevData = await fetchData(prev_start, prev_end);

    const curPerfArr = currentData.map((i) => i.performance);
    const prevPerfArr = prevData.map((i) => i.performance);

    const curPerf =
      curPerfArr.reduce((a, b) => a + b, 0) / (curPerfArr.length || 1);
    const prevPerf =
      prevPerfArr.reduce((a, b) => a + b, 0) / (prevPerfArr.length || 1);

    const perfChange =
      prevPerf > 0 ? ((curPerf - prevPerf) / prevPerf) * 100 : null;

    const todayPDP = calculatePDPFCP(currentData);
    const yesterdayPDP = calculatePDPFCP(prevData);

    const combined = todayPDP.map((t) => {
      const match = yesterdayPDP.find((y) => y.url === t.url);

      let change = null;
      if (match && match.avgFCP > 0) {
        change = ((match.avgFCP - t.avgFCP) / match.avgFCP) * 100;
      }

      return {
        url: t.url,
        avgFCP: t.avgFCP,
        changeFCP: change,
      };
    });

    const top5 = combined.sort((a, b) => a.avgFCP - b.avgFCP).slice(0, 5);

    setWebVitals({
      performanceAvg: curPerf,
      performancePrev: prevPerf,
      performanceChange: perfChange,
      topPDPs: top5,
    });
  };

  useEffect(() => {
    getWebVitalsData();
  }, []);

  const perfChange = webVitals.performanceChange;
  const perfImproved = perfChange > 0;

  return (
    <>
      {/* SECTION HEADER */}
      <Box sx={{ display: "flex", alignItems: "center", my: 2 }}>
        <Box sx={{ flexGrow: 1, height: "1px", backgroundColor: "#ddd" }} />
        <Typography
          variant="subtitle2"
          sx={{ mx: 2, color: "#666", fontWeight: 600 }}
        >
          Web Vitals
        </Typography>
        <Box sx={{ flexGrow: 1, height: "1px", backgroundColor: "#ddd" }} />
      </Box>

      <Grid container spacing={1.5} columns={{ xs: 2, sm: 6 }}>

        {/* PERFORMANCE BLOCK */}
        <Grid size={{ xs: 2, sm: 3 }}>
          <StatBox>
            <Box
              sx={{
                width: "100%",
                height: "100%",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",   // FULL CENTERED
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ color: "#555", fontWeight: 600 }}
              >
                Performance (Avg)
              </Typography>

              <Typography variant="h4" fontWeight="bold" sx={{ mt: 0.5 }}>
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
                  {perfImproved ? "▲" : "▼"} {Math.abs(perfChange).toFixed(2)}%
                </Typography>
              )}
            </Box>
          </StatBox>
        </Grid>

        {/* PDP LIST BLOCK */}
        <Grid size={{ xs: 2, sm: 3 }}>
          <StatBox>
            <Typography
              variant="subtitle2"
              sx={{ color: "#555", fontWeight: 600, mb: 1 }}
            >
              Top 5 PDPs (FCP)
            </Typography>

            <Box
              sx={{
                maxHeight: "160px",
                overflowY: "auto",
                pr: 1,
              }}
            >
              {webVitals.topPDPs.slice(0, 5).map((pdp, idx) => {
                const improved = pdp.changeFCP > 0;
                return (
                  <Box key={idx} sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {idx + 1}. {pdp.url.split("/products/")[1]}
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                      FCP: {pdp.avgFCP.toFixed(2)}s
                    </Typography>

                    {pdp.changeFCP !== null && (
                      <Typography
                        variant="caption"
                        sx={{
                          ml: 1.5,
                          color: improved ? "green" : "red",
                          fontWeight: 600,
                        }}
                      >
                        {improved ? "▲" : "▼"}{" "}
                        {Math.abs(pdp.changeFCP).toFixed(2)}%
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
