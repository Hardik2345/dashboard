import { useCallback, useState } from "react";
import { Alert, Stack } from "@mui/material";
import StatusBanner from "./components/StatusBanner.jsx";
import KpiRow from "./components/KpiRow.jsx";
import ServiceGrid from "./components/ServiceGrid.jsx";
import ServiceDetailDrawer from "./components/ServiceDetailDrawer.jsx";
import IncidentsTable from "./components/IncidentsTable.jsx";
import { useHealthMonitorPolling } from "./hooks/useHealthMonitorPolling.js";
import { getHealthMonitorSummary, getHealthMonitorServices } from "../../lib/api.js";

export default function HealthMonitorPage() {
  const [summary, setSummary] = useState(null);
  const [services, setServices] = useState([]);
  const [panelUnavailable, setPanelUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    const [summaryRes, servicesRes] = await Promise.all([
      getHealthMonitorSummary(),
      getHealthMonitorServices(),
    ]);

    // The fetch to health-monitor-service itself failing (network error,
    // gateway down, timeout) is distinct from a successful response that
    // legitimately reports Degraded/Unhealthy — only the former means the
    // panel itself is unavailable.
    if (summaryRes.error || servicesRes.error) {
      setPanelUnavailable(true);
    } else {
      setPanelUnavailable(false);
      setSummary(summaryRes.data);
      setServices(servicesRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const { lastUpdatedAt, refresh } = useHealthMonitorPolling(fetchAll);

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2 } }}>
      {panelUnavailable && (
        <Alert severity="warning">
          Health Monitor data is temporarily unavailable. This does not necessarily mean any
          monitored service is down — only that the Health Monitor panel itself could not be
          reached.
        </Alert>
      )}

      <StatusBanner
        systemStatus={summary?.systemStatus}
        lastUpdatedAt={lastUpdatedAt}
        loading={loading}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      <KpiRow summary={summary} loading={loading} />

      <ServiceGrid services={services} loading={loading} onSelectService={setSelectedService} />

      <IncidentsTable />

      <ServiceDetailDrawer
        serviceName={selectedService}
        open={Boolean(selectedService)}
        onClose={() => setSelectedService(null)}
      />
    </Stack>
  );
}
