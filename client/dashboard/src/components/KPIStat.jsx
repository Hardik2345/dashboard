import { Card, CardContent, Typography, Skeleton, Box } from '@mui/material';

export default function KPIStat({ label, value, hint, loading, formatter }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width={120} height={36} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatter ? formatter(value) : value}
            </Typography>
            {hint && (
              <Typography variant="caption" color="text.secondary">
                {hint}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
