import { AppBar, Toolbar, Typography, Box } from '@mui/material';

export default function Header() {
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ pt: 0.75, pb: 1 }}>
      <Toolbar sx={{ flexDirection: 'column', gap: 0.75, minHeight: 'unset', py: 0 }}>
        <Typography
          variant="h6"
            component="div"
            sx={{ fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}
        >
          Personal Touch Skincare
        </Typography>
        <Box
          component="img"
          src="/brand-logo.jpg"
          alt="Brand logo"
          sx={{
            width: { xs: 160, sm: 200 },
            height: 'auto',
            display: 'block',
            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.08))',
          }}
        />
      </Toolbar>
    </AppBar>
  );
}
