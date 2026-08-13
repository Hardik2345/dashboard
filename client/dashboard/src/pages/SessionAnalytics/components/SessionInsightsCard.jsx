import { Box, Card, CardContent, Divider, Skeleton, Stack, Typography } from "@mui/material";

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
  const items = [
    {
      title: "Most Active User",
      primary: insights?.mostActiveUser?.email,
      secondary:
        insights?.mostActiveUser?.sessionCount != null
          ? `${Number(insights.mostActiveUser.sessionCount).toLocaleString()} sessions`
          : "-",
    },
    {
      title: "Most Active Brand",
      primary: insights?.mostActiveBrand?.brand,
      secondary:
        insights?.mostActiveBrand?.sessionCount != null
          ? `${Number(insights.mostActiveBrand.sessionCount).toLocaleString()} sessions`
          : "-",
    },
    {
      title: "Latest Session",
      primary: insights?.latestSession?.email,
      secondary: insights?.latestSession?.brand
        ? `${insights.latestSession.brand} • ${insights.latestSession.timeAgo || "-"}`
        : insights?.latestSession?.timeAgo || "-",
    },
  ];

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", height: "100%" }}>
      <CardContent
        sx={{
          p: { xs: 1.5, md: 2 },
          "&:last-child": { pb: { xs: 1.5, md: 2 } },
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
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
              gap: { xs: 2, md: 0 },
            }}
          >
            {items.map((item, index) => (
              <Box
                key={item.title}
                sx={{
                  minWidth: 0,
                  pr: { md: index < items.length - 1 ? 3 : 0 },
                  pl: { md: index > 0 ? 3 : 0 },
                  pt: { xs: index > 0 ? 2 : 0, md: 0 },
                  borderLeft: {
                    xs: "none",
                    md: index > 0 ? "1px solid" : "none",
                  },
                  borderTop: {
                    xs: index > 0 ? "1px solid" : "none",
                    md: "none",
                  },
                  borderColor: "divider",
                }}
              >
                <InsightBlock
                  title={item.title}
                  primary={item.primary}
                  secondary={item.secondary}
                />
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
