import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, Stack, Switch, FormControlLabel, Typography, Alert, Button } from '@mui/material';
import { getAccessControl, setAccessMode, setAccessSettings } from '../lib/api.js';

export default function AccessControlCard() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('domain');
  const [autoProvision, setAutoProvision] = useState(false);
  const [whitelistCount, setWhitelistCount] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getAccessControl();
      if (r.error) { setError(r.data?.error || 'Failed to load'); }
      else {
        setMode(r.data.mode);
        setAutoProvision(!!r.data.autoProvision);
        setWhitelistCount(r.data.whitelistCount || 0);
      }
      setLoading(false);
    })();
  }, []);

  async function handleToggleMode(ev) {
    const next = ev.target.checked ? 'domain' : 'whitelist';
    setSaving(true);
    const r = await setAccessMode(next);
    setSaving(false);
    if (r.error) setError(r.data?.error || 'Failed to update'); else setMode(next);
  }

  async function handleAutoProvision(ev) {
    const next = ev.target.checked;
    setSaving(true);
    const r = await setAccessSettings({ autoProvision: next });
    setSaving(false);
    if (r.error) setError(r.data?.error || 'Failed to update'); else setAutoProvision(next);
  }

  return (
    <Card variant="outlined">
      <CardHeader title="Access control" subheader="Control who can sign in with Google" />
      <CardContent>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormControlLabel
            control={<Switch checked={mode === 'domain'} onChange={handleToggleMode} disabled={loading || saving} />}
            label={mode === 'domain' ? 'Allow access by domain map' : 'Whitelist only'}
          />
          <Typography variant="body2" color="text.secondary">
            {mode === 'domain'
              ? 'Anyone whose email domain is mapped to a brand can sign in.'
              : `Only whitelisted emails can sign in. ${whitelistCount} whitelisted.`}
          </Typography>
          <FormControlLabel
            control={<Switch checked={autoProvision} onChange={handleAutoProvision} disabled={loading || saving} />}
            label="Auto-create brand user on first SSO"
          />
          <Typography variant="caption" color="text.secondary">
            Creates an active brand user with a random password. Local-password login remains disabled unless explicitly set later.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
