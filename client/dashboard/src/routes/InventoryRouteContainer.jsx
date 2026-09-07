import { Suspense, lazy } from "react";
import { EmptyStateCard, SectionFallback } from "./shared/RouteUi.jsx";

const InventoryTable = lazy(() => import("../components/InventoryTable.jsx"));

export default function InventoryRouteContainer({
  hasBrand,
  activeBrandKey,
  productTableStart,
  productTableEnd,
}) {
  if (!hasBrand) {
    return (
      <EmptyStateCard message="Select a brand to view inventory metrics." />
    );
  }

  return (
    <Suspense fallback={<SectionFallback count={1} height={280} />}>
      <InventoryTable
        brandKey={activeBrandKey}
        startDate={productTableStart}
        endDate={productTableEnd}
      />
    </Suspense>
  );
}
