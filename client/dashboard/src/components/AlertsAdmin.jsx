import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { KPI_METRICS } from '../constants/kpiMetrics.js';
import { createAlert, deleteAlert, listAlerts, setAlertActive, updateAlert } from '../lib/api.js';
import { toast } from 'react-toast';

const METRIC_TYPES = [
  { value: 'base', label: 'Base' },
  { value: 'derived', label: 'Derived' },
];

const THRESHOLD_TYPES = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'percentage_drop', label: 'Percentage Drop' },
  { value: 'percentage_rise', label: 'Percentage Rise' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'more_than', label: 'More Than' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function buildInitialForm(defaultBrand = '') {
  return {
    id: null,
    name: '',
    brand_key: defaultBrand,
    metric_name: '',
    metric_type: 'base',
    formula: '',
    threshold_type: 'absolute',
    threshold_value: '',
    critical_threshold: '',
    severity: 'low',
    cooldown_minutes: 30,
    lookback_days: 7,
    quiet_hours_start: '',
    quiet_hours_end: '',
    recipients: '',
    is_active: true,
  };
}

function formatTimeValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    if (value.includes(':')) return value.slice(0, 5);
    const trimmed = value.trim();
    if (/^\d{1,2}$/.test(trimmed)) {
      return `${trimmed.padStart(2, '0')}:00`;
    }
    return trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${String(value).padStart(2, '0')}:00`;
  }
  return '';
}

function parseRecipients(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function AlertsAdmin({ brands = [], defaultBrandKey = '' }) {
  const [form, setForm] = useState(() => buildInitialForm(defaultBrandKey));
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const brandOptions = useMemo(
    () => (Array.isArray(brands) ? brands : []).map((b) => ({
      label: b.name || b.displayName || b.key,
      value: b.key,
    })),
    [brands]
  );

  useEffect(() => {
    setForm((prev) => ({ ...prev, brand_key: prev.brand_key || defaultBrandKey || (brandOptions[0]?.value || '') }));
  }, [defaultBrandKey, brandOptions]);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAlerts();
    if (res.error) {
      const message = res.data?.error || 'Failed to load alerts';
      setError(message);
      toast.error(message);
      setAlerts([]);
    } else {
      const list = Array.isArray(res.data?.alerts) ? res.data.alerts : res.data?.alerts ?? [];
      setAlerts(Array.isArray(list) ? list : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleInputChange = (field) => (event) => {
    const value = event.target.type === 'number' ? event.target.value : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleActive = async (alert) => {
    const optimistic = !alert.is_active;
    setAlerts((prev) => prev.map((item) => (item.id === alert.id ? { ...item, is_active: optimistic ? 1 : 0 } : item)));
    const res = await setAlertActive(alert.id, optimistic);
    if (res.error) {
      const message = res.data?.error || 'Unable to update alert status';
      setError(message);
      toast.error(message);
      // revert on error
      setAlerts((prev) => prev.map((item) => (item.id === alert.id ? { ...item, is_active: alert.is_active } : item)));
      return;
    }
    toast.success(`Alert ${optimistic ? 'enabled' : 'disabled'}`);
  };

  const resetForm = useCallback(() => {
    setForm(buildInitialForm(defaultBrandKey || (brandOptions[0]?.value || '')));
    setError(null);
  }, [defaultBrandKey, brandOptions]);

  const fillFormForEdit = (alert) => {
    const deriveLookbackDays = () => {
      if (alert.lookback_days != null && alert.lookback_days !== '') {
        return Number(alert.lookback_days);
      }
      if (alert.lookback_start && alert.lookback_end) {
        const start = new Date(alert.lookback_start);
        const end = new Date(alert.lookback_end);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          const diffMs = end.getTime() - start.getTime();
          const diffDays = Math.floor(diffMs / 86400000) + 1;
          return diffDays > 0 ? diffDays : '';
        }
      }
      return '';
    };

    setForm({
      id: alert.id,
      name: alert.name || '',
      brand_key: alert.brand_key || alert.brand?.key || defaultBrandKey || '',
      metric_name: alert.metric_name || '',
      metric_type: alert.metric_type || 'base',
      formula: alert.formula || '',
      threshold_type: alert.threshold_type || 'absolute',
      threshold_value: alert.threshold_value ?? '',
      critical_threshold: alert.critical_threshold ?? '',
      severity: alert.severity || 'low',
      cooldown_minutes: alert.cooldown_minutes ?? 30,
      lookback_days: deriveLookbackDays(),
      quiet_hours_start: formatTimeValue(alert.quiet_hours_start),
      quiet_hours_end: formatTimeValue(alert.quiet_hours_end),
      recipients: Array.isArray(alert.recipients)
        ? alert.recipients.join(', ')
        : alert.recipient_emails || alert.recipients || '',
      is_active: Boolean(alert.is_active ?? true),
    });
    setError(null);
  };

  const buildPayload = () => {
    const lookbackDays = form.lookback_days === '' ? null : Number(form.lookback_days);

    const payload = {
      name: form.name?.trim() || null,
      brand_key: form.brand_key,
      metric_name: form.metric_name,
      metric_type: form.metric_type,
      formula: form.metric_type === 'derived' ? (form.formula?.trim() || null) : null,
      threshold_type: form.threshold_type,
      threshold_value: form.threshold_value === '' ? null : Number(form.threshold_value),
      critical_threshold: form.critical_threshold === '' ? null : Number(form.critical_threshold),
      severity: form.severity,
      cooldown_minutes: form.cooldown_minutes === '' ? null : Number(form.cooldown_minutes),
      lookback_start: null,
      lookback_end: null,
      lookback_days: lookbackDays,
      quiet_hours_start: form.quiet_hours_start || null,
      quiet_hours_end: form.quiet_hours_end || null,
      recipients: parseRecipients(form.recipients),
      is_active: form.is_active ? 1 : 0,
    };
    return payload;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = buildPayload();
    const hasId = Boolean(form.id);
    const res = hasId ? await updateAlert(form.id, payload) : await createAlert(payload);
    setSaving(false);
    if (res.error) {
      const message = res.data?.error || 'Unable to save alert';
      setError(message);
      toast.error(message);
      return;
    }
    toast.success(hasId ? 'Alert updated successfully' : 'Alert created successfully');
    resetForm();
    fetchAlerts();
  };

  const handleDelete = async (alert) => {
    if (!window.confirm(`Delete alert "${alert.name || alert.metric_name}"?`)) return;
    const res = await deleteAlert(alert.id);
    if (res.error) {
      const message = res.data?.error || 'Failed to delete alert';
      setError(message);
      toast.error(message);
      return;
    }
    toast.success('Alert deleted');
    fetchAlerts();
    if (form.id === alert.id) {
      resetForm();
    }
  };

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardHeader
          title={form.id ? 'Update Alert' : 'Create Alert'}
          subheader="Configure alert thresholds and delivery rules"
          action={form.id ? (
            <Button size="small" onClick={resetForm}>Clear</Button>
          ) : null}
        />
        <CardContent component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Alert Name"
                  value={form.name}
                  onChange={handleInputChange('name')}
                  fullWidth
                  placeholder="Optional friendly name"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small" disabled={!brandOptions.length}>
                  <InputLabel id="brand-select-label">Brand</InputLabel>
                  <Select
                    labelId="brand-select-label"
                    label="Brand"
                    value={form.brand_key}
                    onChange={handleInputChange('brand_key')}
                  >
                    {brandOptions.map((brand) => (
                      <MenuItem key={brand.value} value={brand.value}>
                        {brand.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="metric-select-label">Metric</InputLabel>
                  <Select
                    labelId="metric-select-label"
                    label="Metric"
                    value={form.metric_name}
                    onChange={handleInputChange('metric_name')}
                  >
                    {KPI_METRICS.map((metric) => (
                      <MenuItem key={metric.value} value={metric.value}>
                        {metric.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="metric-type-label">Metric Type</InputLabel>
                  <Select
                    labelId="metric-type-label"
                    label="Metric Type"
                    value={form.metric_type}
                    onChange={handleInputChange('metric_type')}
                  >
                    {METRIC_TYPES.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Derived Formula"
                  value={form.formula}
                  onChange={handleInputChange('formula')}
                  fullWidth
                  multiline
                  minRows={2}
                  disabled={form.metric_type !== 'derived'}
                  helperText="Provide a SQL expression only when using derived metrics."
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel id="threshold-type-label">Threshold Type</InputLabel>
                  <Select
                    labelId="threshold-type-label"
                    label="Threshold Type"
                    value={form.threshold_type}
                    onChange={handleInputChange('threshold_type')}
                  >
                    {THRESHOLD_TYPES.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  type="number"
                  label="Threshold Value"
                  value={form.threshold_value}
                  onChange={handleInputChange('threshold_value')}
                  fullWidth
                  inputProps={{ step: 'any' }}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  type="number"
                  label="Critical Value"
                  value={form.critical_threshold}
                  onChange={handleInputChange('critical_threshold')}
                  fullWidth
                  inputProps={{ step: 'any' }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel id="severity-label">Severity</InputLabel>
                  <Select
                    labelId="severity-label"
                    label="Severity"
                    value={form.severity}
                    onChange={handleInputChange('severity')}
                  >
                    {SEVERITY_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  type="number"
                  label="Cooldown (minutes)"
                  value={form.cooldown_minutes}
                  onChange={handleInputChange('cooldown_minutes')}
                  fullWidth
                  inputProps={{ min: 1 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Recipients"
                  value={form.recipients}
                  onChange={handleInputChange('recipients')}
                  fullWidth
                  placeholder="comma separated emails"
                />
              </Grid>
            </Grid>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Lookback Window</Typography>
              <TextField
                type="number"
                label="Lookback (days)"
                value={form.lookback_days}
                onChange={handleInputChange('lookback_days')}
                fullWidth
                inputProps={{ min: 1 }}
              />
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Quiet Hours (IST)</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Start Time"
                    type="time"
                    value={form.quiet_hours_start}
                    onChange={handleInputChange('quiet_hours_start')}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="End Time"
                    type="time"
                    value={form.quiet_hours_end}
                    onChange={handleInputChange('quiet_hours_end')}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </Box>

            <FormControlLabel
              control={(
                <Switch
                  checked={form.is_active}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
              )}
              label="Alert enabled"
            />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button type="submit" variant="contained" disabled={saving}>
                {form.id ? 'Update Alert' : 'Create Alert'}
              </Button>
              <Button variant="outlined" onClick={resetForm} disabled={saving}>
                Reset
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardHeader
          title="Configured Alerts"
          subheader="Manage alert status and thresholds"
          action={(
            <Tooltip title="Refresh list">
              <span>
                <IconButton onClick={fetchAlerts} disabled={loading}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        />
        <CardContent sx={{ pt: 0 }}>
          {alerts.length === 0 && !loading ? (
            <Typography variant="body2" color="text.secondary">
              No alerts configured yet.
            </Typography>
          ) : (
            <Box sx={{ width: '100%', overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 720, '& th': { fontWeight: 600 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Brand</TableCell>
                    <TableCell>Metric</TableCell>
                    <TableCell>Threshold</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id} hover>
                      <TableCell>{alert.name || '—'}</TableCell>
                      <TableCell>{alert.brand_key || alert.brand?.key || '—'}</TableCell>
                      <TableCell>{alert.metric_name}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {alert.threshold_type?.replace(/_/g, ' ')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Value: {alert.threshold_value ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={alert.severity} color={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={(
                            <Switch
                              size="small"
                              checked={Boolean(alert.is_active)}
                              onChange={() => handleToggleActive(alert)}
                            />
                          )}
                          label={alert.is_active ? 'Enabled' : 'Disabled'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => fillFormForEdit(alert)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => handleDelete(alert)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
