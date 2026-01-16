import { AppBar, Toolbar, Box, Button, IconButton, useTheme, useMediaQuery, Tooltip } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import FilterListIcon from '@mui/icons-material/FilterList'; // New Import
import SkyToggle from './ui/SkyToggle';

export default function Header({
  user,
  onLogout,
  onMenuClick,
  showMenuButton = false,
  darkMode = false,
  onToggleDarkMode,
  onFilterClick, // New Prop
  showFilterButton = false // New Prop to control visibility
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

        {/* Left: Hamburger menu + Mobile Brand Logo */}
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

          {/* Mobile Brand Logo */}
          <Box
            component="img"
            src="/brand-logo-dark.png"
            alt="Brand"
            loading="eager"
            decoding="async"
            sx={{
              display: { xs: 'block', md: 'none' }, // Mobile only
              height: { xs: 52, sm: 40 },
              width: 'auto',
              ml: 0.5,
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

        {/* Center: Desktop Brand image (Absolute Center) - RESTORED */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            borderRadius: 1,
            p: 0.5,
            bgcolor: darkMode ? '#121212' : 'transparent',
            top: -10,
            display: { xs: 'none', md: 'block' } // Hide on mobile
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

            {/* Filter Button (Mobile: First) */}
            {showFilterButton && isMobile && (
              <Button
                onClick={onFilterClick}
                endIcon={<FilterListIcon />}
                size="small"
                sx={{
                  textTransform: 'none',
                  color: darkMode ? '#f0f0f0' : 'inherit',
                  bgcolor: darkMode ? 'rgba(250, 247, 247, 0.05)' : 'rgba(87, 81, 81, 0.05)',
                  borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  mr: 1,
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  '&:hover': {
                    bgcolor: darkMode ? 'rgba(250, 247, 247, 0.1)' : 'rgba(87, 81, 81, 0.1)',
                  },
                  border: '0.5px solid grey',
                }}
              >
                Filters
              </Button>
            )}

            {/* Dark Mode Toggle (Mobile: Second, Desktop: First) */}
            <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} arrow>
              <Box sx={{ mr: 0.5 }}>
                <SkyToggle checked={darkMode} onChange={onToggleDarkMode} />
              </Box>
            </Tooltip>

            {/* Logout (Mobile: Third, Desktop: Second) */}
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
                  ml: 0.5,
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