import { Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import useWebVitals from "../hooks/useWebVitals.js";

const nfFloat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export default function WebPerformancePanel({ query }) {
  const { performanceAvg, loading } = useWebVitals(query, "PERFORMANCE", {
    usePerformanceSummary: true,
  });

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        minHeight: { xs: 150, md: 310 },
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <CardContent
        sx={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          p: { xs: 1.5, md: 2 },
          "&:last-child": { pb: { xs: 1.5, md: 2 } },
        }}
      >
        {loading ? (
          <Box sx={{ textAlign: "center" }}>
            <Skeleton variant="text" width={160} sx={{ mx: "auto" }} />
            <Skeleton variant="text" width={120} height={42} />
          </Box>
        ) : (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Web Performance(Avg)
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1 }}>
              {nfFloat.format(performanceAvg ?? 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Performance score for selected period
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
