import { AppBar, Toolbar, Typography, Box, Button, IconButton, Chip, useTheme, useMediaQuery } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';

export default function Header({ user, onLogout, onMenuClick, showMenuButton = false }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const brand = user?.email ? user.email.split('@')[0].toUpperCase() : null;
  // Prefer explicit brand fields if present; fallback to derived brand from email
  const brandName = user?.activeBrand?.name || user?.brandName || brand;
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{  borderColor: 'grey.100' }}>
      <Toolbar sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: { xs: 56, md: 64 }, py: 0 }}>
        {/* Left: Hamburger menu (mobile) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {showMenuButton && isMobile && (
            <IconButton
              onClick={onMenuClick}
              size="medium"
              aria-label="Open navigation menu"
            >
              <MenuIcon />
            </IconButton>
          )}
        </Box>

        {/* Center: Brand image (replaces typography) */}
        <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
          <Box
            component="img"
            src="/brand-logo-final.png"
            alt="Brand"
            loading="eager"
            decoding="async"
            sx={{
              display: 'block',
              height: { xs: 72, sm: 80, md: 96 },
              width: 'auto',
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
