import { Card, CardContent, Typography, Skeleton, Box } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

export default function KPIStat({ label, value, hint, loading, deltaLoading, formatter, delta, onSelect, selected, centerOnMobile = false, action, sx = {}, activeColor = '#10b981' }) {
  const theme = useTheme();
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
      className="kpi-stat-card"
      elevation={0}
      onClick={clickable ? onSelect : undefined}
      onKeyDown={handleKeyDown}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? Boolean(selected) : undefined}
      sx={{
        height: '100%',
        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        cursor: clickable ? 'pointer' : 'default',
        position: 'relative',
        border: '1px solid',
        borderColor: selected ? activeColor : 'divider',
        bgcolor: 'background.paper',
        boxShadow: selected
          ? `0 0 0 1px ${activeColor}, 0 10px 20px ${alpha(activeColor, 0.2)}, 0 6px 6px ${alpha(activeColor, 0.1)}`
          : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        '&:hover': clickable ? {
          borderColor: selected ? activeColor : 'divider',
          boxShadow: selected
            ? `0 0 0 1.5px ${activeColor}, 0 14px 28px ${alpha(activeColor, 0.25)}, 0 10px 10px ${alpha(activeColor, 0.15)}`
            : '0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)',
          transform: 'translateY(-4px)'
        } : {},
        '&:focus-visible': clickable ? { borderColor: 'primary.main' } : undefined,
        ...sx
      }}
    >
      <CardContent sx={{
        py: 1.25,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 110,
        alignItems: centerOnMobile ? { xs: 'center', md: 'flex-start' } : 'flex-start',
        textAlign: centerOnMobile ? { xs: 'center', md: 'left' } : 'left'
      }}>
        <Box sx={{
          display: 'flex',
          justifyContent: centerOnMobile ? { xs: 'center', md: 'space-between' } : 'space-between',
          alignItems: 'center',
          mb: 0.25,
          width: '100%',
          position: 'relative'
        }}>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {label}
          </Typography>
          {action && (
            <Box sx={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}>
              {action}
            </Box>
          )}
        </Box>
        {loading ? (
          <Skeleton variant="text" width={120} height={32} />
        ) : (
          <>
            <Box sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 1,
              justifyContent: centerOnMobile ? { xs: 'center', md: 'flex-start' } : 'flex-start'
            }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {formatter ? formatter(value) : value}
              </Typography>
              {hint && (
                <Typography variant="caption" color="text.secondary">
                  {hint}
                </Typography>
              )}
            </Box>
            <Box sx={{
              mt: 0.5,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              justifyContent: centerOnMobile ? { xs: 'center', md: 'flex-start' } : 'flex-start'
            }}>
              {deltaLoading ? (
                <Skeleton variant="text" width={60} height={20} />
              ) : delta && typeof delta.value === 'number' ? (
                <>
                  {delta.direction === 'up' ? (
                    <TrendingUpIcon sx={{ fontSize: 16, color: '#10b981' }} />
                  ) : delta.direction === 'down' ? (
                    <TrendingDownIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                  ) : (
                    <Box sx={{ width: 0, height: 0 }} />
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      color: delta.direction === 'up' ? '#10b981' : delta.direction === 'down' ? '#ef4444' : 'text.secondary',
                      fontWeight: 600,
                      ml: 0.5
                    }}
                  >
                    {Math.abs(delta.value).toFixed(1)}%
                  </Typography>
                </>
              ) : (
                // Reserve space to keep all cards equal height
                <Box sx={{ visibility: 'hidden' }}>
                  <TrendingUpIcon sx={{ fontSize: 16 }} />
                  <Typography variant="body2">0.0%</Typography>
                </Box>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card >
  );
}
