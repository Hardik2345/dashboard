import { useMemo, useState, useEffect } from "react";
import { Box, Card, CardContent, IconButton, Typography, Tooltip, CircularProgress } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import dayjs from "dayjs";
import StatusBadge from "../../../components/ui/StatusBadge.jsx";

function formatUpdatedAgo(timestamp, nowValue) {
  if (!timestamp) return null;
  const parsed = dayjs(timestamp);
  if (!parsed.isValid()) return null;
  const now = dayjs(nowValue);
  const seconds = Math.max(0, now.diff(parsed, "second"));
  if (seconds < 5) return "updated just now";
  if (seconds < 60) return `updated ${seconds}s ago`;
  const minutes = now.diff(parsed, "minute");
  if (minutes < 60) return `updated ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = now.diff(parsed, "hour");
  return `updated ${hours} hr${hours === 1 ? "" : "s"} ago`;
}

export default function StatusBanner({ systemStatus, lastUpdatedAt, loading, refreshing, onRefresh }) {
  const [nowValue, setNowValue] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowValue(Date.now()), 15 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const updatedText = useMemo(() => formatUpdatedAgo(lastUpdatedAt, nowValue), [lastUpdatedAt, nowValue]);

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            System Status
          </Typography>
          {loading && !systemStatus ? (
            <CircularProgress size={18} />
          ) : (
            <StatusBadge status={systemStatus} />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {updatedText && (
            <Typography variant="caption" color="text.secondary">
              {updatedText}
            </Typography>
          )}
          <Tooltip title="Refresh now" arrow>
            <span>
              <IconButton size="small" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
}
