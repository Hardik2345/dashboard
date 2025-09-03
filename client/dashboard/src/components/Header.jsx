import { AppBar, Toolbar, Typography, Box, Button, IconButton, Chip, Stack } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function Header({ user, onLogout }) {
  const brand = user?.email ? user.email.split('@')[0].toUpperCase() : null;
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ pt: 1, pb: 1 }}>
      <Toolbar sx={{ flexDirection: 'column', gap: 0.5, minHeight: 'unset', py: 0, width: '100%' }}>
        {user && (
          <Box sx={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" noWrap sx={{ maxWidth: { xs: 130, sm: 200 }, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
              {user.email}
            </Typography>
            {!user.isAuthor && brand && <Chip size="small" label={brand} color="primary" variant="outlined" sx={{ fontWeight: 600 }} />}
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
        <Stack spacing={0.5} alignItems="center" sx={{ width: '100%' }}>
          <Typography
            variant="h5"
            component="div"
            sx={{ fontWeight: 800, textAlign: 'center', lineHeight: 1.1, letterSpacing: 0.2 }}
          >
            The Dashboard App
          </Typography>
          {brand && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              Brand: {brand}
            </Typography>
          )}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
