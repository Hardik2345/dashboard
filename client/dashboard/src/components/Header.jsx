import { AppBar, Toolbar, Typography, Box, Button, IconButton } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

export default function Header({ user, onLogout }) {
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ pt: 1, pb: 1 }}>
      <Toolbar sx={{ flexDirection: 'column', gap: 0.5, minHeight: 'unset', py: 0, width: '100%' }}>
        {user && (
          <Box sx={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mb: 0.5 }}>
            <Typography variant="caption" noWrap sx={{ maxWidth: { xs: 130, sm: 200 }, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
              {user.email}
            </Typography>
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
        <Typography
          variant="h5"
          component="div"
          sx={{ fontWeight: 800, textAlign: 'center', lineHeight: 1.1, letterSpacing: 0.2 }}
        >
          Personal Touch Skincare
        </Typography>
        <Box
          component="img"
          src="/brand-logo.jpg"
          alt="Brand logo"
          sx={{
            width: { xs: 110, sm: 130 },
            maxHeight: 60,
            height: 'auto',
            display: 'block',
            mt: 0.25,
            opacity: 0.92,
            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.10))',
          }}
        />
      </Toolbar>
    </AppBar>
  );
}
