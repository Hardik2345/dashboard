import { useState } from 'react';
import { Card, CardHeader, CardContent, Grid, TextField, Button, Alert, InputAdornment, IconButton, Tooltip, Stack, Typography, Divider } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import HelpOutline from '@mui/icons-material/HelpOutline';

export default function AuthorBrandForm({ onCreated }) {
  const [form, setForm] = useState({ key:'', dbHost:'', dbPort:'3306', dbUser:'', dbPass:'', dbName:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showPass, setShowPass] = useState(false);

  const keyValid = !form.key || /^[A-Z0-9_]{2,20}$/.test(form.key.toUpperCase());

  function update(k,v){
    setForm(f=>({ ...f, [k]: v }));
  }

  async function handleSubmit(e){
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);
    try {
      const payload = {
        key: form.key.trim().toUpperCase(),
        dbHost: form.dbHost.trim(),
        dbPort: Number(form.dbPort)||3306,
        dbUser: form.dbUser.trim(),
        dbPass: form.dbPass,
        dbName: (form.dbName.trim()||form.key.trim().toUpperCase())
      };
      const res = await fetch('/author/brands', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify(payload) });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error || 'Failed');
      setSuccess(`Brand ${json.brand.key} added (runtime, restart required to persist).`);
      onCreated && onCreated();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Card component="form" onSubmit={handleSubmit} elevation={0} sx={{ border:'1px solid', borderColor:'divider' }}>
      <CardHeader titleTypographyProps={{ variant:'h6', fontWeight:700 }} title="Add Brand" subheader={<Typography variant="caption" color="text.secondary">Runtime only – credentials live in memory until process restarts.</Typography>} />
      <CardContent sx={{ pt:0 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField size="small" label="Brand Key" value={form.key} onChange={e=>update('key', e.target.value.toUpperCase())} required fullWidth error={!keyValid} helperText={keyValid? 'Uppercase letters/numbers (2-20)' : 'Invalid key format'} />
          </Grid>
          <Grid item xs={12} md={8}>
            <TextField size="small" label="DB Host" value={form.dbHost} onChange={e=>update('dbHost', e.target.value)} required fullWidth />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField size="small" label="DB Port" value={form.dbPort} onChange={e=>update('dbPort', e.target.value)} fullWidth InputProps={{ endAdornment:<InputAdornment position="end">TCP</InputAdornment> }} />
          </Grid>
            <Grid item xs={12} md={9}>
              <TextField size="small" label="DB User" value={form.dbUser} onChange={e=>update('dbUser', e.target.value)} required fullWidth />
            </Grid>
          <Grid item xs={12} md={6}>
            <TextField size="small" label="DB Password" value={form.dbPass} onChange={e=>update('dbPass', e.target.value)} required fullWidth type={showPass? 'text':'password'} InputProps={{ endAdornment: <InputAdornment position="end"><IconButton size="small" onClick={()=>setShowPass(s=>!s)}>{showPass? <VisibilityOff fontSize="small"/>:<Visibility fontSize="small"/>}</IconButton></InputAdornment> }} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField size="small" label="DB Name" value={form.dbName} onChange={e=>update('dbName', e.target.value)} required fullWidth />
          </Grid>
          <Grid item xs={12}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
              <Tooltip title="Only in current runtime; add to hosting env + redeploy for permanence." placement="right" arrow>
                <HelpOutline fontSize="small" color="action" />
              </Tooltip>
              <Typography variant="caption" color="text.secondary">Hot-loaded brand is available immediately.</Typography>
            </Stack>
          </Grid>
          {error && <Grid item xs={12}><Alert severity="error" variant="filled" sx={{ fontSize:13 }}>{error}</Alert></Grid>}
          {success && <Grid item xs={12}><Alert severity="success" sx={{ fontSize:13 }}>{success}</Alert></Grid>}
          <Grid item xs={12}>
            <Divider sx={{ mb:1 }} />
            <Button variant="contained" type="submit" disabled={loading || !keyValid} fullWidth size="large" sx={{ py:1 }}>
              {loading? 'Adding...' : 'Add Brand (Runtime)'}
            </Button>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
