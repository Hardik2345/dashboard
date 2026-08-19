import { Grid } from "@mui/material";
import KPIStat from "../../../components/KPIStat.jsx";

export default function KpiRow({ summary, loading }) {
  const servicesValue = summary ? `${summary.servicesHealthy}/${summary.servicesTotal}` : "-";
  const endpointsValue = summary ? `${summary.endpointsHealthy}/${summary.endpointsTotal}` : "-";

  return (
    <Grid container spacing={2}>
      <Grid item xs={6} md={3}>
        <KPIStat label="Services" value={servicesValue} loading={loading} />
      </Grid>
      <Grid item xs={6} md={3}>
        <KPIStat label="Endpoints" value={endpointsValue} loading={loading} />
      </Grid>
      <Grid item xs={6} md={3}>
        <KPIStat
          label="Open Incidents"
          value={summary ? summary.openIncidents : "-"}
          loading={loading}
        />
      </Grid>
      <Grid item xs={6} md={3}>
        <KPIStat
          label="Critical Incidents"
          value={summary ? summary.criticalIncidents : "-"}
          loading={loading}
        />
      </Grid>
    </Grid>
  );
}
