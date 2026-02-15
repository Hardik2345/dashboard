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
  Skeleton
} from "@mui/material";
import useWebVitals from "../hooks/useWebVitals.js";

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

const WebVitals = ({ query }) => {
  const [metric, setMetric] = useState("FCP");
  const { topPages, loading } = useWebVitals(query, metric);

  return (
    <StatBox>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
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

      <Box sx={{ flexGrow: 1, overflowY: "auto", pr: 1 }}>
        {loading ? (
          Array.from(new Array(5)).map((_, i) => (
            <Box key={i} sx={{ mb: 2 }}>
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="40%" />
            </Box>
          ))
        ) : topPages.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No data available for this selection.
          </Typography>
        ) : (
          topPages.map((page, idx) => {
            const improved = page.change > 0;
            // Similar URL cleaning logic
            let cleanUrl = page.url.replace(/\/[a-z0-9-]+\.myshopify\.com(\/|$)/i, "/");
            cleanUrl = cleanUrl.replace(/([^:]\/)\/+/g, "$1");
            let displayUrl = cleanUrl;
            try {
              displayUrl = new URL(cleanUrl).pathname;
            } catch { }

            return (
              <Box key={idx} sx={{ mb: 1.5 }}>
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
                    sx={{ fontWeight: 600, wordBreak: "break-all", lineHeight: 1.2 }}
                  >
                    {displayUrl}
                  </Link>
                </Box>

                <Typography variant="caption" color="text.secondary" component="div">
                  {metric === "SESSIONS" ? "Sessions" : metric}: {Math.round(page.avg * 100) / 100}
                  {metric !== "TTFB" && metric !== "SESSIONS" && metric !== "PERFORMANCE" ? "s" : ""}

                  {page.change !== null && (
                    <Box component="span" sx={{ ml: 1.5, color: improved ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                      {(metric === "SESSIONS" || metric === "PERFORMANCE")
                        ? (improved ? "▲" : "▼")
                        : (improved ? "▼" : "▲")
                      } {Math.abs(page.change).toFixed(2)}%
                    </Box>
                  )}
                </Typography>

                {idx !== topPages.length - 1 && <Divider sx={{ mt: 1.5 }} />}
              </Box>
            );
          })
        )}
      </Box>
    </StatBox>
  );
};

export default WebVitals;
