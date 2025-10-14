import { AppBar, Toolbar, Typography, Box, Button, IconButton, Chip } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function Header({ user, onLogout }) {
  const brand = user?.email ? user.email.split('@')[0].toUpperCase() : null;
  // Prefer explicit brand fields if present; fallback to derived brand from email
  const brandName = user?.activeBrand?.name || user?.brandName || brand;
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ py: 1 }}>
      <Toolbar sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 'unset', py: 0 }}>
        {/* Left: Brand logo linking to home */}
        <Box component="a" href="/" aria-label="Home" sx={{ display: 'inline-flex', alignItems: 'center' }}>
          <Box
            component="img"
            src="/brand-logo.jpg"
            alt="Brand"
            loading="eager"
            decoding="async"
            sx={{ height: { xs: 28, sm: 36 }, width: 'auto', display: 'block' }}
          />
        </Box>

        {/* Center: Dynamic brand title */}
        {brandName && (
          <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
            <Typography
              variant="h6"
              component="div"
              sx={{
                paddingTop: 3,
                fontWeight: 900,
                letterSpacing: { xs: '.08em', sm: '.22em' },
                textTransform: 'uppercase',
                color: 'text.primary',
                // Larger size on desktop while keeping mobile balanced
                fontSize: { xs: 'clamp(1.25rem, 6vw, 1.6rem)', sm: '2.1rem', md: '2.4rem' },
                lineHeight: 1.05,
                whiteSpace: 'nowrap',
              }}
            >
              {brandName}
            </Typography>
          </Box>
        )}

        {/* Right: User info and actions */}
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
            {!user.isAuthor && brand && (
              <Chip size="small" label={brand} color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
            )}
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Button size="small" variant="outlined" color="inherit" onClick={onLogout}>Logout</Button>
            </Box>
            <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
              <IconButton size="small" aria-label="logout" onClick={onLogout} color="inherit">
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}
