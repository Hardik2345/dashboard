import { useMemo, useState, useEffect } from "react";
import { getQrScans, getLandingPageSessions, getMongoEventCount, getMongoCollectionCount } from "../lib/api.js";




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




const tooltipFormatter = (value, _name, payload) => {
  const pct = payload?.payload?.percent;
  return [`${value}`, pct != null ? `${pct}% of QR scans` : "Count"];
};

const IST_OFFSET_MINUTES = 330;

// Helper: Convert dateStr or dayjs to Unix Timestamp (Seconds) using IST day boundaries.
const toUnixTimestampInIst = (dateValue, isEnd = false) => {
  if (!dateValue) return null;
  let str = dateValue;
  if (dateValue.format) {
    str = dateValue.format("YYYY-MM-DD");
  }

  const [year, month, day] = String(str)
    .split("-")
    .map((value) => Number(value));

  if (!year || !month || !day) {
    return null;
  }

  // Convert local IST day boundaries into the correct UTC instant.
  const utcMillis =
    Date.UTC(year, month - 1, day, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0) -
    IST_OFFSET_MINUTES * 60 * 1000;

  return Math.floor(utcMillis / 1000);
};


export default function RanveerRSDashboard({ dateRange }) {
  const [loading, setLoading] = useState(false);
  const [qrScansCount, setQrScansCount] = useState(null);
  const [landingPageSessions, setLandingPageSessions] = useState(null);
  const [addToCartCount, setAddToCartCount] = useState(null);
  const [otpVerifiedCount, setOtpVerifiedCount] = useState(null);
  const [purchaseCount, setPurchaseCount] = useState(null);

  const theme = useTheme();

  const FUNNEL_DATA = useMemo(() => [
    {
      id: "qr-scans",
      label: "Scans",
      shortLabel: "Scans",
      value: 0,
      percent: 100,
      color: theme.palette.primary.main,
    },
    {
      id: "otp-landing-page",
      label: "OTP Landing Page",
      shortLabel: "LP",
      value: 0,
      percent: 0,
      color: theme.palette.info.main,
    },
    {
      id: "otp-verified",
      label: "OTP Verified",
      shortLabel: "OTP Verified",
      value: 0,
      percent: 0,
      color: theme.palette.warning.main,
    },
    {
      id: "add-to-cart",
      label: "Add to Cart",
      shortLabel: "ATC",
      value: 0,
      percent: 0,
      color: theme.palette.success.main,
    },
    {
      id: "purchase",
      label: "Purchase",
      shortLabel: "Purchase",
      value: 0,
      percent: 0,
      color: theme.palette.secondary.main,
    },
  ], [theme]);


  const startStr = dateRange?.[0] || dateRange?.start;
  const endStr = dateRange?.[1] || dateRange?.end;

  useEffect(() => {
    let cancelled = false;
    if (!startStr || !endStr) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const fromUnix = toUnixTimestampInIst(startStr);
        const toUnix = toUnixTimestampInIst(endStr, true);
        const fromStr = startStr.format ? startStr.format("YYYY-MM-DD") : startStr;
        const toStr = endStr.format ? endStr.format("YYYY-MM-DD") : endStr;
        
        const [qrRes, lpRes, otpVerifyRes, purchaseRes] = await Promise.all([
          getQrScans(fromUnix, toUnix),
          getLandingPageSessions(fromStr, toStr),
          getMongoCollectionCount(fromStr, toStr, 'ajrs_otpverified'),
          getMongoCollectionCount(fromStr, toStr, 'ajrsPurchase')
        ]);



        if (cancelled) return;

        let hasError = false;
        if (!qrRes.error && qrRes.data?.success) {
          setQrScansCount(qrRes.data.count);
        } else {
          hasError = true;
        }

        if (!lpRes.error && lpRes.data?.success) {
          setLandingPageSessions(lpRes.data.count);
          setAddToCartCount(lpRes.data.atcCount);
        } else {
          hasError = true;
        }

        if (!otpVerifyRes.error && otpVerifyRes.data?.success) {
          setOtpVerifiedCount(otpVerifyRes.data.count);
        } else {
          hasError = true;
        }

        if (!purchaseRes.error && purchaseRes.data?.success) {
          setPurchaseCount(purchaseRes.data.count);
        } else {
          hasError = true;
        }



        if (hasError) {
          // Optional: handle partial error or show message
        }
      } catch {
        // Keep the page usable even if one or more demo endpoints fail.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [startStr, endStr]);

  const liveFunnelData = useMemo(() => {
    const qrVal = qrScansCount !== null ? qrScansCount : FUNNEL_DATA[0].value;
    
    return FUNNEL_DATA.map((item) => {
      let val = item.value;
      if (item.id === "qr-scans" && qrScansCount !== null) val = qrScansCount;
      if (item.id === "otp-landing-page" && landingPageSessions !== null) val = landingPageSessions;
      if (item.id === "otp-verified" && otpVerifiedCount !== null) val = otpVerifiedCount;
      if (item.id === "add-to-cart" && addToCartCount !== null) val = addToCartCount;
      if (item.id === "purchase" && purchaseCount !== null) val = purchaseCount;

      const percent = qrVal > 0 ? (val / qrVal) * 100 : 0;
      return {
        ...item,
        value: val,
        percent: Math.round(percent)
      };
    });
  }, [qrScansCount, landingPageSessions, addToCartCount, otpVerifiedCount, purchaseCount, FUNNEL_DATA]);






  const chartData = useMemo(
    () =>
      liveFunnelData.map((item) => ({
        ...item,
        percentLabel: `${item.percent}%`,
      })),
    [liveFunnelData],
  );


  return (
    <Stack spacing={{ xs: 2, md: 3 }}>


      <Grid container spacing={2}>
        {liveFunnelData.map((item) => (
          <Grid key={item.id} size={{ xs: 12, sm: 6, lg: 12 / 5 }}>

            <KPIStat
              label={item.label}
              value={item.value}
              loading={(item.id === "qr-scans" || item.id === "otp-landing-page" || item.id === "otp-verified" || item.id === "add-to-cart" || item.id === "purchase") && loading}
              formatter={(value) => value.toLocaleString("en-IN")}
              hint={`${item.percent}% of QR scans`}
              centerOnMobile
              activeColor={theme.palette.primary.main}
              sx={{
                "& .MuiCardContent-root": {
                  p: { xs: 1, md: 1.5 },
                  "&:last-child": { pb: { xs: 0.75, md: 1.5 } },
                  minHeight: { xs: "auto", md: 110 },
                },
                "& .MuiTypography-h5": {
                  fontSize: { xs: "1.25rem", md: "1.5rem" },
                },
                "& .MuiCardContent-root > .MuiBox-root:last-of-type": {
                  display: { xs: "none", md: "flex" },
                },
              }}

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
                  angle={0}
                  height={30}

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
                <Bar dataKey="value" fill="#10b981" radius={[10, 10, 0, 0]} maxBarSize={90}>

                  <LabelList
                    dataKey="percentLabel"
                    position="top"
                    style={{
                      fill: theme.palette.text.primary,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                </Bar>

              </BarChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
