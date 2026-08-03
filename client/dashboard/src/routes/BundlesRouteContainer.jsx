import { Suspense, lazy } from "react";
import { EmptyStateCard, SectionFallback } from "./shared/RouteUi.jsx";

const BundlesPanel = lazy(() => import("../components/BundlesPanel.jsx"));

export default function BundlesRouteContainer({
  hasBrand,
  activeBrandKey,
  start,
  end,
}) {
  if (!hasBrand) {
    return <EmptyStateCard message="Select a brand to view bundle metrics." />;
  }

  return (
    <Suspense fallback={<SectionFallback count={2} height={280} />}>
      <BundlesPanel
        brandKey={activeBrandKey}
        initialStartDate={start}
        initialEndDate={end}
      />
    </Suspense>
  );
}
