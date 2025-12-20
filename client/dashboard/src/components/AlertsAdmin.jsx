import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import SendIcon from "@mui/icons-material/Send";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import SearchIcon from "@mui/icons-material/Search";
import { KPI_METRICS } from "../constants/kpiMetrics.js";
import {
  createAlert,
  deleteAlert,
  listAlerts,
  setAlertActive,
  updateAlert,
} from "../lib/api.js";
import { toast } from "react-toastify";
import axios from "axios";

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

const HOURS = Array.from({ length: 24 }, (_, idx) => String(idx).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0'));

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

function formatCondition(type, value) {
  if (value == null) return '—';
  switch (type) {
    case 'percentage_drop': return `Drops by ${value}%`;
    case 'percentage_rise': return `Rises by ${value}%`;
    case 'less_than': return `< ${value}`;
    case 'more_than': return `> ${value}`;
    case 'absolute': return `Absolute: ${value}`;
    default: return `${type?.replace(/_/g, ' ')} ${value}`;
  }
}

export default function AlertsAdmin({ brands = [], defaultBrandKey = '' }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [form, setForm] = useState(() => buildInitialForm(defaultBrandKey));
  const [alerts, setAlerts] = useState([]);

  // ... existing loading/saving state ...
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [alertToDelete, setAlertToDelete] = useState(null);

  const brandOptions = useMemo(
    () => (Array.isArray(brands) ? brands : []).map((b) => ({
      label: b.name || b.displayName || b.key,
      value: b.key,
    })),
    [brands]
  );

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = alert.name?.toLowerCase().includes(query);
        const matchMetric = alert.metric_name?.toLowerCase().includes(query);
        if (!matchName && !matchMetric) return false;
      }

      // Brand Filter
      if (filterBrand !== 'all') {
        const brand = alert.brand_key || alert.brand?.key;
        if (brand !== filterBrand) return false;
      }

      // Severity Filter
      if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;

      // Status Filter
      if (filterStatus !== 'all') {
        const isActive = Boolean(alert.is_active);
        const wantActive = filterStatus === 'active';
        if (isActive !== wantActive) return false;
      }

      return true;
    });
  }, [alerts, searchQuery, filterBrand, filterSeverity, filterStatus]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, filterBrand, filterSeverity, filterStatus]);

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

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDelete = (alert) => {
    setAlertToDelete(alert);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!alertToDelete) return;

    // Close dialog immediately or wait? 
    // Let's keep it open or show loading state if we wanted, but for now simple correct flow:
    const res = await deleteAlert(alertToDelete.id);

    if (res.error) {
      const message = res.data?.error || 'Failed to delete alert';
      setError(message);
      toast.error(message);
      // We keep the dialog open? Or close it. 
      // Standard behavior: close it, show toast error.
    } else {
      toast.success('Alert deleted');
      fetchAlerts();
      if (form.id === alertToDelete.id) {
        resetForm();
      }
    }
    setDeleteDialogOpen(false);
    setAlertToDelete(null);
  };

  const SectionHeader = ({ icon, title, subtitle }) => (
    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ color: 'primary.main', display: 'flex' }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Stack spacing={4} sx={{ maxWidth: 1600, mx: 'auto' }}>
      {/* Create / Edit Section */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardHeader
          title={form.id ? 'Edit Alert Configuration' : 'New Alert Configuration'}
          subheader={
            <Typography variant="caption" color="text.secondary">
              Define metric thresholds and notification rules for your brands
            </Typography>
          }
          titleTypographyProps={{ variant: 'h6', fontWeight: 700 }}
          action={
            form.id && (
              <Button
                startIcon={<AddCircleOutlineIcon />}
                onClick={resetForm}
                size="small"
              >
                Create New
              </Button>
            )
          }
        />

        <CardContent sx={{ pt: 0 }} component="form" onSubmit={handleSubmit}>
          {error && (
            <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3}>

            {/* --- General Information --- */}
            <Grid item xs={12}>
              <SectionHeader
                icon={<InfoOutlinedIcon />}
                title="General Information"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Alert Name"
                value={form.name}
                onChange={handleInputChange('name')}
                fullWidth
                placeholder="e.g. High API Latency"
                variant="outlined"
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small" disabled={!brandOptions.length}>
                <InputLabel>Brand</InputLabel>
                <Select
                  value={form.brand_key}
                  onChange={handleInputChange('brand_key')}
                  label="Brand"
                >
                  {brandOptions.map((brand) => (
                    <MenuItem key={brand.value} value={brand.value}>{brand.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* --- Metric Logic --- */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <SectionHeader
                icon={<TuneIcon />}
                title="Metric Logic"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Metric</InputLabel>
                <Select
                  value={form.metric_name}
                  onChange={handleInputChange('metric_name')}
                  label="Metric"
                >
                  {KPI_METRICS.map((metric) => (
                    <MenuItem key={metric.value} value={metric.value}>{metric.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Logic Type</InputLabel>
                <Select
                  value={form.metric_type}
                  onChange={handleInputChange('metric_type')}
                  label="Logic Type"
                >
                  {METRIC_TYPES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {form.metric_type === 'derived' && (
              <Grid item xs={12}>
                <TextField
                  label="Derived Formula (SQL)"
                  value={form.formula}
                  onChange={handleInputChange('formula')}
                  fullWidth
                  multiline
                  minRows={2}
                  helperText="Example: (sales / visits) * 100"
                  sx={{ '& .MuiOutlinedInput-root': { fontFamily: 'monospace' } }}
                />
              </Grid>
            )}

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Condition</InputLabel>
                <Select
                  value={form.threshold_type}
                  onChange={handleInputChange('threshold_type')}
                  label="Condition"
                >
                  {THRESHOLD_TYPES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {/* Spacer for alignment if needed, or let thresholds wrap */}
            <Grid item xs={12} md={6}></Grid>

            <Grid item xs={12} md={6}>
              <TextField
                type="number"
                label="Warning Threshold"
                value={form.threshold_value}
                onChange={handleInputChange('threshold_value')}
                fullWidth
                size="small"
                inputProps={{ step: 'any' }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">Val</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                type="number"
                label="Critical Threshold"
                value={form.critical_threshold}
                onChange={handleInputChange('critical_threshold')}
                fullWidth
                size="small"
                color="error"
                inputProps={{ step: 'any' }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">Val</InputAdornment>,
                }}
              />
            </Grid>

            {/* --- Timing --- */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <SectionHeader
                icon={<AccessTimeIcon />}
                title="Timing & Constraints"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                type="number"
                label="Cooldown (minutes)"
                value={form.cooldown_minutes}
                onChange={handleInputChange('cooldown_minutes')}
                fullWidth
                size="small"
                helperText="Min wait between alerts"
                sx={{ '& input': { colorScheme: theme.palette.mode } }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                type="number"
                label="Lookback Window (days)"
                value={form.lookback_days}
                onChange={handleInputChange('lookback_days')}
                fullWidth
                size="small"
                helperText="Data range to analyze"
                sx={{ '& input': { colorScheme: theme.palette.mode } }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Quiet Hours Start (IST)
                </Typography>
                <Stack direction="row" spacing={1}>
                  <FormControl fullWidth size="small">
                    <Select
                      value={form.quiet_hours_start ? form.quiet_hours_start.split(':')[0] : '00'}
                      onChange={(e) => {
                        const mm = form.quiet_hours_start ? form.quiet_hours_start.split(':')[1] : '00';
                        setForm(prev => ({ ...prev, quiet_hours_start: `${e.target.value}:${mm}` }));
                      }}
                      MenuProps={{ PaperProps: { sx: { maxHeight: 200 } } }}
                    >
                      {HOURS.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Typography sx={{ alignSelf: 'center' }}>:</Typography>
                  <FormControl fullWidth size="small">
                    <Select
                      value={form.quiet_hours_start ? form.quiet_hours_start.split(':')[1] : '00'}
                      onChange={(e) => {
                        const hh = form.quiet_hours_start ? form.quiet_hours_start.split(':')[0] : '00';
                        setForm(prev => ({ ...prev, quiet_hours_start: `${hh}:${e.target.value}` }));
                      }}
                      MenuProps={{ PaperProps: { sx: { maxHeight: 200 } } }}
                    >
                      {MINUTES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Stack>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Quiet Hours End (IST)
                </Typography>
                <Stack direction="row" spacing={1}>
                  <FormControl fullWidth size="small">
                    <Select
                      value={form.quiet_hours_end ? form.quiet_hours_end.split(':')[0] : '00'}
                      onChange={(e) => {
                        const mm = form.quiet_hours_end ? form.quiet_hours_end.split(':')[1] : '00';
                        setForm(prev => ({ ...prev, quiet_hours_end: `${e.target.value}:${mm}` }));
                      }}
                      MenuProps={{ PaperProps: { sx: { maxHeight: 200 } } }}
                    >
                      {HOURS.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Typography sx={{ alignSelf: 'center' }}>:</Typography>
                  <FormControl fullWidth size="small">
                    <Select
                      value={form.quiet_hours_end ? form.quiet_hours_end.split(':')[1] : '00'}
                      onChange={(e) => {
                        const hh = form.quiet_hours_end ? form.quiet_hours_end.split(':')[0] : '00';
                        setForm(prev => ({ ...prev, quiet_hours_end: `${hh}:${e.target.value}` }));
                      }}
                      MenuProps={{ PaperProps: { sx: { maxHeight: 200 } } }}
                    >
                      {MINUTES.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Stack>
              </Box>
            </Grid>

            {/* --- Delivery --- */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <SectionHeader
                icon={<NotificationsActiveIcon />}
                title="Delivery"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Severity Level</InputLabel>
                <Select
                  value={form.severity}
                  onChange={handleInputChange('severity')}
                  label="Severity Level"
                >
                  {SEVERITY_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{
                          width: 8, height: 8, borderRadius: '50%',
                          bgcolor: option.value === 'high' ? 'error.main' : option.value === 'medium' ? 'warning.main' : 'info.main'
                        }} />
                        {option.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Recipients"
                value={form.recipients}
                onChange={handleInputChange('recipients')}
                fullWidth
                multiline
                minRows={1}
                placeholder="email@example.com, ..."
                helperText="Comma separated list"
                size="small"
              />
            </Grid>

            {/* --- Actions --- */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" justifyContent="flex-end" spacing={2} alignItems="center">
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.is_active}
                      onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                      color="success"
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight={600}>
                      Enable Alert
                    </Typography>
                  }
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={saving}
                  sx={{ px: 4 }}
                >
                  {form.id ? 'Save Changes' : 'Create Alert'}
                </Button>
              </Stack>
            </Grid>

          </Grid>
        </CardContent>
      </Card>

      {/* List Section */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <CardHeader
          title="Configured Alerts"
          subheader={
            <Typography variant="caption" color="text.secondary">
              Includes all active and inactive alerts
            </Typography>
          }
          titleTypographyProps={{ variant: 'h6', fontWeight: 700 }}
          action={
            <Tooltip title="Refresh List">
              <IconButton onClick={fetchAlerts} disabled={loading} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          }
        />

        <CardContent sx={{ p: 0 }}>
          {/* Filters Bar */}
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.neutral' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  placeholder="Search alerts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="small"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" color="action" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <Select
                    value={filterBrand}
                    onChange={(e) => setFilterBrand(e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value="all"><em>All Brands</em></MenuItem>
                    {brandOptions.map((b) => (
                      <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <Select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value="all"><em>Any Severity</em></MenuItem>
                    {SEVERITY_OPTIONS.map((s) => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value="all"><em>Any Status</em></MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>

          {alerts.length === 0 && !loading ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No alerts configured yet.
              </Typography>
            </Box>
          ) : filteredAlerts.length === 0 && !loading ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No alerts match your search/filters.
              </Typography>
            </Box>
          ) : (
            <>
              {isMobile ? (
                <Stack spacing={0} divider={<Divider />}>
                  {filteredAlerts
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((alert) => (
                      <Box key={alert.id} sx={{ p: 3, '&:hover': { bgcolor: 'action.hover' } }}>
                        <Stack spacing={2}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                              <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '1rem' }}>
                                {alert.name || '—'}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {alert.metric_name}
                              </Typography>
                            </Box>
                            <Switch
                              size="small"
                              checked={Boolean(alert.is_active)}
                              onChange={() => handleToggleActive(alert)}
                              color="success"
                            />
                          </Box>

                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            <Chip label={alert.brand_key || alert.brand?.key || 'All'} size="small" variant="outlined" />
                            <Chip
                              label={formatCondition(alert.threshold_type, alert.threshold_value)}
                              size="small"
                              sx={{ fontWeight: 500, bgcolor: 'action.hover' }}
                            />
                            <Chip
                              size="small"
                              label={alert.severity}
                              color={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'success'}
                              sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                            />
                          </Box>

                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                              startIcon={<EditIcon />}
                              size="small"
                              variant="outlined"
                              color="primary"
                              onClick={() => fillFormForEdit(alert)}
                              sx={{ borderRadius: 2 }}
                            >
                              Edit
                            </Button>
                            <Button
                              startIcon={<DeleteIcon />}
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleDelete(alert)}
                              sx={{ borderRadius: 2 }}
                            >
                              Delete
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                </Stack>
              ) : (
                <TableContainer sx={{ maxHeight: 600 }}>
                  <Table stickyHeader sx={{ minWidth: 720 }}>
                    <TableHead>
                      <TableRow>
                        {['Name', 'Brand', 'Metric', 'Condition', 'Severity', 'Status', 'Actions'].map((head) => (
                          <TableCell key={head} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {head}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredAlerts
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((alert) => (
                          <TableRow key={alert.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                            <TableCell sx={{ fontWeight: 600 }}>{alert.name || '—'}</TableCell>
                            <TableCell>
                              <Chip label={alert.brand_key || alert.brand?.key || 'All'} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>{alert.metric_name}</TableCell>
                            <TableCell>
                              <Chip
                                label={formatCondition(alert.threshold_type, alert.threshold_value)}
                                size="small"
                                sx={{
                                  fontWeight: 500,
                                  bgcolor: 'action.hover',
                                  borderRadius: '6px',
                                  '& .MuiChip-label': { px: 1.5 }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={alert.severity}
                                color={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'success'}
                                sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                              />
                            </TableCell>
                            <TableCell>
                              <Switch
                                size="small"
                                checked={Boolean(alert.is_active)}
                                onChange={() => handleToggleActive(alert)}
                                color="success"
                              />
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title="Edit">
                                  <IconButton size="small" onClick={() => fillFormForEdit(alert)} color="primary">
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton size="small" onClick={() => handleDelete(alert)} color="error">
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <TablePagination
                component="div"
                count={filteredAlerts.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[10, 25, 50]}
                sx={{
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  '& .MuiTablePagination-toolbar': {
                    justifyContent: 'center',
                    pl: 0, // Remove default padding-left if needed for perfect centering
                  },
                  '& .MuiTablePagination-spacer': {
                    display: 'none',
                  },
                  '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                    mb: 0,
                  }
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="delete-dialog-title"
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle id="delete-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" />
          Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the alert <strong>{alertToDelete?.name || alertToDelete?.metric_name}</strong>?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack >
  );
}
