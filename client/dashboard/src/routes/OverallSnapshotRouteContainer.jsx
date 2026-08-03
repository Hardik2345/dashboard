import { Suspense, lazy } from "react";
import { Box, Stack } from "@mui/material";
import { motion } from "framer-motion";
import { SectionFallback } from "./shared/RouteUi.jsx";

const MotionDiv = motion.div;

const OverallSnapshotWidget = lazy(
  () => import("../components/OverallSnapshotWidget.jsx"),
);
const UnifiedFilterBar = lazy(() => import("../components/UnifiedFilterBar.jsx"));

export default function OverallSnapshotRouteContainer({
  direction,
  pageVariants,
  isMobile,
  normalizedRange,
  handleRangeChange,
  compareMode,
  handleCompareModeChange,
  compareDateRange,
  handleCompareDateRangeChange,
  dataRestrictionConfig,
  overallSnapshotQuery,
  snapshotBrands,
  isAuthor,
  authorBrandsLoading,
  handleOverallSnapshotBrandSelect,
}) {
  return (
    <MotionDiv
      key="overall-snapshot"
      custom={direction}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ width: "100%" }}
    >
      <Suspense fallback={<SectionFallback count={2} />}>
        <Stack spacing={{ xs: 1.25, md: 0 }}>
          {isMobile && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                overflowX: "auto",
                pb: 0.25,
                "&::-webkit-scrollbar": { display: "none" },
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
            >
              <UnifiedFilterBar
                range={normalizedRange}
                onRangeChange={handleRangeChange}
                brandKey=""
                brands={[]}
                onBrandChange={() => {}}
                isAuthor={false}
                compareMode={compareMode}
                onCompareModeChange={handleCompareModeChange}
                compareDateRange={compareDateRange}
                onCompareDateRangeChange={handleCompareDateRangeChange}
                dataRestrictionConfig={dataRestrictionConfig}
                hideAllExceptDate
              />
            </Box>
          )}
          <OverallSnapshotWidget
            query={overallSnapshotQuery}
            brands={snapshotBrands}
            brandsLoading={isAuthor && authorBrandsLoading}
            onBrandSelect={handleOverallSnapshotBrandSelect}
          />
        </Stack>
      </Suspense>
    </MotionDiv>
  );
}
