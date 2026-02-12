import { AppBar, Toolbar, Box, Button, IconButton, useTheme, useMediaQuery, Tooltip, Typography } from '@mui/material';
import {
  Bell,
  Sun,
  Moon,
  LayoutGrid,
  SlidersHorizontal
} from 'lucide-react';

export default function Header({
  user,
  onLogout,
  onMenuClick,
  showMenuButton = false,
  darkMode = false,
  onToggleDarkMode,
  onFilterClick,
  showFilterButton = false
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Extract first name for the greeting
  const firstName = user?.name ? user.name.split(' ')[0] : (user?.email?.split('@')[0] || 'User');

  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={{
        bgcolor: 'transparent',
        borderBottom: isMobile ? '1px solid' : 'none',
        borderBottomColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        px: { xs: 1, md: 4 },
        py: { xs: 0, md: 1 }
      }}
    >
      <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: { xs: 48, md: 72 }, p: 0 }}>

        {/* Left: Greeting (Desktop) or Logo (Mobile) */}
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {isMobile ? (
            <Box
              component="img"
              src="/brand-logo-dark.png"
              alt="Brand"
              sx={{
                height: 40,
                width: 'auto',
                filter: darkMode ? 'invert(1) hue-rotate(180deg) brightness(1.2)' : 'none'
              }}
            />
          ) : (
            <>
              <Typography variant="h5" sx={{ fontWeight: 700, color: darkMode ? '#fff' : '#111', display: 'flex', alignItems: 'center', gap: 1 }}>
                Welcome, {firstName} <span style={{ fontSize: '1.2rem' }}>👋</span>
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Your store at a glance
              </Typography>
            </>
          )}
        </Box>

        {/* Right: Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 1.5 } }}>

          {/* Mobile Filter Button */}
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
                p: 0.8
              }}
            >
              <SlidersHorizontal size={18} />
            </IconButton>
          )}

          {/* Desktop Actions */}
          {!isMobile && (
            <>
              {/* Notifications */}
              <IconButton
                size="small"
                sx={{
                  bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  borderRadius: '10px',
                  p: 1.2,
                  color: darkMode ? 'zinc.400' : 'zinc.500',
                  '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }
                }}
              >
                <Bell size={20} />
              </IconButton>

              {/* Theme Toggle */}
              <IconButton
                onClick={onToggleDarkMode}
                size="small"
                sx={{
                  bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : '#FFF3E0',
                  borderRadius: '10px',
                  p: 1.2,
                  color: darkMode ? '#fff' : '#FF9800',
                  '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : '#FFE0B2' }
                }}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </IconButton>

              {/* Customize Widget Button */}
              <Button
                variant="contained"
                startIcon={<LayoutGrid size={18} />}
                sx={{
                  bgcolor: '#37B29B',
                  color: '#fff',
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: '10px',
                  px: 2,
                  py: 1,
                  '&:hover': { bgcolor: '#2D9381' },
                  boxShadow: 'none'
                }}
              >
                Customize Widget
              </Button>
            </>
          )}

          {/* Mobile Theme Toggle (Fallthrough) */}
          {isMobile && (
            <IconButton onClick={onToggleDarkMode} size="small" sx={{ color: darkMode ? '#fff' : 'inherit' }}>
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </IconButton>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}