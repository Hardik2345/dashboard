import { Card, CardContent, Divider, Skeleton, Stack, Typography } from "@mui/material";

function InsightBlock({ title, primary, secondary }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
        {primary || "-"}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {secondary || "-"}
      </Typography>
    </Stack>
  );
}

export default function SessionInsightsCard({ insights = {}, loading = false }) {
  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", height: "100%" }}>
      <CardContent
        sx={{
          p: { xs: 1.5, md: 2 },
          "&:last-child": { pb: { xs: 1.5, md: 2 } },
          minHeight: { xs: 220, md: 320 },
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: "text.secondary" }}>
          Insights
        </Typography>
        {loading ? (
          <Stack spacing={2}>
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="90%" />
            <Divider />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="90%" />
            <Divider />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="90%" />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <InsightBlock
              title="Most Active User"
              primary={insights?.mostActiveUser?.email}
              secondary={
                insights?.mostActiveUser?.sessionCount != null
                  ? `${Number(insights.mostActiveUser.sessionCount).toLocaleString()} sessions`
                  : "-"
              }
            />
            <Divider />
            <InsightBlock
              title="Most Active Brand"
              primary={insights?.mostActiveBrand?.brand}
              secondary={
                insights?.mostActiveBrand?.sessionCount != null
                  ? `${Number(insights.mostActiveBrand.sessionCount).toLocaleString()} sessions`
                  : "-"
              }
            />
            <Divider />
            <InsightBlock
              title="Latest Session"
              primary={insights?.latestSession?.email}
              secondary={
                insights?.latestSession?.brand
                  ? `${insights.latestSession.brand} • ${insights.latestSession.timeAgo || "-"}`
                  : insights?.latestSession?.timeAgo || "-"
              }
            />
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
