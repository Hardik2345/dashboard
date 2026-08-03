import { Paper, Skeleton, Stack, Typography } from "@mui/material";

export function SectionFallback({ count = 1, height = 180 }) {
  return (
    <Stack spacing={{ xs: 1, md: 1.5 }}>
      {Array.from({ length: count }).map((_, idx) => (
        <Paper
          key={idx}
          variant="outlined"
          sx={{ p: { xs: 1.5, md: 2 }, borderStyle: "dashed" }}
        >
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rectangular" height={height} sx={{ my: 1 }} />
          <Skeleton variant="text" width="60%" />
        </Paper>
      ))}
    </Stack>
  );
}

export function EmptyStateCard({ message }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Paper>
  );
}
