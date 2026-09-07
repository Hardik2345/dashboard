import { Box, Container, Paper, Stack, Typography, Button, Divider, Alert } from '@mui/material';

function useReason() {
  try {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('reason') || '';
    const msg = params.get('msg') || '';
    return { reason, msg };
  } catch {
    return { reason: '', msg: '' };
  }
}

function prettyReason(reason, msg) {
  const map = {
    not_whitelisted: 'Your email is not whitelisted.',
    brand_unknown: 'We could not resolve your brand for this email. Please include a brand key when whitelisting, or map the domain.',
    user_not_provisioned: 'Your account is not provisioned for this brand.',
    user_inactive: 'Your account is inactive.',
    validation_failed: 'Temporary validation error while checking brand user. Please retry.',
    not_authorized_domain: 'Your email domain is not authorized to access this app.',
    google_oauth_failed: 'Google sign-in failed.'
  };
  const base = map[reason] || map.google_oauth_failed;
  if (msg && msg !== 'Login failed') return `${base} (${decodeURIComponent(msg)})`;
  return base;
}

export default function Unauthorized() {
  const { reason, msg } = useReason();
  const detail = prettyReason(reason, msg);

  return (
    <Box sx={{ minHeight: '100svh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Access not allowed</Typography>
            <Typography variant="body1" color="text.secondary">
              You are not authorised to use Datum with this account.
            </Typography>
            {(reason || msg) && <Alert severity="warning" sx={{ width: '100%' }}>{detail}</Alert>}
            <Typography variant="body2" color="text.secondary">If you believe this is a mistake, please contact your administrator.</Typography>
            <Divider flexItem sx={{ my: 1 }} />
            <Button size="medium" variant="contained" onClick={() => { window.location.href = '/'; }} sx={{ minWidth: 200 }}>
              Back to login
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
