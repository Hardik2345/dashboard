import React, { useState } from "react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Link,
  Divider,
  useTheme,
  Skeleton,
} from "@mui/material";
import useWebVitals from "../hooks/useWebVitals.js";

const StatBox = ({ children, sx = {} }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        borderRadius: "16px",
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(255, 255, 255, 0.7)",
        backgroundImage: "none",
        backdropFilter: "blur(12px)",
        border: "1px solid",
        borderColor: isDark
          ? "rgba(255, 255, 255, 0.15)"
          : "rgba(0, 0, 0, 0.05)",
        boxShadow: isDark
          ? "0 20px 40px rgba(0, 0, 0, 0.6), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.15)"
          : "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.5)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: isDark
            ? "0 30px 60px rgba(0, 0, 0, 0.8), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.25)"
            : "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};

const WebVitals = ({ query, metric: metricProp = "FCP", onMetricChange }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [localMetric, setLocalMetric] = useState(metricProp);
  const metric = typeof onMetricChange === "function" ? metricProp : localMetric;
  const handleMetricChange = (event) => {
    const nextMetric = event.target.value;
    if (typeof onMetricChange === "function") {
      onMetricChange(nextMetric);
      return;
    }
    setLocalMetric(nextMetric);
  };
  const { topPages, loading } = useWebVitals(query, metric);

  return (
    <StatBox sx={{ height: { xs: "auto", md: "310px" } }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          backgroundColor: isDark
            ? "rgba(0, 0, 0, 0.2)"
            : "rgba(0, 0, 0, 0.04)",
          borderBottom: "1px solid",
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.05)"
            : "rgba(0, 0, 0, 0.05)",
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{ color: "text.primary", fontWeight: 600 }}
        >
          Top 5 Pages ({metric})
        </Typography>

        <FormControl size="small">
          <Select
            value={metric}
            onChange={handleMetricChange}
            sx={{
              height: 30,
              fontSize: "12px",
              color: "text.primary",
              "& .MuiSelect-icon": {
                color: "text.primary",
              },
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

      <Box sx={{ flexGrow: 1, overflowY: "auto", p: 2 }}>
        {loading ? (
          Array.from(new Array(5)).map((_, i) => (
            <Box key={i} sx={{ mb: 2 }}>
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="40%" />
            </Box>
          ))
        ) : topPages.length === 0 ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 180, // ensures it occupies space inside the 310px container
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No top pages exist for this selection.
            </Typography>
          </Box>
        ) : (
          topPages.map((page, idx) => {
            const improved = page.change > 0;
            // Similar URL cleaning logic
            let cleanUrl = page.url.replace(
              /\/[a-z0-9-]+\.myshopify\.com(\/|$)/i,
              "/",
            );
            cleanUrl = cleanUrl.replace(/([^:]\/)\/+/g, "$1");
            let displayUrl = cleanUrl;
            try {
              displayUrl = new URL(cleanUrl).pathname;
            } catch {}

            return (
              <Box key={idx} sx={{ mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    color="text.primary"
                    sx={{ mr: 0.5 }}
                  >
                    {idx + 1}.
                  </Typography>
                  <Link
                    href={cleanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="text.primary"
                    underline="hover"
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      wordBreak: "break-all",
                      lineHeight: 1,
                    }}
                  >
                    {displayUrl}
                  </Link>
                </Box>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  component="div"
                >
                  {metric === "SESSIONS" ? "Sessions" : metric}:{" "}
                  {Math.round(page.avg * 100) / 100}
                  {metric !== "TTFB" &&
                  metric !== "SESSIONS" &&
                  metric !== "PERFORMANCE"
                    ? "s"
                    : ""}
                  {page.change !== null && (
                    <Box
                      component="span"
                      sx={{
                        ml: 1.5,
                        color: improved ? "#10b981" : "#ef4444",
                        fontWeight: 700,
                      }}
                    >
                      {metric === "SESSIONS" || metric === "PERFORMANCE"
                        ? improved
                          ? "▲"
                          : "▼"
                        : improved
                          ? "▼"
                          : "▲"}{" "}
                      {Math.abs(page.change).toFixed(2)}%
                    </Box>
                  )}
                </Typography>

                {idx !== topPages.length - 1 && <Divider sx={{ mt: 1 }} />}
              </Box>
            );
          })
        )}
      </Box>
    </StatBox>
  );
};

export default WebVitals;
