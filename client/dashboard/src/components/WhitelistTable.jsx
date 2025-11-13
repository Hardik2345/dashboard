import { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, Stack, TextField, Button, Grid, Alert, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Box } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { listWhitelist, addWhitelist, removeWhitelist } from '../lib/api.js';

export default function WhitelistTable() {
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState('');
  const [brandKey, setBrandKey] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const r = await listWhitelist();
    if (r.error) setError(r.data?.error || 'Failed to load'); else setRows(r.data.emails || []);
  }

  useEffect(() => { refresh(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    const r = await addWhitelist(email.trim().toLowerCase(), brandKey.trim().toUpperCase() || undefined, notes.trim() || undefined);
    setSaving(false);
    if (r.error) { setError(r.data?.error || 'Failed to add'); return; }
    setEmail(''); setBrandKey(''); setNotes('');
    refresh();
  }

  async function handleRemove(id) {
    const r = await removeWhitelist(id);
    if (r.error) { setError(r.data?.error || 'Failed to remove'); return; }
    refresh();
  }

  return (
    <Card variant="outlined" component="form" onSubmit={handleAdd}>
      <CardHeader title="Whitelist" subheader="Emails that can sign in when Whitelist mode is enabled" />
      <CardContent>
        <Stack spacing={1.25}>
          {error && <Alert severity="error">{error}</Alert>}
          <Grid container spacing={1}>
            <Grid item xs={12} sm={6}>
              <TextField label="Email" size="small" fullWidth required type="email" value={email} onChange={e=>setEmail(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="Brand key (optional)" size="small" fullWidth value={brandKey} onChange={e=>setBrandKey(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="Notes" size="small" fullWidth value={notes} onChange={e=>setNotes(e.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <Button variant="contained" type="submit" disabled={saving || !email} fullWidth>
                Add to whitelist
              </Button>
            </Grid>
          </Grid>
          <Box sx={{ width: '100%', overflowX: 'auto', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
            <Table size="small" sx={{ minWidth: 520 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Brand</TableCell>
                  <TableCell>Added</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ wordBreak: 'break-word' }}>{r.email}</TableCell>
                    <TableCell>{r.brand_key || '-'}</TableCell>
                    <TableCell>{r.created_at?.slice?.(0,19)?.replace('T',' ') || '-'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={()=>handleRemove(r.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={4}>No emails whitelisted yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
