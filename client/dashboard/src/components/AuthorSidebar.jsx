import { useMemo } from 'react';
import {
  Box,
  Divider,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import AuthorBrandSelector from './AuthorBrandSelector.jsx';

const NAV_ITEMS = [
  {
    value: 'dashboard',
    label: 'Dashboard',
    description: 'KPIs & trends',
    icon: <DashboardOutlinedIcon fontSize="small" />,
  },
  {
    value: 'access',
    label: 'Access Control',
    description: 'Login restrictions',
    icon: <SecurityOutlinedIcon fontSize="small" />,
  },
  {
    value: 'adjustments',
    label: 'Session Adjustments',
    description: 'Buckets & rules',
    icon: <TuneOutlinedIcon fontSize="small" />,
  },
  {
    value: 'brands',
    label: 'Brand Setup',
    description: 'Connections & deploys',
    icon: <FactoryOutlinedIcon fontSize="small" />,
  },
];

export default function AuthorSidebar({
  brands,
  brandValue,
  loading,
  lastLoadedAt,
  onBrandChange,
  onRefresh,
  tabValue,
  onTabChange,
  themeMode,
  onToggleTheme,
}) {
  const theme = useTheme();

  const navItems = useMemo(() => NAV_ITEMS, []);

  return (
    <Box
      component="aside"
      sx={(theme) => ({
        width: { xs: '100%', md: 284, lg: 300 },
        flexShrink: 0,
        borderRight: { md: '1px solid' },
        borderBottom: { xs: '1px solid', md: 'none' },
        borderColor: 'divider',
        bgcolor: theme.palette.mode === 'dark'
          ? alpha(theme.palette.background.paper, 0.9)
          : alpha(theme.palette.background.paper, 0.96),
        px: { xs: 1.5, sm: 2.25 },
        py: { xs: 2, sm: 2.75 },
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        position: { md: 'sticky' },
        top: { md: theme.spacing(3) },
        maxHeight: { md: `calc(100vh - ${theme.spacing(4)})` },
        overflowY: { md: 'auto' },
        boxShadow: {
          md: theme.palette.mode === 'dark'
            ? `inset -1px 0 0 ${alpha(theme.palette.common.white, 0.04)}`
            : `6px 0 24px ${alpha(theme.palette.common.black, 0.05)}`,
        },
  backdropFilter: { md: 'blur(8px)' },
  WebkitBackdropFilter: { md: 'blur(8px)' },
      })}
    >
      <AuthorBrandSelector
        brands={brands}
        value={brandValue}
        loading={loading}
        lastLoadedAt={lastLoadedAt}
        onChange={onBrandChange}
        onRefresh={onRefresh}
      />

      <Divider flexItem sx={{ borderColor: 'divider', my: 1 }} />

      <Stack spacing={1.5} flexGrow={1} minHeight={0}>
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
          Navigation
        </Typography>
        <List sx={{ p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.value}
              selected={tabValue === item.value}
              onClick={() => {
                if (typeof onTabChange === 'function') onTabChange(item.value);
              }}
              sx={{
                borderRadius: 2,
                alignItems: 'flex-start',
                py: 1,
                px: 1.25,
                transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                  boxShadow: `0 0 0 1px ${theme.palette.action.selected}`,
                  '&:hover': { bgcolor: 'action.selected' },
                },
                '&:hover .MuiListItemIcon-root': { color: 'primary.main' },
                '&.Mui-selected .MuiListItemIcon-root': { color: 'primary.main' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'text.secondary', mt: 0.25 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                secondary={item.description}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600, color: 'text.primary' }}
                secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
              />
            </ListItemButton>
          ))}
        </List>
      </Stack>

      <Divider flexItem sx={{ borderColor: 'divider', my: 1 }} />

      <Stack spacing={1.25}>
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
          Appearance
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={themeMode === 'dark'}
              onChange={() => {
                if (typeof onToggleTheme === 'function') onToggleTheme();
              }}
              color="primary"
              inputProps={{ 'aria-label': 'Toggle dark mode' }}
            />
          }
          sx={{
            m: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            '& .MuiFormControlLabel-label': { flexGrow: 1 },
          }}
          label={
            <Stack direction="row" spacing={1} alignItems="center">
              {themeMode === 'dark' ? (
                <DarkModeOutlinedIcon fontSize="small" color="primary" />
              ) : (
                <LightModeOutlinedIcon fontSize="small" color="primary" />
              )}
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {themeMode === 'dark' ? 'Dark mode' : 'Light mode'}
              </Typography>
            </Stack>
          }
        />
        <Typography variant="caption" color="text.secondary">
          Your preference is remembered for this browser.
        </Typography>
      </Stack>
    </Box>
  );
}
