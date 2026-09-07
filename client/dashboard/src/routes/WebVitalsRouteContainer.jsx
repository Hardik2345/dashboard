import { Suspense, lazy } from "react";
import { EmptyStateCard, SectionFallback } from "./shared/RouteUi.jsx";

const WebVitalsPage = lazy(() => import("../pages/WebVitals/WebVitalsPage.jsx"));

export default function WebVitalsRouteContainer({
  hasBrand,
  activeBrandKey,
  canViewAllBrandsSnapshot = false,
}) {
  if (!hasBrand) {
    return <EmptyStateCard message="Select a brand to view web vitals." />;
  }

  return (
    <Suspense fallback={<SectionFallback count={3} height={220} />}>
      <WebVitalsPage
        brandKey={activeBrandKey}
        canViewAllBrandsSnapshot={canViewAllBrandsSnapshot}
      />
    </Suspense>
  );
}
