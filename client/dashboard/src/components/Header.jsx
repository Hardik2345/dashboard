import { AppBar, Toolbar, Box, Button, IconButton, useTheme, useMediaQuery, Tooltip } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import FilterListIcon from '@mui/icons-material/FilterList'; // New Import
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import SparklesIcon from '@mui/icons-material/AutoAwesome';
import SkyToggle from './ui/SkyToggle';

export default function Header({
  user,
  onLogout,
  onMenuClick,
  showMenuButton = false,
  darkMode = false,
  onToggleDarkMode,
  onFilterClick, // New Prop
  showFilterButton = false, // New Prop to control visibility
  onToggleDemo,
  showDemo
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
        borderBottom: { xs: '1px solid', md: 'none' }, // Mobile only bottom border
        borderBottomColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
      }}
    >
      <Toolbar sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: { xs: 48, md: 64 }, py: 0 }}>

        {/* Left: Hamburger menu + Mobile Brand Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {showMenuButton && isMobile && (
            <IconButton
              onClick={onMenuClick}
              size="small"
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
              height: { xs: 50, sm: 40 },
              width: 'auto',
              ml: 0,
              mt: 0.3,
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0 }}>


            {/* Filter Button (Mobile: First) */}
            {showFilterButton && isMobile && (
              <IconButton
                onClick={onFilterClick}
                size="small"
                sx={{
                  color: darkMode ? '#f0f0f0' : 'inherit',
                  bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  border: '1px solid',
                  borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  borderRadius: '8px',
                  mr: 1,
                  p: 0.5,
                  '&:hover': {
                    bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  },
                }}
              >
                <TuneRoundedIcon fontSize="small" />
              </IconButton>
            )}

            {/* Demo Toggle (New Integration Check) */}
            <Tooltip title={showDemo ? "Hide New Integration Demo" : "Show New Integration Demo"} arrow>
              <Button
                variant={showDemo ? "contained" : "outlined"}
                size="small"
                onClick={onToggleDemo}
                startIcon={<SparklesIcon sx={{ fontSize: '1rem' }} />}
                sx={{
                  mr: 2,
                  display: { xs: 'none', lg: 'flex' },
                  borderRadius: '20px',
                  textTransform: 'none',
                  fontWeight: 600,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  ...(showDemo
                    ? {
                      bgcolor: '#6366f1',
                      color: 'white',
                      '&:hover': { bgcolor: '#4f46e5', transform: 'scale(1.05)' }
                    }
                    : {
                      borderColor: darkMode ? 'rgba(99, 102, 241, 0.5)' : '#6366f1',
                      color: darkMode ? '#818cf8' : '#6366f1',
                      '&:hover': {
                        borderColor: '#4f46e5',
                        bgcolor: 'rgba(99, 102, 241, 0.1)',
                        transform: 'scale(1.05)'
                      }
                    })
                }}
              >
                {showDemo ? "Hide Demo" : "✨ Demo"}
              </Button>
            </Tooltip>

            {/* Dark Mode Toggle (Mobile: Second, Desktop: First) */}
            <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} arrow>
              <Box sx={{ mr: { xs: 0.1, sm: 1 } }}>
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