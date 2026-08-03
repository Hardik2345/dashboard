import { Suspense, lazy } from "react";
import { SectionFallback } from "./shared/RouteUi.jsx";

const SessionAnalyticsPage = lazy(
  () => import("../pages/SessionAnalytics/SessionAnalyticsPage.jsx"),
);

export default function SessionAnalyticsRouteContainer({
  activeBrandKey,
  isAuthor,
  authorBrands,
  viewerBrands,
}) {
  return (
    <Suspense fallback={<SectionFallback count={4} height={240} />}>
      <SessionAnalyticsPage
        brandKey={activeBrandKey}
        availableBrands={
          isAuthor
            ? authorBrands
            : viewerBrands.map((brand) => ({ key: brand }))
        }
      />
    </Suspense>
  );
}
