import { useMemo } from "react";
import { Box, Card, Skeleton, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";

const RANGE_OPTIONS = [
  { value: "1h", label: "1H" },
  { value: "6h", label: "6H" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

function formatBucketLabel(timestamp, range) {
  const parsed = dayjs(timestamp);
  if (!parsed.isValid()) return "";
  if (range === "7d" || range === "30d") return parsed.format("MMM D");
  return parsed.format("HH:mm");
}

function CustomTooltip({ active, payload, label }) {
  const theme = useTheme();
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  return (
    <Card
      elevation={4}
      sx={{
        px: 1.5,
        py: 1,
        bgcolor: theme.palette.mode === "dark" ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.97)",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {point.avgLatency == null ? "No data" : `${point.avgLatency} ms avg latency`}
      </Typography>
      {point.uptimePct != null && (
        <Typography variant="caption" color="text.secondary">
          {point.uptimePct}% uptime in bucket
        </Typography>
      )}
    </Card>
  );
}

export default function LatencyChart({ history, loading, range, onRangeChange }) {
  const theme = useTheme();

  const chartData = useMemo(() => {
    const buckets = history?.buckets || [];
    return buckets.map((bucket) => ({
      label: formatBucketLabel(bucket.timestamp, range),
      avgLatency: bucket.avgLatency,
      uptimePct: bucket.uptimePct,
    }));
  }, [history, range]);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Latency
          {history?.availabilityPct != null && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {history.availabilityPct}% availability
            </Typography>
          )}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={range}
          onChange={(_event, next) => next && onRangeChange(next)}
        >
          {RANGE_OPTIONS.map((option) => (
            <ToggleButton key={option.value} value={option.value} sx={{ px: 1.25, py: 0.25, fontSize: 12 }}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {loading ? (
        <Skeleton variant="rounded" width="100%" height={220} />
      ) : chartData.length === 0 ? (
        <Box
          sx={{
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No data for the selected range.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={alpha(theme.palette.divider, 0.5)} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={20} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="avgLatency"
                stroke={theme.palette.primary.main}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
}
