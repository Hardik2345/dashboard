import { AppBar, Toolbar, Typography, Box, Button, IconButton, Chip } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function Header({ user, onLogout }) {
  const brand = user?.email ? user.email.split('@')[0].toUpperCase() : null;
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ py: 1 }}>
      <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 'unset', py: 0 }}>
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
