import { Suspense, lazy } from "react";
import { SectionFallback } from "./shared/RouteUi.jsx";

const HealthMonitorPage = lazy(
  () => import("../pages/HealthMonitor/HealthMonitorPage.jsx"),
);

export default function HealthMonitorRouteContainer() {
  return (
    <Suspense fallback={<SectionFallback count={4} height={240} />}>
      <HealthMonitorPage />
    </Suspense>
  );
}
