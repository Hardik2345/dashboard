import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Stack,
  Typography,
  Alert,
  Button,
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Box,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { GlassChip } from './ui/GlassChip.jsx';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { adminListUsers, adminUpsertUser, adminDeleteUser, listAuthorBrands, listDomainRules, upsertDomainRule, deleteDomainRule } from '../lib/api';

const PERMISSION_OPTIONS = ["all", "product_filter", "utm_filter", "web_vitals", "payment_split_order", "payment_split_sales", "traffic_split", "sales_channel_filter"];

const emptyForm = {
  email: '',
  role: 'viewer',
  brand_ids: [],
  primary_brand_id: '',
  status: 'active',
  permissions: ['all'],
};

export default function AccessControlCard() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isEdit, setIsEdit] = useState(false);
  const [filterRole, setFilterRole] = useState('all');
  const [knownBrands, setKnownBrands] = useState([]);
  const availableBrands = useMemo(() => {
    const set = new Set(knownBrands);
    users.forEach((u) => {
      (u.brand_memberships || []).forEach((b) => {
        if (b.brand_id) set.add(b.brand_id.toUpperCase());
      });
    });
    return Array.from(set);
  }, [users, knownBrands]);
  const [domainRules, setDomainRules] = useState([]);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [domainForm, setDomainForm] = useState({
    domain: '',
    role: 'viewer',
    brand_ids: [],
    primary_brand_id: '',
    permissions: ['all'],
    status: 'active'
  });
  const [domainSaving, setDomainSaving] = useState(false);

  async function loadUsers() {
    setLoading(true);
    const r = await adminListUsers();
    if (r.error) setError(r.data?.error || 'Failed to load users');
    else {
      setUsers(r.data?.users || []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadDomainRules() {
    const r = await listDomainRules();
    if (!r.error) {
      setDomainRules(r.data?.rules || []);
    }
  }

  useEffect(() => {
    loadDomainRules();
  }, []);

  useEffect(() => {
    (async () => {
      const r = await listAuthorBrands();
      if (r.error) {
        console.warn('Failed to load brands', r);
        return;
      }
      const raw = r.data ?? r;
      const source = Array.isArray(raw?.brands) ? raw.brands : Array.isArray(raw) ? raw : [];
      const brands = source.map(b => (b.key || b.brand_id || b.name || b.toString()).toUpperCase()).filter(Boolean);
      console.log('Loaded brands for access control', brands, 'raw:', raw);
      setKnownBrands(brands);
    })();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => filterRole === 'all' ? true : (u.role === filterRole));
  }, [users, filterRole]);

  function openNew() {
    setForm(emptyForm);
    setIsEdit(false);
    setDialogOpen(true);
  }

  function openEdit(u) {
    setForm({
      email: u.email,
      role: u.role,
      brand_ids: (u.brand_memberships || []).map(b => b.brand_id),
      primary_brand_id: u.primary_brand_id || '',
      status: u.status || 'active',
      permissions: (u.brand_memberships?.[0]?.permissions) || ['all'],
    });
    setIsEdit(true);
    setDialogOpen(true);
  }

  function handleFormChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.email) { setError('Email is required'); return; }
    if (!form.primary_brand_id) {
      setError('Primary brand is required');
      return;
    }
    let brandIds = form.brand_ids || [];
    if (form.role === 'viewer') {
      if (!brandIds.length) { setError('Select at least one brand'); return; }
      if (!brandIds.includes(form.primary_brand_id)) {
        setError('Primary brand must be one of the selected brands');
        return;
      }
    } else {
      // For authors, ensure primary brand is included in memberships we save
      const merged = new Set(brandIds);
      merged.add(form.primary_brand_id);
      brandIds = Array.from(merged);
    }
    setSaving(true);
    const payload = {
      ...form,
      brand_ids: brandIds,
      permissions: form.role === 'author' ? ['all'] : form.permissions,
    };
    const r = await adminUpsertUser(payload);
    setSaving(false);
    if (r.error) {
      setError(r.data?.error || 'Save failed');
      return;
    }
    setDialogOpen(false);
    setError(null);
    await loadUsers();
  }

  const filteredDomainRules = useMemo(() => domainRules, [domainRules]);

  function openNewDomainRule() {
    setDomainForm({
      domain: '',
      role: 'viewer',
      brand_ids: [],
      primary_brand_id: '',
      permissions: ['all'],
      status: 'active'
    });
    setDomainDialogOpen(true);
  }

  async function handleSaveDomainRule() {
    if (!domainForm.domain) { setError('Domain is required'); return; }
    if (!domainForm.primary_brand_id) { setError('Primary brand is required'); return; }
    if (domainForm.role === 'viewer') {
      if (!domainForm.brand_ids.length) { setError('Select at least one brand'); return; }
      if (!domainForm.brand_ids.includes(domainForm.primary_brand_id)) {
        setError('Primary brand must be one of the selected brands');
        return;
      }
    }
    const payload = {
      ...domainForm,
      domain: domainForm.domain.toLowerCase().trim(),
      brand_ids: domainForm.brand_ids,
      permissions: domainForm.role === 'author' ? ['all'] : domainForm.permissions
    };
    setDomainSaving(true);
    const r = await upsertDomainRule(payload);
    setDomainSaving(false);
    if (r.error) {
      setError(r.data?.error || 'Failed to save domain rule');
      return;
    }
    setDomainDialogOpen(false);
    setError(null);
    loadDomainRules();
  }

  async function handleDeleteDomainRule(domain) {
    if (!window.confirm(`Delete domain rule for ${domain}?`)) return;
    const r = await deleteDomainRule(domain);
    if (r.error) {
      setError(r.data?.error || 'Failed to delete domain rule');
      return;
    }
    loadDomainRules();
  }

  async function handleDelete(email) {
    if (!window.confirm(`Delete user ${email}?`)) return;
    const r = await adminDeleteUser(email);
    if (r.error) {
      setError(r.data?.error || 'Delete failed');
      return;
    }
    await loadUsers();
  }

  function renderChips(list = [], max = 2) {
    if (!list.length) return null;
    const head = list.slice(0, max);
    const tail = list.slice(max);
    return (
      <Stack
        direction="row"
        spacing={0.5}
        flexWrap="wrap"
        alignItems="center"
        sx={{ maxWidth: 260, rowGap: 0.25, columnGap: 0.5 }}
      >
        {head.map((item) => (
          <GlassChip key={item} size="small" label={item} isDark={isDark} />
        ))}
        {tail.length > 0 && (
          <Tooltip title={tail.join(', ')}>
            <GlassChip size="small" label={`+${tail.length}`} sx={{ mt: 0.25 }} isDark={isDark} />
          </Tooltip>
        )}
      </Stack>
    );
  }

  const cellSx = {
    maxWidth: 260,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <Card sx={{ backgroundColor: 'transparent', backgroundImage: 'none' }}>
      <CardHeader
        title="Access Control"
        subheader="Manage who can sign in (author/viewer) and their brand access"
        action={
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={openNewDomainRule}>Add domain rule</Button>
            <Button size="small" variant="contained" onClick={openNew}>Add user</Button>
          </Stack>
        }
      />
      <CardContent>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2">Filter by role:</Typography>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <Select
                size="small"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                sx={{
                  fontSize: '0.8rem',
                  '& .MuiSelect-select': { py: 0.5, px: 1.5 }
                }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="author">Author</MenuItem>
                <MenuItem value="viewer">Viewer</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Box sx={{ position: 'relative' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Primary Brand</TableCell>
                  <TableCell>Brands</TableCell>
                  <TableCell>Permissions</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.id || u.email}>
                    <TableCell sx={cellSx}>
                      <Tooltip title={u.email}>
                        <Box component="span" sx={{ display: 'inline-block', maxWidth: '100%', ...cellSx }}>{u.email}</Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <GlassChip
                        label={u.role}
                        size="small"
                        color={u.role === 'author' ? 'primary' : 'default'}
                        sx={{ fontWeight: 'bold' }}
                        isDark={isDark}
                      />
                    </TableCell>
                    <TableCell sx={cellSx}>{u.primary_brand_id || '-'}</TableCell>
                    <TableCell sx={cellSx}>
                      {renderChips(
                        (() => {
                          const ids = (u.brand_memberships || []).map(b => b.brand_id).filter(Boolean);
                          if (u.role === 'author') return [...new Set(ids), 'ALL'];
                          return ids;
                        })(),
                        2
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {renderChips(u.role === 'author' ? ['all'] : (u.brand_memberships?.[0]?.permissions || []), 2)}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <GlassChip
                        size="small"
                        label={u.status}
                        color={u.status === 'active' ? 'success' : 'error'}
                        isDark={isDark}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Tooltip title="Edit">
                          <IconButton size="small" color="primary" onClick={() => openEdit(u)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDelete(u.email)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && filteredUsers.length === 0 && (
                  <TableRow><TableCell colSpan={7}><Typography variant="body2">No users</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            {loading && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(0,0,0,0.12)',
                  pointerEvents: 'none',
                }}
              >
                <CircularProgress size={24} />
              </Box>
            )}
          </Box>

          <Typography variant="h6" sx={{ mt: 2 }}>Domain rules</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Domain</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Primary Brand</TableCell>
                <TableCell>Brands</TableCell>
                <TableCell>Permissions</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDomainRules.map((r) => (
                <TableRow key={r._id || r.domain}>
                  <TableCell sx={cellSx}>{r.domain}</TableCell>
                  <TableCell sx={cellSx}>
                    <Chip
                      size="small"
                      icon={r.role === 'author' ? <ShieldOutlinedIcon fontSize="small" /> : <PersonOutlineIcon fontSize="small" />}
                      label={r.role}
                      color={r.role === 'author' ? 'primary' : 'default'}
                      variant={r.role === 'author' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell sx={cellSx}>{r.primary_brand_id}</TableCell>
                  <TableCell sx={cellSx}>
                    {renderChips(r.brand_ids || [], 2)}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {renderChips(r.role === 'author' ? ['all'] : (r.permissions || []), 2)}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <Chip
                      size="small"
                      label={r.status}
                      color={r.status === 'active' ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDeleteDomainRule(r.domain)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filteredDomainRules.length === 0 && (
                <TableRow><TableCell colSpan={7}><Typography variant="body2">No domain rules</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>

        </Stack>
      </CardContent>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{isEdit ? 'Edit user' : 'Add user'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Email"
              fullWidth
              value={form.email}
              onChange={(e) => handleFormChange('email', e.target.value)}
              disabled={isEdit}
            />
            <FormControl fullWidth>
              <InputLabel id="role-label">Role</InputLabel>
              <Select
                labelId="role-label"
                label="Role"
                value={form.role}
                onChange={(e) => handleFormChange('role', e.target.value)}
              >
                <MenuItem value="author">Author</MenuItem>
                <MenuItem value="viewer">Viewer</MenuItem>
              </Select>
            </FormControl>
            {form.role === 'viewer' && (
              <>
                <Autocomplete
                  multiple
                  freeSolo
                  options={availableBrands}
                  value={form.brand_ids}
                  filterSelectedOptions
                  onChange={(_, val) => handleFormChange('brand_ids', val.map(v => v.toString().trim().toUpperCase()).filter(Boolean))}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                    ))
                  }
                  renderInput={(params) => <TextField {...params} label="Brands" placeholder="Type and press Enter" fullWidth />}
                />
                <FormControl fullWidth>
                  <InputLabel id="primary-brand-label">Primary brand</InputLabel>
                  <Select
                    labelId="primary-brand-label"
                    label="Primary brand"
                    value={form.primary_brand_id}
                    onChange={(e) => handleFormChange('primary_brand_id', e.target.value)}
                  >
                    {(form.brand_ids || []).map((b) => (
                      <MenuItem key={b} value={b}>{b}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Autocomplete
                  multiple
                  options={PERMISSION_OPTIONS}
                  value={form.permissions}
                  onChange={(_, val) => handleFormChange('permissions', val)}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                    ))
                  }
                  renderInput={(params) => <TextField {...params} label="Permissions" placeholder="Select permissions" fullWidth helperText={`Available: ${PERMISSION_OPTIONS.join(', ')}`} />}
                />
              </>
            )}
            {form.role === 'author' && (
              <Stack spacing={1}>
                <Autocomplete
                  freeSolo
                  options={availableBrands}
                  value={form.primary_brand_id}
                  onChange={(_, val) => handleFormChange('primary_brand_id', (val || '').toString().trim().toUpperCase())}
                  renderInput={(params) => <TextField {...params} label="Primary brand (required)" helperText="Authors must set a primary brand" required fullWidth />}
                />
                <Alert severity="info">Authors have access to all brands and permissions.</Alert>
              </Stack>
            )}
            <FormControl fullWidth>
              <InputLabel id="status-label">Status</InputLabel>
              <Select
                labelId="status-label"
                label="Status"
                value={form.status}
                onChange={(e) => handleFormChange('status', e.target.value)}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">{isEdit ? 'Save' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={domainDialogOpen} onClose={() => setDomainDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add domain rule</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Domain"
              fullWidth
              value={domainForm.domain}
              onChange={(e) => setDomainForm(prev => ({ ...prev, domain: e.target.value }))}
              helperText="Example: trytechit.co"
            />
            <FormControl fullWidth>
              <InputLabel id="domain-role-label">Role</InputLabel>
              <Select
                labelId="domain-role-label"
                label="Role"
                value={domainForm.role}
                onChange={(e) => setDomainForm(prev => ({ ...prev, role: e.target.value }))}
              >
                <MenuItem value="author">Author</MenuItem>
                <MenuItem value="viewer">Viewer</MenuItem>
              </Select>
            </FormControl>
            <Autocomplete
              multiple
              freeSolo
              options={availableBrands}
              value={domainForm.brand_ids}
              filterSelectedOptions
              onChange={(_, val) => setDomainForm(prev => ({ ...prev, brand_ids: val.map(v => v.toString().trim().toUpperCase()).filter(Boolean) }))}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                ))
              }
              renderInput={(params) => <TextField {...params} label="Brands" placeholder="Type and press Enter" fullWidth />}
            />
            <Autocomplete
              freeSolo
              options={domainForm.brand_ids.length ? domainForm.brand_ids : availableBrands}
              value={domainForm.primary_brand_id}
              onChange={(_, val) => setDomainForm(prev => ({ ...prev, primary_brand_id: (val || '').toString().trim().toUpperCase() }))}
              renderInput={(params) => <TextField {...params} label="Primary brand (required)" required fullWidth />}
            />
            {domainForm.role === 'viewer' && (
              <Autocomplete
                multiple
                options={PERMISSION_OPTIONS}
                value={domainForm.permissions}
                onChange={(_, val) => setDomainForm(prev => ({ ...prev, permissions: val }))}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                  ))
                }
                renderInput={(params) => <TextField {...params} label="Permissions" placeholder="Select permissions" fullWidth helperText={`Available: ${PERMISSION_OPTIONS.join(', ')}`} />}
              />
            )}
            {domainForm.role === 'author' && (
              <Alert severity="info">Authors have access to all brands and permissions.</Alert>
            )}
            <FormControl fullWidth>
              <InputLabel id="domain-status-label">Status</InputLabel>
              <Select
                labelId="domain-status-label"
                label="Status"
                value={domainForm.status}
                onChange={(e) => setDomainForm(prev => ({ ...prev, status: e.target.value }))}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDomainDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveDomainRule} disabled={domainSaving} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

