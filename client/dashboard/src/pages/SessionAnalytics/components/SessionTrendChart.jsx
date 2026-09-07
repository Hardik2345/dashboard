import {
  Card,
  CardContent,
  FormControl,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function SessionTrendChart({
  rows = [],
  loading = false,
  granularity = "daily",
  onGranularityChange,
}) {
  const shouldTiltDateLabels = rows.length > 30;

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", height: "100%" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 }, "&:last-child": { pb: { xs: 1.5, md: 2 } } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, color: "text.secondary" }}>
            Session Trend
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={granularity}
              onChange={(event) => onGranularityChange(event.target.value)}
            >
              <MenuItem value="hourly">Hourly</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {loading ? (
          <Skeleton variant="rounded" height={320} />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: shouldTiltDateLabels ? 28 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis
                dataKey="label"
                tick={
                  shouldTiltDateLabels
                    ? { fontSize: 12, angle: -24, textAnchor: "end", dy: 8 }
                    : { fontSize: 12 }
                }
                minTickGap={24}
                height={shouldTiltDateLabels ? 42 : undefined}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#111827"
                strokeWidth={2.5}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
