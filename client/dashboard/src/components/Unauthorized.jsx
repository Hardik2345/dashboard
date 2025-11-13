import { Box, Container, Paper, Stack, Typography, Button, Divider } from '@mui/material';

export default function Unauthorized() {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

  return (
    <Box sx={{ minHeight: '100svh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Access not allowed</Typography>
            <Typography variant="body1" color="text.secondary">
              You are not authorised to use Datum with this account.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              If you believe this is a mistake, please contact your administrator.
            </Typography>
            <Divider flexItem sx={{ my: 1 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: '100%' }}>
              <Button fullWidth variant="contained" onClick={() => { window.location.href = `${base}/auth/google`; }}>
                Try a different Google account
              </Button>
              <Button fullWidth variant="outlined" onClick={() => { window.location.href = '/'; }}>
                Back to login
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
