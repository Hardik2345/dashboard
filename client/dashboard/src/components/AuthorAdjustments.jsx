import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, Stack, Typography, Button, TextField, Grid, Chip, Divider, Tooltip } from '@mui/material';
import dayjs from 'dayjs';
import { listAdjustmentBuckets, createAdjustmentBucket, updateAdjustmentBucket, deactivateAdjustmentBucket, previewAdjustments, applyAdjustments, listAuthorBrands } from '../lib/api.js';

function pct(v) { return `${(Number(v)||0).toFixed(2)}%`; }

export default function AuthorAdjustments() {
  const [buckets, setBuckets] = useState([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [brands, setBrands] = useState([]);
  const [brandKey, setBrandKey] = useState('');
  const [form, setForm] = useState({ lower_bound_sessions:'', upper_bound_sessions:'', offset_pct:'', priority:'100', effective_from:'', effective_to:'', notes:'' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [previewRange, setPreviewRange] = useState({ start: dayjs().format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') });
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);

  const loadBuckets = useCallback(async () => {
    setLoadingBuckets(true); setError(null);
    if (!brandKey) { setBuckets([]); setLoadingBuckets(false); return; }
    const json = await listAdjustmentBuckets({ brandKey });
    if (json.__error) setError('Failed to load buckets'); else setBuckets(json.buckets || []);
    setLoadingBuckets(false);
  }, [brandKey]);

  useEffect(() => { loadBuckets(); }, [loadBuckets]);

  // Load brands on mount
  useEffect(() => {
    (async () => {
      const json = await listAuthorBrands();
      if (!json.__error) {
        const arr = Array.isArray(json.brands) ? json.brands : [];
        setBrands(arr);
        if (arr.length && !brandKey) setBrandKey(arr[0].key);
      }
    })();
  }, []);

  async function handleCreate(e) {
    e.preventDefault(); setCreating(true); setError(null);
    const payload = {
      brand_key: brandKey,
      lower_bound_sessions: Number(form.lower_bound_sessions),
      upper_bound_sessions: Number(form.upper_bound_sessions),
      offset_pct: Number(form.offset_pct),
      priority: Number(form.priority),
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
      notes: form.notes || null
    };
    const r = await createAdjustmentBucket(payload);
    setCreating(false);
    if (r.error) { setError(r.data?.error || 'Create failed'); return; }
    setForm({ lower_bound_sessions:'', upper_bound_sessions:'', offset_pct:'', priority:'100', effective_from:'', effective_to:'', notes:'' });
    loadBuckets();
  }

  async function handleDeactivate(id) {
    const r = await deactivateAdjustmentBucket(id, { brandKey });
    if (r.error) setError('Deactivate failed');
    loadBuckets();
  }

  async function handlePreview() {
    setPreview(null); setError(null);
    const json = await previewAdjustments({ brandKey, ...previewRange });
    if (json.__error) { setError('Preview failed'); return; }
    setPreview(json);
  }

  async function handleApply() {
    setApplying(true); setError(null);
    const r = await applyAdjustments({ brandKey, ...previewRange });
    setApplying(false);
    if (r.error) { setError(r.data?.error || 'Apply failed'); return; }
    // Refresh preview & buckets to show new adjusted values in subsequent metrics
    handlePreview();
  }

  const totals = preview?.totals;
  const deltaColor = (v) => v > 0 ? 'success.main' : v < 0 ? 'error.main' : 'text.secondary';

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6">Select Brand</Typography>
            <TextField
              size="small"
              select
              SelectProps={{ native: true }}
              label="Brand"
              value={brandKey}
              onChange={(e)=>{ setBrandKey(e.target.value); setPreview(null); }}
            >
              {brands.map(b => (
                <option key={b.key} value={b.key}>{b.key}</option>
              ))}
            </TextField>
            {!brands.length && (
              <Typography variant="body2" color="text.secondary">No brands configured. Add a brand above first.</Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2} component="form" onSubmit={handleCreate}>
            <Typography variant="h6">Create Adjustment Bucket</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={6}><TextField size="small" label="Lower bound sessions" required type="number" value={form.lower_bound_sessions} onChange={e=>setForm(f=>({...f, lower_bound_sessions:e.target.value}))} /></Grid>
              <Grid item xs={6}><TextField size="small" label="Upper bound sessions" required type="number" value={form.upper_bound_sessions} onChange={e=>setForm(f=>({...f, upper_bound_sessions:e.target.value}))} /></Grid>
              <Grid item xs={4}><TextField size="small" label="Offset %" required type="number" value={form.offset_pct} onChange={e=>setForm(f=>({...f, offset_pct:e.target.value}))} /></Grid>
              <Grid item xs={4}><TextField size="small" label="Priority" required type="number" value={form.priority} onChange={e=>setForm(f=>({...f, priority:e.target.value}))} /></Grid>
              <Grid item xs={4}><TextField size="small" label="Notes" value={form.notes} onChange={e=>setForm(f=>({...f, notes:e.target.value}))} /></Grid>
              <Grid item xs={6}><TextField size="small" label="Effective from (YYYY-MM-DD)" value={form.effective_from} onChange={e=>setForm(f=>({...f, effective_from:e.target.value}))} /></Grid>
              <Grid item xs={6}><TextField size="small" label="Effective to (YYYY-MM-DD)" value={form.effective_to} onChange={e=>setForm(f=>({...f, effective_to:e.target.value}))} /></Grid>
            </Grid>
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" size="small" disabled={creating}>{creating ? 'Creating...' : 'Create bucket'}</Button>
              {error && <Typography variant="body2" color="error">{error}</Typography>}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Typography variant="h6">Buckets ({buckets.length})</Typography>
            {loadingBuckets && <Typography variant="body2">Loading...</Typography>}
            {!loadingBuckets && buckets.length === 0 && <Typography variant="body2" color="text.secondary">No buckets yet.</Typography>}
            <Stack spacing={0.75}>
              {buckets.map(b => (
                <Card key={b.id} variant="outlined" sx={{ p:1 }}>
                  <Stack direction={{ xs:'column', sm:'row' }} spacing={1} alignItems={{ sm:'center' }} justifyContent="space-between">
                    <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                      <Chip size="small" label={`ID ${b.id}`} />
                      <Chip size="small" label={`Range ${b.lower_bound_sessions}–${b.upper_bound_sessions}`} />
                      <Chip size="small" label={`Offset ${pct(b.offset_pct)}`} color={b.offset_pct >= 0 ? 'success' : 'error'} />
                      <Chip size="small" label={`Priority ${b.priority}`} />
                      <Chip size="small" label={b.active ? 'Active' : 'Inactive'} color={b.active ? 'primary' : 'default'} />
                      {b.effective_from && <Chip size="small" label={`From ${b.effective_from}`} />}
                      {b.effective_to && <Chip size="small" label={`To ${b.effective_to}`} />}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      {b.active ? <Button size="small" onClick={()=>handleDeactivate(b.id)}>Deactivate</Button> : null}
                    </Stack>
                  </Stack>
                  {b.notes && <Typography variant="caption" sx={{ mt:0.5 }}>{b.notes}</Typography>}
                </Card>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6">Preview & Apply</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <TextField size="small" label="Start" type="text" value={previewRange.start} onChange={e=>setPreviewRange(r=>({...r,start:e.target.value}))} />
              <TextField size="small" label="End" type="text" value={previewRange.end} onChange={e=>setPreviewRange(r=>({...r,end:e.target.value}))} />
              <Button variant="outlined" size="small" onClick={handlePreview}>Preview</Button>
              <Button variant="contained" size="small" disabled={!preview || applying} onClick={handleApply}>{applying ? 'Applying...' : 'Apply adjustments'}</Button>
            </Stack>
            {preview && (
              <Stack spacing={1}>
                <Divider />
                <Typography variant="subtitle2">Totals</Typography>
                <Typography variant="body2">
                  Raw {totals.raw} → Adjusted {totals.adjusted} ({totals.delta >= 0 ? '+' : ''}{totals.delta} / {totals.delta_pct.toFixed(2)}%)
                </Typography>
                <Divider />
                <Typography variant="subtitle2">Daily breakdown</Typography>
                <Stack spacing={0.5} sx={{ maxHeight:300, overflowY:'auto' }}>
                  {preview.days.map(d => (
                    <Stack key={d.date} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Typography variant="caption" sx={{ width:90 }}>{d.date}</Typography>
                      <Typography variant="caption" sx={{ flex:1 }}>Raw {d.raw_sessions}</Typography>
                      <Typography variant="caption" sx={{ flex:1, color: deltaColor(d.delta) }}>Adj {d.preview_adjusted_sessions} ({d.delta >=0?'+':''}{d.delta})</Typography>
                      <Tooltip title={d.bucket_applied ? `Bucket ${d.bucket_applied} offset ${pct(d.offset_pct)}` : 'No bucket applied'}>
                        <Chip size="small" label={d.bucket_applied ? `B${d.bucket_applied}` : '—'} />
                      </Tooltip>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            )}
            {error && <Typography variant="body2" color="error">{error}</Typography>}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
