import { Suspense, lazy } from "react";
import { SectionFallback } from "./shared/RouteUi.jsx";

const MerchantRequestsPanel = lazy(
  () => import("../components/MerchantRequestsPanel.jsx"),
);

export default function MerchantRequestsRouteContainer({
  activeBrandKey,
  isAuthor,
  authorBrands,
}) {
  return (
    <Suspense fallback={<SectionFallback count={2} />}>
      <MerchantRequestsPanel
        brandKey={activeBrandKey}
        isAuthor={isAuthor}
        availableBrands={authorBrands}
      />
    </Suspense>
  );
}
