import { Suspense, lazy, useMemo } from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { EmptyStateCard, SectionFallback } from "./shared/RouteUi.jsx";

const FunnelChart = lazy(() => import("../components/charts/FunnelChart.jsx"));
const ProductConversionTable = lazy(
  () => import("../components/ProductConversionTable.jsx"),
);

export default function ProductConversionRouteContainer({
  hasBrand,
  darkMode,
  funnelData,
  hasPermission,
  activeBrandKey,
  isAuthor,
  viewerPermissions,
}) {
  const funnelChartData = useMemo(
    () => [
      {
        label: "Sessions",
        value: funnelData?.stats?.total_sessions || 0,
        change: funnelData?.deltas?.sessions?.diff_pct
          ? Number(funnelData.deltas.sessions.diff_pct).toFixed(1)
          : undefined,
      },
      {
        label: "Add to Cart",
        value: funnelData?.stats?.total_atc_sessions || 0,
        change: funnelData?.deltas?.atc?.diff_pct
          ? Number(funnelData.deltas.atc.diff_pct).toFixed(1)
          : undefined,
      },
      ...(hasPermission("ci_events")
        ? [
            {
              label: "Checkout Initiated",
              value: funnelData?.stats?.total_ci_events || 0,
              change: funnelData?.deltas?.ci?.diff_pct
                ? Number(funnelData.deltas.ci.diff_pct).toFixed(1)
                : undefined,
            },
          ]
        : []),
      {
        label: "Orders",
        value: funnelData?.stats?.total_orders || 0,
        change:
          funnelData?.deltas?.orders?.diff_pct || funnelData?.deltas?.orders?.diff_pp
            ? Number(
                funnelData?.deltas?.orders?.diff_pct ||
                  funnelData?.deltas?.orders?.diff_pp,
              ).toFixed(1)
            : undefined,
      },
    ],
    [funnelData, hasPermission],
  );

  if (!hasBrand) {
    return (
      <EmptyStateCard message="Select a brand to view conversion metrics." />
    );
  }

  return (
    <Suspense fallback={<SectionFallback />}>
      <Stack spacing={{ xs: 2, md: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            mt: 1,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              color: darkMode === "dark" ? "text.primary" : "text.secondary",
              fontWeight: 600,
            }}
          >
            Product Funnel
          </Typography>
        </Box>
        {funnelData?.stats ? (
          <Suspense
            fallback={<Skeleton variant="rounded" width="100%" height={250} />}
          >
            <FunnelChart data={funnelChartData} height={250} />
          </Suspense>
        ) : (
          <Skeleton variant="rounded" width="100%" height={250} />
        )}

        <ProductConversionTable
          brandKey={activeBrandKey}
          showCompareMode={true}
          isAuthor={isAuthor}
          permissions={viewerPermissions}
        />
      </Stack>
    </Suspense>
  );
}
