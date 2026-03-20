import { useMemo } from "react";
import Grid from "@mui/material/Grid2";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KPIStat from "./KPIStat.jsx";

const DEMO_FUNNEL_DATA = [
  {
    id: "qr-scans",
    label: "QR Scans",
    shortLabel: "QR Scans",
    value: 10,
    percent: 100,
    color: "#4FB6D3",
  },
  {
    id: "otp-landing-page",
    label: "OTP Landing Page",
    shortLabel: "OTP Landing",
    value: 8,
    percent: 80,
    color: "#69D6DA",
  },
  {
    id: "otp-verified",
    label: "OTP Verified",
    shortLabel: "OTP Verified",
    value: 6,
    percent: 60,
    color: "#3E8FBE",
  },
  {
    id: "add-to-cart",
    label: "Add to Cart",
    shortLabel: "ATC",
    value: 4,
    percent: 40,
    color: "#3B6AA4",
  },
  {
    id: "purchase",
    label: "Purchase",
    shortLabel: "Purchase",
    value: 2,
    percent: 20,
    color: "#854AA1",
  },
];

const tooltipFormatter = (value, _name, payload) => {
  const pct = payload?.payload?.percent;
  return [`${value}`, pct != null ? `${pct}% of QR scans` : "Count"];
};

export default function RanveerRSDashboard() {
  const theme = useTheme();

  const chartData = useMemo(
    () =>
      DEMO_FUNNEL_DATA.map((item) => ({
        ...item,
        percentLabel: `${item.percent}%`,
      })),
    [],
  );

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Ranveer RS
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Demo KPI funnel for QR to purchase conversion.
          </Typography>
        </Box>
        <Chip
          label="Demo Data"
          size="small"
          sx={{
            height: 26,
            fontWeight: 600,
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            color: "text.primary",
            border: "1px solid",
            borderColor: alpha(theme.palette.primary.main, 0.18),
          }}
        />
      </Stack>

      <Grid container spacing={2}>
        {DEMO_FUNNEL_DATA.map((item) => (
          <Grid key={item.id} size={{ xs: 12, sm: 6, lg: 12 / 5 }}>
            <KPIStat
              label={item.label}
              value={item.value}
              formatter={(value) => value.toLocaleString("en-IN")}
              hint={`${item.percent}% of QR scans`}
              centerOnMobile
              sx={{
                borderRadius: { xs: 2, md: 3 },
                background: `linear-gradient(180deg, ${alpha(item.color, 0.16)} 0%, ${alpha(theme.palette.background.paper, 0.96)} 72%)`,
              }}
              activeColor={item.color}
            />
          </Grid>
        ))}
      </Grid>

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: { xs: 2, md: 3 },
          overflow: "hidden",
        }}
      >
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={0.5} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Funnel Overview
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Hardcoded conversion view for the demo flow.
            </Typography>
          </Stack>

          <Box sx={{ width: "100%", height: { xs: 300, md: 380 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 18, right: 8, left: -12, bottom: 24 }}
                barGap={10}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={alpha(theme.palette.text.primary, 0.12)}
                />
                <XAxis
                  dataKey="shortLabel"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-42}
                  textAnchor="end"
                  height={72}
                  tick={{ fill: theme.palette.text.primary, fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: alpha(theme.palette.primary.main, 0.08) }}
                  formatter={tooltipFormatter}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                    backgroundColor: alpha(theme.palette.background.paper, 0.96),
                  }}
                />
                <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={90}>
                  <LabelList
                    dataKey="percentLabel"
                    position="top"
                    style={{
                      fill: theme.palette.text.primary,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                  {chartData.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
