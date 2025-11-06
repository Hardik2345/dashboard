import { AppBar, Toolbar, Typography, Box, Button, IconButton, Chip } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function Header({ user, onLogout }) {
  const brand = user?.email ? user.email.split('@')[0].toUpperCase() : null;
  // Prefer explicit brand fields if present; fallback to derived brand from email
  const brandName = user?.activeBrand?.name || user?.brandName || brand;
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ py: 1 }}>
      <Toolbar sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 'unset', mb:2, py: 0 }}>
        {/* Left: Brand logo linking to home (hidden on xs for compact header) */}
          <Box component="a" href="/" aria-label="Home" sx={{ display: { xs: 'none', sm: 'inline-flex' }, alignItems: 'center' }}>
          <Box
            component="img"
            src="/brand-logo.jpg"
            alt="Brand"
            loading="eager"
            decoding="async"
            sx={{ height: { xs: 28, sm: 36 }, width: 'auto', display: 'block' }}
          />
        </Box>

        {/* Center: Brand image (replaces typography) */}
        <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
          <Box
            component="img"
            src="/image.png"
            alt="Brand"
            loading="eager"
            decoding="async"
            sx={{
              display: 'block',
                height: { xs: 72, sm: 96, md: 112 },
              width: 'auto',
              mt: { xs: 0.5, sm: 0 },
              filter: 'none',
            }}
          />
        </Box>

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
