import { AppBar, Toolbar, Typography, Box } from '@mui/material';

export default function Header() {
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ pt: 1, pb: 1 }}>
      <Toolbar sx={{ flexDirection: 'column', gap: 0.5, minHeight: 'unset', py: 0 }}>
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
