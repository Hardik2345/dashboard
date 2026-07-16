import { Box, Card, CardContent, Typography } from "@mui/material";

export default function DashboardUnavailableCard({
  title,
  description = "Unavailable",
  minHeight = 220,
  sx = {},
  contentSx = {},
}) {
  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        minHeight,
        border: "1px solid",
        borderColor: "divider",
        ...sx,
      }}
    >
      <CardContent
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          p: 2.5,
          ...contentSx,
        }}
      >
        <Box>
          {title ? (
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
              {title}
            </Typography>
          ) : null}
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1, mb: 1 }}>
            NA
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
