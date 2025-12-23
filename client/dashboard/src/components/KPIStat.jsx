import { Card, CardContent, Typography, Skeleton, Box } from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

export default function KPIStat({ label, value, hint, loading, deltaLoading, formatter, delta, onSelect, selected }) {
  const clickable = typeof onSelect === 'function';

  const handleKeyDown = (event) => {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <Card
      elevation={0}
      onClick={clickable ? onSelect : undefined}
      onKeyDown={handleKeyDown}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? Boolean(selected) : undefined}
      sx={{
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        height: '100%',
        cursor: clickable ? 'pointer' : 'default',
        backgroundColor: selected ? 'action.hover' : 'background.paper',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: selected ? '0 0 0 1px rgba(11,107,203,0.25)' : 'none',
        outline: 'none',
        '&:hover': clickable ? { borderColor: 'primary.main', boxShadow: '0 0 0 1px rgba(11,107,203,0.2)' } : undefined,
        '&:focus-visible': clickable ? { borderColor: 'primary.main', boxShadow: '0 0 0 2px rgba(11,107,203,0.35)' } : undefined,
      }}
    >
      <CardContent sx={{ py: 1.25, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 110 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25, whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width={120} height={32} />
        ) : (
          <>
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
            <Box sx={{ mt: 0.5, height: 20, display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {deltaLoading ? (
                <Skeleton variant="text" width={60} height={20} />
              ) : delta && typeof delta.value === 'number' ? (
                <>
                  {delta.direction === 'up' ? (
                    <ArrowDropUpIcon fontSize="small" sx={{ color: 'success.main' }} />
                  ) : delta.direction === 'down' ? (
                    <ArrowDropDownIcon fontSize="small" sx={{ color: 'error.main' }} />
                  ) : (
                    <Box sx={{ width: 0, height: 0 }} />
                  )}
                  <Typography
                    variant="body2"
                    sx={{
                      color: delta.direction === 'up' ? 'success.main' : delta.direction === 'down' ? 'error.main' : 'text.secondary',
                      fontWeight: 700,
                    }}
                  >
                    {Math.abs(delta.value).toFixed(1)}%
                  </Typography>
                </>
              ) : (
                // Reserve space to keep all cards equal height
                <Box sx={{ visibility: 'hidden' }}>
                  <ArrowDropUpIcon fontSize="small" />
                  <Typography variant="body2">0.0%</Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
