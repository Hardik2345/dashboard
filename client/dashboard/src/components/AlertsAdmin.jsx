import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  DialogTitle,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
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
import { GlassChip } from './ui/GlassChip.jsx';
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
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

// defined base metrics that cannot be derived
const BASE_METRICS = ['total_orders', 'total_sales', 'total_sessions', 'atc_sessions', 'performance'];

const THRESHOLD_TYPES = [
  { value: 'percentage_drop', label: 'Percentage Drop' },
  { value: 'percentage_rise', label: 'Percentage Rise' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'more_than', label: 'More Than' },
  { value: 'absolute', label: 'Absolute' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const MINIMUM_VOLUME_OPTIONS = [
  { value: 'total_orders', label: 'Total Orders' },
  { value: 'total_sessions', label: 'Total Sessions' },
  { value: 'total_atc_sessions', label: 'Total ATC Sessions' },
  { value: 'total_sales', label: 'Total Sales' },
];

// Quiet hours are stored/read as a plain hour integer (0-23) on the backend —
// minutes are never persisted, so the UI only offers hour-level precision.
const HOURS = Array.from({ length: 24 }, (_, idx) => String(idx).padStart(2, '0'));

function buildInitialForm(defaultBrand = '') {
  return {
    id: null,
    name: '',
    brand_key: defaultBrand,
    metric_name: '',
    metric_type: 'base',
    formula: '',
    threshold_type: 'percentage_drop',
    threshold_value: '',
    critical_threshold: '',
    severity: 'low',
    cooldown_minutes: '30',
    lookback_days: '1',
    have_recipients: 0,
    quiet_hours_start: '00:00',
    quiet_hours_end: '00:00',
    minimum_volume: {},
    minimum_volume_key: '',
    minimum_volume_value: '',
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

function normalizeMinimumVolume(raw) {
  if (!raw) return {};

  let entries = [];
  if (raw instanceof Map) {
    entries = [...raw.entries()];
  } else if (Array.isArray(raw)) {
    entries = raw
      .map((item) => {
        if (Array.isArray(item) && item.length >= 2) return [item[0], item[1]];
        if (item && typeof item === 'object' && 'key' in item) return [item.key, item.value];
        return null;
      })
      .filter(Boolean);
  } else if (typeof raw === 'object') {
    entries = Object.entries(raw);
  }

  const out = {};
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || !key) continue;
    const asNumber = Number(value);
    if (Number.isInteger(asNumber)) {
      out[key] = asNumber;
    }
  }
  return out;
}

function formatCondition(type, value) {
  if (value == null) return '—';
  switch (type) {
    case 'percentage_drop': return `Drops by ${value}%`;
    case 'percentage_rise': return `Rises by ${value}%`;
    case 'less_than': return `less than ${value}`;
    case 'greater_than':
    case 'more_than': return `more than ${value}`;
    case 'absolute': return `Absolute: ${value}`;
    default: return `${type?.replace(/_/g, ' ')} ${value}`;
  }
}

export default function AlertsAdmin({ brands = [], defaultBrandKey = '' }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Validation State
  const [validationErrors, setValidationErrors] = useState({});

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
  const [formDialogOpen, setFormDialogOpen] = useState(false);

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
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;

    // Logic for restricting metric type
    if (field === 'metric_name') {
      const isBase = BASE_METRICS.includes(value);
      const isPerformance = value === 'performance';

      setForm(prev => {
        const next = { ...prev, [field]: value };
        if (isBase) next.metric_type = 'base';

        // conversion_rate and AOV are the only two "computed" metrics — always
        // auto-set as derived with their fixed formula, never user-editable.
        if (value === 'conversion_rate') {
          next.metric_type = 'derived';
          next.formula = '(total_orders / total_sessions)*100';
        } else if (value === 'aov') {
          next.metric_type = 'derived';
          next.formula = 'total_sales / total_orders';
        }

        if (isPerformance) {
          next.threshold_type = 'greater_than';
          next.lookback_days = '';
        }
        return next;
      });
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }

    // Clear validation error for field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: undefined }));
    }
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
    setValidationErrors({});
  }, [defaultBrandKey, brandOptions]);

  const openCreateDialog = () => {
    resetForm();
    setFormDialogOpen(true);
  };

  const closeFormDialog = () => {
    setFormDialogOpen(false);
  };

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
      cooldown_minutes: String(alert.cooldown_minutes ?? 30),
      lookback_days: String(deriveLookbackDays() ?? ''),
      quiet_hours_start: formatTimeValue(alert.quiet_hours_start),
      quiet_hours_end: formatTimeValue(alert.quiet_hours_end),
      minimum_volume: normalizeMinimumVolume(alert.minimum_volume),
      minimum_volume_key: '',
      minimum_volume_value: '',
      have_recipients: alert.have_recipients ? 1 : 0,
      recipients: Array.isArray(alert.recipients) ? alert.recipients.join(', ') : '',
      is_active: Boolean(alert.is_active ?? true),
    });
    setValidationErrors({});
    setError(null);
    setFormDialogOpen(true);
  };

  const buildPayload = () => {
    const lookbackDays = form.lookback_days === '' ? null : Number(form.lookback_days);
    const minimumVolumeEntries = Object.entries(form.minimum_volume || {})
      .filter(([, value]) => Number.isInteger(Number(value)))
      .map(([key, value]) => [key, Number(value)]);
    const minimumVolume = minimumVolumeEntries.length ? Object.fromEntries(minimumVolumeEntries) : null;

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
      lookback_days: form.metric_name === 'performance' ? null : lookbackDays,
      is_dsl_engine_alert: false,
      trigger_mode: 'alert_system',
      quiet_hours_start: form.quiet_hours_start || null,
      quiet_hours_end: form.quiet_hours_end || null,
      minimum_volume: minimumVolume,
      have_recipients: form.have_recipients,
      recipients: form.have_recipients === 1 ? parseRecipients(form.recipients) : [],
      is_active: form.is_active ? 1 : 0,
    };
    return payload;
  };

  const validate = () => {
    const errors = {};
    if (!form.name?.trim()) errors.name = "Alert Name is required";
    if (!form.brand_key) errors.brand_key = "Brand is required";
    if (!form.metric_name) errors.metric_name = "Metric is required";
    if (form.metric_type === 'derived' && !form.formula?.trim()) {
      errors.formula = "Formula is required for derived metrics";
    }
    if (form.threshold_value === '' || form.threshold_value == null) {
      errors.threshold_value = "Threshold value is required";
    }
    if (form.threshold_type === 'less_than' && form.critical_threshold !== '' && form.critical_threshold !== null) {
      if (Number(form.critical_threshold) >= Number(form.threshold_value)) {
        errors.critical_threshold = "Critical threshold must be less than warning threshold";
      }
    }
    const invalidMinimumVolumeEntry = Object.entries(form.minimum_volume || {}).find(([, value]) => !Number.isInteger(Number(value)));
    if (invalidMinimumVolumeEntry) {
      errors.minimum_volume = 'Minimum volume values must be integers';
    }
    if (Number(form.have_recipients) === 1 && (!form.recipients || (Array.isArray(form.recipients) && form.recipients.length === 0))) {
      errors.recipients = "At least one recipient is required for custom recipients";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (!validate()) {
      toast.error("Please fix the errors in the form");
      return;
    }

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
    setFormDialogOpen(false);
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

  const addMinimumVolume = () => {
    const selectedKey = form.minimum_volume_key;
    const selectedValue = form.minimum_volume_value;

    if (!selectedKey) {
      setValidationErrors((prev) => ({ ...prev, minimum_volume: 'Select a minimum volume metric' }));
      return;
    }

    if (selectedValue === '' || !Number.isInteger(Number(selectedValue))) {
      setValidationErrors((prev) => ({ ...prev, minimum_volume: 'Minimum volume value must be an integer' }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      minimum_volume: {
        ...(prev.minimum_volume || {}),
        [selectedKey]: Number(selectedValue),
      },
      minimum_volume_key: '',
      minimum_volume_value: '',
    }));
    setValidationErrors((prev) => ({ ...prev, minimum_volume: undefined }));
  };

  const removeMinimumVolume = (key) => {
    setForm((prev) => {
      const next = { ...(prev.minimum_volume || {}) };
      delete next[key];
      return { ...prev, minimum_volume: next };
    });
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
        setFormDialogOpen(false);
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
      <Alert severity="warning" sx={{ borderRadius: 2 }}>
        Alert evaluation is not currently active — these rules are saved but are not being monitored against live
        metrics.
      </Alert>

      {/* Create / Edit Dialog */}
      <Dialog
        open={formDialogOpen}
        onClose={closeFormDialog}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { borderRadius: '20px', bgcolor: isDark ? '#1a1a1a' : '#fff' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {form.id ? 'Edit Alert Configuration' : 'New Alert Configuration'}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 400 }}>
            Define metric thresholds and notification rules for your brands
          </Typography>
        </DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 3, mt: 1, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3} sx={{ mt: 0.5 }}>

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
                error={!!validationErrors.name}
                helperText={validationErrors.name}
              />
            </Grid>
            <Grid item xs={12} md={6}>

              <FormControl fullWidth size="small" disabled={!brandOptions.length} error={!!validationErrors.brand_key}>
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
                {validationErrors.brand_key && <FormHelperText>{validationErrors.brand_key}</FormHelperText>}
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

              <FormControl fullWidth size="small" error={!!validationErrors.metric_name}>
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
                {validationErrors.metric_name && <FormHelperText>{validationErrors.metric_name}</FormHelperText>}
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              {form.metric_type === 'derived' && form.formula ? (
                <Box
                  sx={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    border: '1px dashed',
                    borderColor: 'divider',
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Computed automatically as <code>{form.formula}</code>
                  </Typography>
                </Box>
              ) : null}
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Condition</InputLabel>
                <Select
                  value={form.threshold_type}
                  onChange={handleInputChange('threshold_type')}
                  label="Condition"
                >
                  {THRESHOLD_TYPES.filter(opt => {
                    if (form.metric_name === 'performance') {
                      return ['greater_than', 'less_than'].includes(opt.value);
                    }
                    if (form.metric_name === 'conversion_rate') {
                      return !['greater_than', 'less_than'].includes(opt.value);
                    }
                    return true;
                  }).map((option) => (
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
                error={!!validationErrors.threshold_value}
                helperText={validationErrors.threshold_value}
                sx={{ '& input': { colorScheme: theme.palette.mode } }}
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
                error={!!validationErrors.critical_threshold}
                helperText={validationErrors.critical_threshold}
                sx={{ '& input': { colorScheme: theme.palette.mode } }}
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
                disabled={form.metric_name === 'performance'}
              />
            </Grid>

            <Grid item xs={12}>
              <FormHelperText error={!!validationErrors.minimum_volume} sx={{ mb: 1 }}>
                {validationErrors.minimum_volume || 'Minimum Volume (optional): add one or more metric thresholds'}
              </FormHelperText>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel>Minimum Volume Metric</InputLabel>
                  <Select
                    value={form.minimum_volume_key}
                    onChange={handleInputChange('minimum_volume_key')}
                    label="Minimum Volume Metric"
                  >
                    {MINIMUM_VOLUME_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  type="number"
                  size="small"
                  label="Minimum Volume Value"
                  value={form.minimum_volume_value}
                  onChange={handleInputChange('minimum_volume_value')}
                  inputProps={{ step: 1 }}
                  sx={{ minWidth: 220 }}
                />
                <Button variant="outlined" onClick={addMinimumVolume}>Add</Button>
              </Stack>

              {!!Object.keys(form.minimum_volume || {}).length && (
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {Object.entries(form.minimum_volume).map(([key, value]) => (
                    <Stack
                      key={key}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                    >
                      <TextField
                        size="small"
                        label="Metric"
                        value={MINIMUM_VOLUME_OPTIONS.find((opt) => opt.value === key)?.label || key}
                        disabled
                        sx={{ minWidth: 240 }}
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Value"
                        value={value}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setForm((prev) => ({
                            ...prev,
                            minimum_volume: {
                              ...(prev.minimum_volume || {}),
                              [key]: nextValue === '' ? '' : Number(nextValue),
                            },
                          }));
                        }}
                        inputProps={{ step: 1 }}
                        sx={{ minWidth: 180 }}
                      />
                      <Button color="error" onClick={() => removeMinimumVolume(key)}>
                        Remove
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Quiet Hours Start (IST)</InputLabel>
                <Select
                  label="Quiet Hours Start (IST)"
                  value={form.quiet_hours_start ? form.quiet_hours_start.split(':')[0] : '00'}
                  onChange={(e) => setForm(prev => ({ ...prev, quiet_hours_start: `${e.target.value}:00` }))}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 240 } } }}
                >
                  {HOURS.map(h => <MenuItem key={h} value={h}>{h}:00</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Quiet Hours End (IST)</InputLabel>
                <Select
                  label="Quiet Hours End (IST)"
                  value={form.quiet_hours_end ? form.quiet_hours_end.split(':')[0] : '00'}
                  onChange={(e) => setForm(prev => ({ ...prev, quiet_hours_end: `${e.target.value}:00` }))}
                  MenuProps={{ PaperProps: { sx: { maxHeight: 240 } } }}
                >
                  {HOURS.map(h => <MenuItem key={h} value={h}>{h}:00</MenuItem>)}
                </Select>
              </FormControl>
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
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Email Recipients
                </Typography>
                <RadioGroup
                  row
                  value={form.have_recipients}
                  onChange={(e) => setForm((prev) => ({ ...prev, have_recipients: Number(e.target.value) }))}
                  sx={{ mb: 1 }}
                >
                  <FormControlLabel value={0} control={<Radio size="small" />} label="Use Brand Default" />
                  <FormControlLabel value={1} control={<Radio size="small" />} label="Custom Recipients" />
                </RadioGroup>

                {Number(form.have_recipients) === 1 && (
                  <TextField
                    fullWidth
                    label="Recipients (comma separated emails)"
                    placeholder="e.g. dev@example.com, boss@example.com"
                    value={form.recipients}
                    onChange={handleInputChange('recipients')}
                    size="small"
                    helperText={validationErrors.recipients || "If specified, these will receive notifications instead of brand defaults."}
                    error={!!validationErrors.recipients}
                  />
                )}
              </Box>
            </Grid>

            {/* --- Enable --- */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
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
            </Grid>

          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeFormDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={saving}
            sx={{ px: 4, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' } }}
          >
            {form.id ? 'Save Changes' : 'Create Alert'}
          </Button>
        </DialogActions>
      </Dialog>

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
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title="Refresh List">
                <IconButton onClick={fetchAlerts} disabled={loading} size="small">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={<AddCircleOutlineIcon />}
                onClick={openCreateDialog}
                sx={{
                  borderRadius: '12px',
                  textTransform: 'none',
                  bgcolor: '#10b981',
                  '&:hover': { bgcolor: '#059669' },
                }}
              >
                Create Alert
              </Button>
            </Stack>
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
                            <GlassChip label={alert.brand_key || alert.brand?.key || 'All'} size="small" isDark={isDark} />
                            <GlassChip
                              label={alert.is_active ? 'Active' : 'Inactive'}
                              size="small"
                              color={alert.is_active ? 'success' : 'default'}
                              isDark={isDark}
                            />
                            <GlassChip
                              size="small"
                              label={alert.severity}
                              color={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'success'}
                              isDark={isDark}
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
                            {alert.updated_at && (
                              <GlassChip
                                label={`Updated ${dayjs(alert.updated_at).fromNow()}`}
                                size="small"
                                isDark={isDark}
                              />
                            )}
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
                              <GlassChip label={alert.brand_key || alert.brand?.key || 'All'} size="small" isDark={isDark} />
                            </TableCell>
                            <TableCell>{alert.metric_name}</TableCell>
                            <TableCell>
                              <GlassChip
                                label={formatCondition(alert.threshold_type, alert.threshold_value)}
                                size="small"
                                isDark={isDark}
                              />
                            </TableCell>
                            <TableCell>
                              <GlassChip
                                size="small"
                                label={alert.severity}
                                color={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'success'}
                                isDark={isDark}
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
