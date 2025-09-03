import { useState } from 'react';
import { Stack, TextField, Button, Alert, Paper } from '@mui/material';

export default function AuthorBrandForm({ onCreated }) {
  const [form, setForm] = useState({ key:'', dbHost:'', dbPort:'3306', dbUser:'', dbPass:'', dbName:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  function update(k,v){ setForm(f=>({ ...f, [k]: v })); }

  async function handleSubmit(e){
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);
    try {
      const res = await fetch('/author/brands', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          key: form.key.trim().toUpperCase(),
          dbHost: form.dbHost.trim(),
          dbPort: Number(form.dbPort)||3306,
          dbUser: form.dbUser.trim(),
          dbPass: form.dbPass,
          dbName: form.dbName.trim() || form.key.trim().toUpperCase(),
        })
      });
      const json = await res.json();
      if (!res.ok) { throw new Error(json.error || 'Failed'); }
      setSuccess(`Brand ${json.brand.key} added (runtime only)`);
      onCreated && onCreated();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <Paper component="form" onSubmit={handleSubmit} sx={{ p:2 }} elevation={1}>
      <Stack spacing={1}>
        <TextField size="small" label="Brand Key" value={form.key} onChange={e=>update('key', e.target.value)} required helperText="Uppercase letters/numbers (2-20)"/>
        <TextField size="small" label="DB Host" value={form.dbHost} onChange={e=>update('dbHost', e.target.value)} required/>
        <TextField size="small" label="DB Port" value={form.dbPort} onChange={e=>update('dbPort', e.target.value)} required/>
        <TextField size="small" label="DB User" value={form.dbUser} onChange={e=>update('dbUser', e.target.value)} required/>
        <TextField size="small" label="DB Password" value={form.dbPass} type="password" onChange={e=>update('dbPass', e.target.value)} required/>
        <TextField size="small" label="DB Name" value={form.dbName} onChange={e=>update('dbName', e.target.value)} required/>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        <Button variant="contained" type="submit" disabled={loading}>{loading? 'Adding...' : 'Add Brand (Runtime)'}</Button>
      </Stack>
    </Paper>
  );
}
