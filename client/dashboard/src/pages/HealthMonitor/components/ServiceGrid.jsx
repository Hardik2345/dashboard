import { Card, CardContent, CardHeader, Grid, Typography, Box, Skeleton } from "@mui/material";
import StatusBadge from "../../../components/ui/StatusBadge.jsx";

function ServiceCardSkeleton() {
  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", height: "100%" }}>
      <CardContent>
        <Skeleton variant="text" width="60%" height={28} />
        <Skeleton variant="text" width="40%" height={20} />
        <Skeleton variant="text" width="50%" height={20} />
      </CardContent>
    </Card>
  );
}

export default function ServiceGrid({ services, loading, onSelectService }) {
  if (loading && !services.length) {
    return (
      <Grid container spacing={2}>
        {[0, 1, 2].map((key) => (
          <Grid item xs={12} md={6} lg={4} key={key}>
            <ServiceCardSkeleton />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!services.length) {
    return (
      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <CardContent>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            No services registered
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Services appear here automatically once they register with the health monitor.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Grid container spacing={2}>
      {services.map((service) => (
        <Grid item xs={12} md={6} lg={4} key={service.serviceName}>
          <Card
            elevation={0}
            onClick={() => onSelectService(service.serviceName)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectService(service.serviceName);
              }
            }}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              height: "100%",
              cursor: "pointer",
              transition: "box-shadow 0.2s ease, transform 0.2s ease",
              "&:hover": { boxShadow: 3, transform: "translateY(-2px)" },
            }}
          >
            <CardHeader
              title={service.serviceName}
              titleTypographyProps={{ variant: "subtitle1", sx: { fontWeight: 600 } }}
              action={<StatusBadge status={service.status} size="small" />}
              sx={{ pb: 0.5 }}
            />
            <CardContent sx={{ pt: 0.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Endpoints healthy
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {service.endpointsHealthy}/{service.endpointsTotal}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body2" color="text.secondary">
                  Open incidents
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, color: service.openIncidents > 0 ? "#ef4444" : "text.primary" }}
                >
                  {service.openIncidents}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
