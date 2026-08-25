import { useState } from "react";
import {
  Box,
  Card,
  FormControl,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { METRIC_DEFS } from "../webVitalsFormat.js";
import { FunnelRangeOrDatePicker } from "../../../components/DailyFunnelPanel.jsx";

const PERFORMANCE_DEF = METRIC_DEFS.performance;

function ChartTooltip({ active, label, payload }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const value = payload[0]?.value;
  if (value === null || value === undefined) return null;
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        p: 1.25,
        minWidth: 140,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: PERFORMANCE_DEF.color }} />
        <Typography variant="caption" sx={{ flex: 1 }}>
          {PERFORMANCE_DEF.shortLabel}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {PERFORMANCE_DEF.format(value)}
        </Typography>
      </Box>
    </Box>
  );
}

export default function WebVitalsTrendChart({
  points,
  loading,
  granularity,
  onGranularityChange,
  rangeStart,
  rangeEnd,
  onRangeChange,
}) {
  const theme = useTheme();
  const [chartMode, setChartMode] = useState("bar");

  const isSingleDay = rangeStart === rangeEnd;
  const gridStroke = alpha(theme.palette.divider, 0.5);
  const tickStyle = { fontSize: 10, fill: theme.palette.text.secondary };

  return (
    <Card variant="outlined" sx={{ p: 2.5 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Daily Trend (Performance)
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select
              value={granularity}
              onChange={(event) => onGranularityChange(event.target.value)}
            >
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="hourly" disabled={!isSingleDay}>
                Hourly
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 90 }}>
            <Select
              value={chartMode}
              onChange={(event) => setChartMode(event.target.value)}
            >
              <MenuItem value="line">Line</MenuItem>
              <MenuItem value="bar">Bar</MenuItem>
            </Select>
          </FormControl>
          <FunnelRangeOrDatePicker
            compact
            startDate={rangeStart}
            endDate={rangeEnd}
            onApply={onRangeChange}
          />
        </Stack>
      </Stack>

      <Box sx={{ height: 300 }}>
        {loading ? (
          <Skeleton variant="rounded" width="100%" height="100%" />
        ) : !points.length ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No web vitals data for this range.
            </Typography>
          </Box>
        ) : chartMode === "bar" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 18, right: 12, left: 0, bottom: 5 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                tick={tickStyle}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                width={32}
              />
              <Tooltip
                cursor={{ fill: alpha(theme.palette.divider, 0.2) }}
                content={(props) => <ChartTooltip {...props} theme={theme} />}
              />
              <Bar
                dataKey="performance"
                name={PERFORMANCE_DEF.label}
                fill={PERFORMANCE_DEF.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
                animationDuration={180}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 18, right: 12, left: 0, bottom: 5 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                tick={tickStyle}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                width={32}
              />
              <Tooltip
                cursor={{ stroke: theme.palette.divider, strokeWidth: 1, strokeDasharray: "4 4" }}
                content={(props) => <ChartTooltip {...props} theme={theme} />}
              />
              <Line
                type="monotone"
                dataKey="performance"
                name={PERFORMANCE_DEF.label}
                stroke={PERFORMANCE_DEF.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls
                animationDuration={180}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Card>
  );
}
