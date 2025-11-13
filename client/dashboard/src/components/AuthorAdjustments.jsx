import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, Stack, Typography, Button, TextField, Grid, Chip, Snackbar, Alert } from '@mui/material';
import dayjs from 'dayjs';
import { listAdjustmentBuckets, createAdjustmentBucket, updateAdjustmentBucket, deactivateAdjustmentBucket, activateAdjustmentBucket, listAuthorBrands } from '../lib/api.js';

function pct(v) { return `${(Number(v)||0).toFixed(2)}%`; }

export default function AuthorAdjustments({ brandKey: externalBrandKey, onBrandKeyChange, brands: externalBrands }) {
  const [buckets, setBuckets] = useState([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const isBrandsControlled = Array.isArray(externalBrands);
  const isBrandControlled = externalBrandKey !== undefined;
  const [brands, setBrands] = useState(externalBrands || []);
  const [internalBrandKey, setInternalBrandKey] = useState(externalBrandKey || '');
  const brandKey = isBrandControlled ? (externalBrandKey || '') : internalBrandKey;
  const [selectedBucketIds, setSelectedBucketIds] = useState([]); // kept for future, not used now
  const [form, setForm] = useState({ lower_bound_sessions:'', upper_bound_sessions:'', offset_pct:'', priority:'100', effective_from:'', effective_to:'', notes:'' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [previewRange, setPreviewRange] = useState({ start: dayjs().format('YYYY-MM-DD'), end: dayjs().format('YYYY-MM-DD') }); // legacy, can be removed later
  const [preview, setPreview] = useState(null); // legacy
  const [applying, setApplying] = useState(false); // legacy
  const [notice, setNotice] = useState(null);
  const [activatingId, setActivatingId] = useState(null);
  const [deactivatingId, setDeactivatingId] = useState(null);

  useEffect(() => {
    if (isBrandsControlled) {
      setBrands(externalBrands || []);
    }
  }, [externalBrands, isBrandsControlled]);

  useEffect(() => {
    if (isBrandControlled) {
      setInternalBrandKey(externalBrandKey || '');
    }
  }, [externalBrandKey, isBrandControlled]);

  const updateBrandKey = useCallback((nextKey) => {
    const normalized = (nextKey || '').toString().trim().toUpperCase();
    if (!isBrandControlled) {
      setInternalBrandKey(normalized);
    }
    if (typeof onBrandKeyChange === 'function') {
      onBrandKeyChange(normalized);
    }
  }, [isBrandControlled, onBrandKeyChange]);

  const loadBuckets = useCallback(async () => {
    setLoadingBuckets(true); setError(null);
    if (!brandKey) { setBuckets([]); setLoadingBuckets(false); return; }
    const json = await listAdjustmentBuckets({ brandKey });
    if (json.__error) setError('Failed to load buckets'); else {
      const list = json.buckets || [];
      setBuckets(list);
    }
    setLoadingBuckets(false);
  }, [brandKey]);

  useEffect(() => { loadBuckets(); }, [loadBuckets]);

  // Reset selection and preview when brand changes (preview is legacy)
  useEffect(() => {
    setSelectedBucketIds([]);
    setPreview(null);
  }, [brandKey]);

  useEffect(() => {
    if (isBrandControlled) return;
    if (!brands.length) return;
    if (!brandKey) return;
    const exists = brands.some((b) => b.key === brandKey);
    if (!exists) {
      updateBrandKey(brands[0].key);
    }
  }, [brands, brandKey, isBrandControlled, updateBrandKey]);

  // Load brands on mount
  useEffect(() => {
    if (isBrandsControlled) return;
    (async () => {
      const json = await listAuthorBrands();
      if (!json.__error) {
        const arr = Array.isArray(json.brands) ? json.brands : [];
        setBrands(arr);
        if (arr.length && !brandKey) updateBrandKey(arr[0].key);
      }
    })();
  }, [isBrandsControlled, brandKey, updateBrandKey]);

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
    setDeactivatingId(id);
    // Use bucket-window scope so even if current range doesn't intersect, we still clear its effects
    const r = await deactivateAdjustmentBucket(id, { brandKey, scope: 'bucket-window' });
    if (r.error) setError(r.data?.error || 'Deactivate failed');
    else {
      setError(null);
      const matched = Number(r.data?.recomputed_matches ?? r.data?.recomputed_rows ?? 0);
      setNotice(`Deactivated and recomputed ${matched} day(s).`);
    }
    setDeactivatingId(null);
    await loadBuckets();
  }

  async function handleActivate(id) {
    setError(null);
    setActivatingId(id);
    // Ask server to activate and auto-apply for current range; limit to just this bucket to avoid surprises
    const r = await activateAdjustmentBucket(id, { brandKey, onlyThisBucket: true });
    if (r.error) { setError('Activate failed'); return; }
    const matched = Number(r.data?.auto_applied_matches ?? r.data?.auto_applied_rows ?? 0);
    setNotice(`Activated and applied to ${matched} day(s).`);
    // Refresh buckets and preview to reflect persisted values
    await loadBuckets();
  }
  // Legacy helpers (no longer used after auto-apply). Kept to avoid breaking other screens if imported.
  const totals = preview?.totals;
  const deltaColor = (v) => v > 0 ? 'success.main' : v < 0 ? 'error.main' : 'text.secondary';

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={1.25}>
            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', md: '1.1rem' } }}>Select Brand</Typography>
            <TextField
              size="small"
              select
              SelectProps={{ native: true }}
              label="Brand"
              value={brandKey ?? ''}
              onChange={(e)=>{ updateBrandKey(e.target.value); setPreview(null); }}
              disabled={!brands.length}
              helperText={!brands.length ? 'Add a brand in Brand Setup to begin' : undefined}
            >
              <option value="" disabled={!!brands.length}>Select brand</option>
              {brands.map(b => (
                <option key={b.key} value={b.key}>{b.key}</option>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>
      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2} component="form" onSubmit={handleCreate}>
            <Typography variant="h6">Create Adjustment Bucket</Typography>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}><TextField size="small" label="Lower bound sessions" required type="number" value={form.lower_bound_sessions} onChange={e=>setForm(f=>({...f, lower_bound_sessions:e.target.value}))} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField size="small" label="Upper bound sessions" required type="number" value={form.upper_bound_sessions} onChange={e=>setForm(f=>({...f, upper_bound_sessions:e.target.value}))} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField size="small" label="Offset %" required type="number" value={form.offset_pct} onChange={e=>setForm(f=>({...f, offset_pct:e.target.value}))} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField size="small" label="Priority" required type="number" value={form.priority} onChange={e=>setForm(f=>({...f, priority:e.target.value}))} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField size="small" label="Notes" value={form.notes} onChange={e=>setForm(f=>({...f, notes:e.target.value}))} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField size="small" label="Effective from (YYYY-MM-DD)" value={form.effective_from} onChange={e=>setForm(f=>({...f, effective_from:e.target.value}))} fullWidth /></Grid>
              <Grid item xs={12} sm={6}><TextField size="small" label="Effective to (YYYY-MM-DD)" value={form.effective_to} onChange={e=>setForm(f=>({...f, effective_to:e.target.value}))} fullWidth /></Grid>
            </Grid>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Button type="submit" variant="contained" size="small" disabled={creating} fullWidth>
                {creating ? 'Creating...' : 'Create bucket'}
              </Button>
              {error && <Typography variant="body2" color="error">{error}</Typography>}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={1.25}>
            <Typography variant="h6">Buckets ({buckets.length})</Typography>
            {loadingBuckets && <Typography variant="body2">Loading...</Typography>}
            {!loadingBuckets && buckets.length === 0 && <Typography variant="body2" color="text.secondary">No buckets yet.</Typography>}
            <Stack spacing={0.75}>
              {buckets.map(b => (
                <Card key={b.id} variant="outlined" sx={{ p: { xs: 1.25, md: 1.5 } }}>
                  <Stack direction={{ xs:'column', sm:'row' }} spacing={{ xs: 1, sm: 1.5 }} alignItems={{ xs: 'flex-start', sm:'center' }} justifyContent="space-between">
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" alignItems="center">
                      <Chip size="small" label={`ID ${b.id}`} />
                      <Chip size="small" label={`Range ${b.lower_bound_sessions}–${b.upper_bound_sessions}`} />
                      <Chip size="small" label={`Offset ${pct(b.offset_pct)}`} color={b.offset_pct >= 0 ? 'success' : 'error'} />
                      <Chip size="small" label={`Priority ${b.priority}`} />
                      <Chip size="small" label={b.active ? 'Active' : 'Inactive'} color={b.active ? 'primary' : 'default'} />
                      {b.effective_from && <Chip size="small" label={`From ${b.effective_from}`} />}
                      {b.effective_to && <Chip size="small" label={`To ${b.effective_to}`} />}
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                      {b.active ? (
                        <Button size="small" disabled={deactivatingId===b.id} onClick={()=>handleDeactivate(b.id)} fullWidth>
                          {deactivatingId===b.id? 'Deactivating…' : 'Deactivate'}
                        </Button>
                      ) : (
                        <Button size="small" variant="outlined" disabled={activatingId===b.id} onClick={()=>handleActivate(b.id)} fullWidth>
                          {activatingId===b.id? 'Activating…' : 'Activate'}
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                  {b.notes && <Typography variant="caption" sx={{ mt:0.5 }}>{b.notes}</Typography>}
                </Card>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Global notices */}
      <Snackbar open={!!notice} autoHideDuration={3000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setNotice(null)} severity="success" variant="filled" sx={{ width: '100%' }}>
          {notice}
        </Alert>
      </Snackbar>

      {/* Preview & Apply panel removed per new auto-apply flow. */}
    </Stack>
  );
}
