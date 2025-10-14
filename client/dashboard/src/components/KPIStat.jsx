import { Card, CardContent, Typography, Skeleton, Box } from '@mui/material';

export default function KPIStat({ label, value, hint, loading, formatter, delta }) {
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
            {delta && typeof delta.value === 'number' && (
              <Typography
                variant="caption"
                sx={{
                  color: delta.direction === 'up' ? 'success.main' : delta.direction === 'down' ? 'error.main' : 'text.secondary',
                  fontWeight: 600,
                }}
              >
                {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '•'} {Math.abs(delta.value).toFixed(1)}%
              </Typography>
            )}
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
