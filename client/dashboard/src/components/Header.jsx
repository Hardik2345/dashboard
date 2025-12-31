import { AppBar, Toolbar, Typography, Box, Button, IconButton, Chip, useTheme, useMediaQuery, Tooltip } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';

export default function Header({ user, onLogout, onMenuClick, showMenuButton = false, darkMode = false, onToggleDarkMode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const brand = user?.email ? user.email.split('@')[0].toUpperCase() : null;
  // Prefer explicit brand fields if present; fallback to derived brand from email
  const brandName = user?.activeBrand?.name || user?.brandName || brand;
  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={{
        borderColor: 'grey.100',
        bgcolor: 'transparent',
      }}
    >
      <Toolbar sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: { xs: 56, md: 64 }, py: 0 }}>
        {/* Left: Hamburger menu (mobile) or Brand chip */}
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
          {!user?.isAuthor && brandName && (
            <Chip
              size="small"
              label={brandName}
              color="primary"
              variant="outlined"
              sx={{
                fontWeight: 600,
                maxWidth: { xs: 80, sm: 120, md: 160 },
                '& .MuiChip-label': {
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }
              }}
            />
          )}
        </Box>

        {/* Center: Brand image (replaces typography) */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            borderRadius: 1,
            p: 0.5,
            bgcolor: darkMode ? '#121212' : 'transparent',
            top: -10
          }}
        >
          <Box
            component="img"
            src="/brand-logo-dark.png"
            alt="Brand"
            loading="eager"
            decoding="async"
            sx={{
              display: 'block',
              height: { xs: 72, sm: 80, md: 96 },
              width: 'auto',
              ...(darkMode
                ? {
                  filter: 'invert(1) hue-rotate(180deg) brightness(1.2)',
                }
                : {
                  filter: 'none',
                }),
            }}
          />
        </Box>

        {/* Right: User info and actions */}
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
            {/* Dark Mode Toggle */}
            <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} arrow>
              <IconButton
                size="small"
                onClick={onToggleDarkMode}
                color="inherit"
                aria-label="Toggle dark mode"
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 0.75,
                }}
              >
                {darkMode ? (
                  <LightModeOutlinedIcon fontSize="small" sx={{ color: 'warning.main' }} />
                ) : (
                  <DarkModeOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Button
                size="small"
                variant="outlined"
                onClick={onLogout}
                sx={{
                  color: darkMode ? '#f0f0f0' : 'inherit',
                  borderColor: darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.23)',
                  '&:hover': {
                    borderColor: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                    bgcolor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                  },
                }}
              >
                Logout
              </Button>
            </Box>
            <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
              <IconButton
                size="small"
                aria-label="logout"
                onClick={onLogout}
                sx={{
                  color: darkMode ? '#f0f0f0' : 'inherit',
                }}
              >
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}
