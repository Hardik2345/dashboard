import { Suspense, lazy } from "react";
import { EmptyStateCard, SectionFallback } from "./shared/RouteUi.jsx";

const DailyFunnelPanel = lazy(() => import("../components/DailyFunnelPanel.jsx"));

export default function DailyFunnelRouteContainer({
  hasBrand,
  activeBrandKey,
  canAccessUtmFunnelTable,
  canAccessUtmCampaignGrain,
  canAccessPercentBasisToggle,
}) {
  if (!hasBrand) {
    return (
      <EmptyStateCard message="Select a brand to view daily funnel metrics." />
    );
  }

  return (
    <Suspense fallback={<SectionFallback count={2} height={240} />}>
      <DailyFunnelPanel
        brandKey={activeBrandKey}
        canAccessUtmFunnelTable={canAccessUtmFunnelTable}
        canAccessUtmCampaignGrain={canAccessUtmCampaignGrain}
        canAccessPercentBasisToggle={canAccessPercentBasisToggle}
      />
    </Suspense>
  );
}
