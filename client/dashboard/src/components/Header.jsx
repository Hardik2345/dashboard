import { AppBar, Toolbar, Typography } from '@mui/material';

export default function Header() {
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ py: 0.5 }}>
      <Toolbar sx={{ justifyContent: 'center' }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, textAlign: 'center' }}>
          Personal Touch Skincare
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
