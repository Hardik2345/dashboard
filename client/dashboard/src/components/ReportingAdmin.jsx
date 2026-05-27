import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  DeleteOutline,
  BarChart,
  Description,
  Groups,
  PlayArrow,
  Preview,
  Refresh,
  Send,
  ShoppingCart,
  Smartphone,
  TouchApp,
  TrackChanges,
  AutoAwesome,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import dayjs from "dayjs";
import {
  approveReportRun,
  createLoggedTask,
  createReportDefinition,
  createTaskCategory,
  deleteLoggedTask,
  deleteTaskCategory,
  listLoggedTasks,
  listReportDefinitions,
  listReportRuns,
  listTaskCategories,
  pauseReportDefinition,
  previewReportDefinition,
  rejectReportRun,
  resendReportRun,
  resumeReportDefinition,
  runReportNow,
  updateReportDefinition,
} from "../lib/api.js";

const KPI_OPTIONS = [
  { key: "total_orders", label: "Total Orders", format: "number" },
  { key: "gross_revenue", label: "Gross Revenue", format: "currency" },
  { key: "average_order_value", label: "Average Order Value", format: "currency" },
  { key: "total_sessions", label: "Total Sessions", format: "number" },
  { key: "atc_rate", label: "ATC Rate", format: "percent" },
  { key: "conversion_rate", label: "Conversion Rate", format: "percent" },
];

const CATEGORY_ICON_OPTIONS = [
  { value: "cursor", label: "Cursor", Icon: TouchApp },
  { value: "smartphone", label: "Mobile", Icon: Smartphone },
  { value: "sparkles", label: "Polish", Icon: AutoAwesome },
  { value: "file-text", label: "Content", Icon: Description },
  { value: "bar-chart", label: "Analytics", Icon: BarChart },
  { value: "shopping-cart", label: "Cart", Icon: ShoppingCart },
  { value: "target", label: "Target", Icon: TrackChanges },
  { value: "users", label: "Users", Icon: Groups },
];

const CATEGORY_COLOR_OPTIONS = [
  "#84cc16",
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#64748b",
  "#ec4899",
];

function CategoryIcon({ icon = "cursor", color = "#84cc16", size = 18 }) {
  const option =
    CATEGORY_ICON_OPTIONS.find((item) => item.value === icon) ||
    CATEGORY_ICON_OPTIONS[0];
  const Icon = option.Icon;
  return <Icon sx={{ fontSize: size, color }} />;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.slice(1) : "84cc16";
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsv({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function hsvToHex(hsv) {
  return rgbToHex(hsvToRgb(hsv));
}

function CategoryColorPicker({ value, onChange }) {
  const activeColor = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#84cc16";
  const hsv = rgbToHsv(hexToRgb(activeColor));
  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  const updateFromPanel = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    onChange(hsvToHex({ h: hsv.h, s: x / rect.width, v: 1 - y / rect.height }));
  };

  const handleHexChange = (event) => {
    const raw = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
    if (raw.length === 6) onChange(`#${raw}`.toUpperCase());
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        bgcolor: "background.paper",
      }}
    >
      <Stack spacing={1.25}>
        <Box
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            updateFromPanel(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) updateFromPanel(event);
          }}
          sx={{
            position: "relative",
            height: 150,
            borderRadius: 1.5,
            cursor: "crosshair",
            overflow: "hidden",
            bgcolor: pureHue,
            backgroundImage:
              "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          />
        </Box>
        <Box
          component="input"
          type="range"
          min={0}
          max={359}
          value={Math.round(hsv.h)}
          onChange={(event) =>
            onChange(hsvToHex({ h: Number(event.target.value), s: hsv.s, v: hsv.v }))
          }
          sx={{
            width: "100%",
            height: 12,
            m: 0,
            accentColor: pureHue,
            cursor: "pointer",
          }}
          aria-label="Hue"
        />
        <Box
          component="input"
          type="range"
          min={100}
          max={100}
          value={100}
          readOnly
          sx={{
            width: "100%",
            height: 12,
            m: 0,
            cursor: "not-allowed",
            accentColor: activeColor,
          }}
          aria-label="Opacity fixed at 100 percent"
        />
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label="Hex" size="small" variant="outlined" sx={{ minWidth: 58 }} />
          <TextField
            size="small"
            value={activeColor.slice(1)}
            onChange={handleHexChange}
            inputProps={{ maxLength: 6 }}
            InputProps={{
              startAdornment: <Typography color="text.secondary" sx={{ mr: 0.5 }}>#</Typography>,
            }}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            value="100%"
            inputProps={{ readOnly: true }}
            sx={{ width: 82 }}
          />
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Saved colors
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {activeColor}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {CATEGORY_COLOR_OPTIONS.map((color) => (
            <Tooltip title={color} key={color}>
              <IconButton
                size="small"
                onClick={() => onChange(color)}
                sx={{
                  width: 30,
                  height: 30,
                  border: "2px solid",
                  borderColor: activeColor.toLowerCase() === color.toLowerCase() ? "primary.main" : "transparent",
                  bgcolor: color,
                  boxShadow: activeColor.toLowerCase() === color.toLowerCase() ? "0 0 0 2px rgba(255,255,255,0.8)" : "none",
                  "&:hover": { bgcolor: color, opacity: 0.85 },
                }}
                aria-label={`Use ${color}`}
              />
            </Tooltip>
          ))}
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              bgcolor: activeColor,
              border: "1px solid",
              borderColor: "divider",
            }}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}

function buildDefaultDefinition() {
  return {
    id: null,
    name: "Weekly Digest",
    status: "active",
    report_type: "digest",
    template_key: "weekly_digest_v1",
    period: {
      type: "week",
      timezone: "Asia/Kolkata",
      week_starts_on: "monday",
      custom_days: null,
    },
    schedule: {
      enabled: true,
      cron: "0 9 * * MON",
      timezone: "Asia/Kolkata",
    },
    kpis: KPI_OPTIONS.map((kpi, index) => ({
      ...kpi,
      enabled: true,
      order: index + 1,
      comparison: "previous_period",
      visualization: "card",
    })),
    sections: {
      datum_insights: { enabled: true, mode: "deterministic", max_items: 3 },
      focus_summary: { enabled: true, mode: "deterministic", max_items: 5 },
    },
    ai: {
      enabled: false,
      provider: "openai",
      model: "",
      fallback_on_error: true,
      datum_prompt_version: "datum_insights_v1",
      focus_prompt_version: "focus_summary_v1",
    },
    approval: {
      required: true,
      approver_user_ids: [],
      approver_emails: [],
      expires_after_hours: 72,
    },
    recipients: {
      to: [],
      cc: [],
      bcc: [],
      tenant_default_contacts: true,
    },
  };
}

function csvToArray(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToCsv(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function normalizeDefinition(doc) {
  const defaults = buildDefaultDefinition();
  if (!doc) return defaults;
  return {
    ...defaults,
    ...doc,
    id: doc._id || doc.id || null,
    period: { ...defaults.period, ...(doc.period || {}) },
    schedule: { ...defaults.schedule, ...(doc.schedule || {}) },
    sections: {
      datum_insights: {
        ...defaults.sections.datum_insights,
        ...(doc.sections?.datum_insights || {}),
      },
      focus_summary: {
        ...defaults.sections.focus_summary,
        ...(doc.sections?.focus_summary || {}),
      },
    },
    ai: { ...defaults.ai, ...(doc.ai || {}) },
    approval: { ...defaults.approval, ...(doc.approval || {}) },
    recipients: { ...defaults.recipients, ...(doc.recipients || {}) },
    kpis: KPI_OPTIONS.map((option, index) => {
      const existing = (doc.kpis || []).find((item) => item.key === option.key);
      return {
        ...option,
        enabled: existing?.enabled ?? false,
        label: existing?.label || option.label,
        order: existing?.order ?? index + 1,
        format: existing?.format || option.format,
        comparison: "previous_period",
        visualization: "card",
      };
    }).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
  };
}

function definitionPayload(form) {
  return {
    name: form.name,
    status: form.status,
    report_type: "digest",
    template_key: form.template_key || "weekly_digest_v1",
    period: {
      ...form.period,
      custom_days:
        form.period.type === "custom" ? Number(form.period.custom_days || 7) : null,
    },
    schedule: form.schedule,
    kpis: form.kpis.map((kpi, index) => ({
      key: kpi.key,
      label: kpi.label,
      enabled: Boolean(kpi.enabled),
      order: index + 1,
      format: kpi.format,
      comparison: "previous_period",
      visualization: "card",
    })),
    sections: form.sections,
    ai: {
      ...form.ai,
      model: form.ai.model || null,
    },
    approval: form.approval,
    recipients: form.recipients,
  };
}

function statusColor(status) {
  if (status === "sent" || status === "active" || status === "approved") return "success";
  if (status === "failed" || status === "rejected") return "error";
  if (status === "pending_approval" || status === "generating") return "warning";
  return "default";
}

export default function ReportingAdmin({ defaultBrandKey = "" }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [tab, setTab] = useState("definitions");
  const [definitions, setDefinitions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(buildDefaultDefinition);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    color: "#84cc16",
    icon: "cursor",
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    category_id: "",
    impact_level: "medium",
    tags: "",
    task_date: dayjs().format("YYYY-MM-DD"),
  });

  const selectedDefinition = useMemo(
    () => definitions.find((definition) => (definition._id || definition.id) === form.id),
    [definitions, form.id],
  );
  const activeCategories = useMemo(
    () => categories.filter((category) => category.status !== "archived"),
    [categories],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [definitionRes, runRes, categoryRes, taskRes] = await Promise.all([
      listReportDefinitions(),
      listReportRuns(),
      listTaskCategories(),
      listLoggedTasks(),
    ]);
    if (!definitionRes.error) {
      const rows = definitionRes.data?.data || [];
      setDefinitions(rows);
      setForm((current) => current.id ? current : normalizeDefinition(rows[0]));
    }
    if (!runRes.error) setRuns(runRes.data?.data || []);
    if (!categoryRes.error) setCategories(categoryRes.data?.data || []);
    if (!taskRes.error) setTasks(taskRes.data?.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const updateForm = (path, value) => {
    setForm((current) => {
      const next = structuredClone(current);
      let cursor = next;
      for (let i = 0; i < path.length - 1; i += 1) cursor = cursor[path[i]];
      cursor[path[path.length - 1]] = value;
      return next;
    });
  };

  const moveKpi = (index, delta) => {
    setForm((current) => {
      const next = structuredClone(current);
      const target = index + delta;
      if (target < 0 || target >= next.kpis.length) return current;
      const [item] = next.kpis.splice(index, 1);
      next.kpis.splice(target, 0, item);
      next.kpis = next.kpis.map((kpi, idx) => ({ ...kpi, order: idx + 1 }));
      return next;
    });
  };

  const handleSaveDefinition = async () => {
    setSaving(true);
    const payload = definitionPayload(form);
    const result = form.id
      ? await updateReportDefinition(form.id, payload)
      : await createReportDefinition(payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.data?.error || "Could not save report configuration");
      return;
    }
    toast.success("Report configuration saved");
    await loadAll();
    setForm(normalizeDefinition(result.data?.data));
  };

  const handleRunNow = async () => {
    if (!form.id) return;
    setSaving(true);
    const result = await runReportNow(form.id);
    setSaving(false);
    if (result.error) toast.error(result.data?.error || "Could not start report run");
    else {
      toast.success("Report run started");
      await loadAll();
    }
  };

  const handlePreview = async () => {
    if (!form.id) {
      toast.info("Save the report before previewing it");
      return;
    }
    setSaving(true);
    const result = await previewReportDefinition(form.id);
    setSaving(false);
    if (result.error) {
      toast.error(result.data?.error || "Could not generate preview");
      return;
    }
    setPreviewHtml(result.data?.data?.snapshot?.html || "");
    setPreviewOpen(true);
  };

  const handleToggleDefinition = async (definition) => {
    const id = definition._id || definition.id;
    const result = definition.status === "active"
      ? await pauseReportDefinition(id)
      : await resumeReportDefinition(id);
    if (result.error) toast.error("Could not update report status");
    else {
      toast.success(definition.status === "active" ? "Report paused" : "Report resumed");
      await loadAll();
    }
  };

  const handleAddCategory = async () => {
    if (!categoryForm.name.trim()) return;
    const result = await createTaskCategory(categoryForm);
    if (result.error) toast.error(result.data?.error || "Could not add category");
    else {
      toast.success("Category added");
      setCategoryForm({ name: "", color: "#84cc16", icon: "cursor" });
      await loadAll();
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete?._id) return;
    const result = await deleteTaskCategory(categoryToDelete._id);
    if (result.error) toast.error("Could not archive category");
    else {
      toast.success("Category deleted");
      setCategoryToDelete(null);
      await loadAll();
    }
  };

  const handleAddTask = async () => {
    if (!taskForm.title.trim()) return;
    const result = await createLoggedTask({
      title: taskForm.title,
      description: taskForm.description,
      category_id: taskForm.category_id || null,
      impact_level: taskForm.impact_level,
      tags: csvToArray(taskForm.tags),
      task_date: taskForm.task_date,
    });
    if (result.error) toast.error(result.data?.error || "Could not log task");
    else {
      toast.success("Task logged");
      setTaskForm({
        title: "",
        description: "",
        category_id: "",
        impact_level: "medium",
        tags: "",
        task_date: dayjs().format("YYYY-MM-DD"),
      });
      await loadAll();
    }
  };

  const handleDeleteTask = async (id) => {
    const result = await deleteLoggedTask(id);
    if (result.error) toast.error("Could not delete task");
    else {
      toast.success("Task deleted");
      await loadAll();
    }
  };

  const handleRunAction = async (run, action) => {
    const id = run._id || run.id;
    const fn = {
      approve: () => approveReportRun(id),
      reject: () => rejectReportRun(id, "Rejected from dashboard"),
      resend: () => resendReportRun(id),
    }[action];
    if (!fn) return;
    const result = await fn();
    if (result.error) toast.error(result.data?.error || "Could not update report run");
    else {
      toast.success("Report run updated");
      await loadAll();
    }
  };

  const renderHeader = () => (
    <Stack
      direction={{ xs: "column", md: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "stretch", md: "center" }}
      spacing={1.5}
    >
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: 0 }}>
          Reporting
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure scheduled tenant digests, task focus logs, approvals, and dispatch.
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        {defaultBrandKey && <Chip size="small" label={defaultBrandKey} />}
        <Tooltip title="Refresh">
          <IconButton onClick={loadAll} disabled={loading}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );

  const renderDefinitionEditor = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Report definitions
              </Typography>
              <Button size="small" startIcon={<Add />} onClick={() => setForm(buildDefaultDefinition())}>
                New
              </Button>
            </Stack>
            <Stack spacing={1}>
              {definitions.map((definition) => {
                const id = definition._id || definition.id;
                const active = id === form.id;
                return (
                  <Button
                    key={id}
                    variant={active ? "contained" : "outlined"}
                    color={active ? "inherit" : "primary"}
                    onClick={() => setForm(normalizeDefinition(definition))}
                    sx={{ justifyContent: "space-between", textTransform: "none", borderRadius: 2 }}
                  >
                    <span>{definition.name}</span>
                    <Chip size="small" label={definition.status} color={statusColor(definition.status)} />
                  </Button>
                );
              })}
              {!definitions.length && (
                <Typography variant="body2" color="text.secondary">
                  No report definitions yet.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Grid>

      <Grid item xs={12} md={8}>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  label="Report name"
                  value={form.name}
                  onChange={(event) => updateForm(["name"], event.target.value)}
                  fullWidth
                  size="small"
                />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    label="Status"
                    value={form.status}
                    onChange={(event) => updateForm(["status"], event.target.value)}
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="paused">Paused</MenuItem>
                    <MenuItem value="archived">Archived</MenuItem>
                  </Select>
                </FormControl>
              </Stack>

              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Period</InputLabel>
                    <Select
                      label="Period"
                      value={form.period.type}
                      onChange={(event) => updateForm(["period", "type"], event.target.value)}
                    >
                      <MenuItem value="week">Week</MenuItem>
                      <MenuItem value="month">Month</MenuItem>
                      <MenuItem value="quarter">Quarter</MenuItem>
                      <MenuItem value="custom">Custom days</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Timezone"
                    size="small"
                    fullWidth
                    value={form.period.timezone}
                    onChange={(event) => updateForm(["period", "timezone"], event.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Custom days"
                    size="small"
                    fullWidth
                    type="number"
                    disabled={form.period.type !== "custom"}
                    value={form.period.custom_days || ""}
                    onChange={(event) => updateForm(["period", "custom_days"], event.target.value)}
                  />
                </Grid>
              </Grid>

              <Divider />

              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.schedule.enabled}
                        onChange={(event) => updateForm(["schedule", "enabled"], event.target.checked)}
                      />
                    }
                    label="Scheduled"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Cron"
                    size="small"
                    fullWidth
                    disabled={!form.schedule.enabled}
                    value={form.schedule.cron}
                    onChange={(event) => updateForm(["schedule", "cron"], event.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Schedule timezone"
                    size="small"
                    fullWidth
                    disabled={!form.schedule.enabled}
                    value={form.schedule.timezone}
                    onChange={(event) => updateForm(["schedule", "timezone"], event.target.value)}
                  />
                </Grid>
              </Grid>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                KPI cards
              </Typography>
              {form.kpis.map((kpi, index) => (
                <Stack
                  key={kpi.key}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  sx={{ p: 1, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={kpi.enabled}
                        onChange={(event) => {
                          const next = structuredClone(form.kpis);
                          next[index].enabled = event.target.checked;
                          updateForm(["kpis"], next);
                        }}
                      />
                    }
                    label={kpi.key}
                    sx={{ minWidth: 210 }}
                  />
                  <TextField
                    label="Label"
                    size="small"
                    value={kpi.label}
                    onChange={(event) => {
                      const next = structuredClone(form.kpis);
                      next[index].label = event.target.value;
                      updateForm(["kpis"], next);
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Tooltip title="Move up">
                    <span>
                      <IconButton size="small" disabled={index === 0} onClick={() => moveKpi(index, -1)}>
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton size="small" disabled={index === form.kpis.length - 1} onClick={() => moveKpi(index, 1)}>
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Sections and AI
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.sections.datum_insights.enabled}
                        onChange={(event) => updateForm(["sections", "datum_insights", "enabled"], event.target.checked)}
                      />
                    }
                    label="Datum Insights"
                  />
                  <FormControl size="small">
                    <InputLabel>Datum mode</InputLabel>
                    <Select
                      label="Datum mode"
                      value={form.sections.datum_insights.mode}
                      onChange={(event) => updateForm(["sections", "datum_insights", "mode"], event.target.value)}
                    >
                      <MenuItem value="deterministic">Deterministic</MenuItem>
                      <MenuItem value="ai_assisted">AI assisted</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.sections.focus_summary.enabled}
                        onChange={(event) => updateForm(["sections", "focus_summary", "enabled"], event.target.checked)}
                      />
                    }
                    label="What we focused on"
                  />
                  <FormControl size="small">
                    <InputLabel>Focus mode</InputLabel>
                    <Select
                      label="Focus mode"
                      value={form.sections.focus_summary.mode}
                      onChange={(event) => updateForm(["sections", "focus_summary", "mode"], event.target.value)}
                    >
                      <MenuItem value="deterministic">Deterministic</MenuItem>
                      <MenuItem value="ai_assisted">AI assisted</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.5}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.ai.enabled}
                        onChange={(event) => updateForm(["ai", "enabled"], event.target.checked)}
                      />
                    }
                    label="Enable AI dependency"
                  />
                  <TextField
                    label="AI model"
                    size="small"
                    value={form.ai.model || ""}
                    onChange={(event) => updateForm(["ai", "model"], event.target.value)}
                    disabled={!form.ai.enabled}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.ai.fallback_on_error}
                        onChange={(event) => updateForm(["ai", "fallback_on_error"], event.target.checked)}
                      />
                    }
                    label="Fallback on AI error"
                  />
                </Stack>
              </Grid>
            </Grid>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Approval
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.approval.required}
                        onChange={(event) => updateForm(["approval", "required"], event.target.checked)}
                      />
                    }
                    label="Require manual approval"
                  />
                  <TextField
                    label="Approver emails"
                    size="small"
                    value={arrayToCsv(form.approval.approver_emails)}
                    onChange={(event) => updateForm(["approval", "approver_emails"], csvToArray(event.target.value))}
                    placeholder="ops@example.com, owner@example.com"
                  />
                  <TextField
                    label="Approval expires after hours"
                    size="small"
                    type="number"
                    value={form.approval.expires_after_hours}
                    onChange={(event) => updateForm(["approval", "expires_after_hours"], Number(event.target.value || 72))}
                  />
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Recipients
                  </Typography>
                  <TextField
                    label="To"
                    size="small"
                    value={arrayToCsv(form.recipients.to)}
                    onChange={(event) => updateForm(["recipients", "to"], csvToArray(event.target.value))}
                    placeholder="tenant@example.com"
                  />
                  <TextField
                    label="CC"
                    size="small"
                    value={arrayToCsv(form.recipients.cc)}
                    onChange={(event) => updateForm(["recipients", "cc"], csvToArray(event.target.value))}
                  />
                  <TextField
                    label="BCC"
                    size="small"
                    value={arrayToCsv(form.recipients.bcc)}
                    onChange={(event) => updateForm(["recipients", "bcc"], csvToArray(event.target.value))}
                  />
                </Stack>
              </Grid>
            </Grid>
          </Paper>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="flex-end">
            {selectedDefinition && (
              <Button variant="outlined" onClick={() => handleToggleDefinition(selectedDefinition)}>
                {selectedDefinition.status === "active" ? "Pause" : "Resume"}
              </Button>
            )}
            <Button variant="outlined" startIcon={<Preview />} onClick={handlePreview} disabled={saving || !form.id}>
              Preview
            </Button>
            <Button variant="outlined" startIcon={<PlayArrow />} onClick={handleRunNow} disabled={saving || !form.id}>
              Run now
            </Button>
            <Button variant="contained" onClick={handleSaveDefinition} disabled={saving}>
              Save configuration
            </Button>
          </Stack>
        </Stack>
      </Grid>
    </Grid>
  );

  const renderTasks = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Categories
            </Typography>
            <TextField label="Name" size="small" value={categoryForm.name} onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))} />
            <CategoryColorPicker
              value={categoryForm.color}
              onChange={(color) => setCategoryForm((prev) => ({ ...prev, color }))}
            />
            <FormControl size="small">
              <InputLabel>Icon</InputLabel>
              <Select
                label="Icon"
                value={categoryForm.icon}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, icon: event.target.value }))}
                renderValue={(value) => {
                  const option = CATEGORY_ICON_OPTIONS.find((item) => item.value === value);
                  return (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CategoryIcon icon={value} color={categoryForm.color} />
                      <span>{option?.label || value}</span>
                    </Stack>
                  );
                }}
              >
                {CATEGORY_ICON_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CategoryIcon icon={option.value} color={categoryForm.color} />
                      <span>{option.label}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" startIcon={<Add />} onClick={handleAddCategory}>
              Add category
            </Button>
            <Divider />
            {activeCategories.map((category) => (
              <Stack key={category._id} direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      bgcolor: `${category.color || "#84cc16"}22`,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <CategoryIcon icon={category.icon} color={category.color} />
                  </Box>
                  <Typography variant="body2">{category.name}</Typography>
                </Stack>
                <Tooltip title="Delete category">
                  <IconButton size="small" onClick={() => setCategoryToDelete(category)}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
            {!activeCategories.length && (
              <Typography variant="body2" color="text.secondary">
                No active categories.
              </Typography>
            )}
          </Stack>
        </Paper>
      </Grid>
      <Grid item xs={12} md={8}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Logged tasks
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <TextField label="Task title" size="small" fullWidth value={taskForm.title} onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField type="date" label="Date" size="small" fullWidth InputLabelProps={{ shrink: true }} value={taskForm.task_date} onChange={(event) => setTaskForm((prev) => ({ ...prev, task_date: event.target.value }))} />
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Impact</InputLabel>
                  <Select label="Impact" value={taskForm.impact_level} onChange={(event) => setTaskForm((prev) => ({ ...prev, impact_level: event.target.value }))}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select label="Category" value={taskForm.category_id} onChange={(event) => setTaskForm((prev) => ({ ...prev, category_id: event.target.value }))}>
                    <MenuItem value="">General</MenuItem>
                    {activeCategories.map((category) => (
                      <MenuItem key={category._id} value={category._id}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CategoryIcon icon={category.icon} color={category.color} />
                          <span>{category.name}</span>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Tags" size="small" fullWidth value={taskForm.tags} onChange={(event) => setTaskForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="ux, mobile" />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Description" size="small" fullWidth multiline minRows={2} value={taskForm.description} onChange={(event) => setTaskForm((prev) => ({ ...prev, description: event.target.value }))} />
              </Grid>
            </Grid>
            <Box>
              <Button variant="contained" startIcon={<Add />} onClick={handleAddTask}>
                Log task
              </Button>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Task</TableCell>
                    {!isMobile && <TableCell>Category</TableCell>}
                    <TableCell>Impact</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.map((task) => {
                    const category = categories.find((item) => item._id === task.category_id);
                    return (
                      <TableRow key={task._id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{task.title}</Typography>
                          <Typography variant="caption" color="text.secondary">{(task.tags || []).join(", ")}</Typography>
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <CategoryIcon icon={category?.icon} color={category?.color} />
                              <span>{category?.name || "General"}</span>
                            </Stack>
                          </TableCell>
                        )}
                        <TableCell><Chip size="small" label={task.impact_level} /></TableCell>
                        <TableCell>{dayjs(task.task_date).format("MMM D, YYYY")}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => handleDeleteTask(task._id)}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  );

  const renderRuns = () => (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Report run history
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Period</TableCell>
                <TableCell>Status</TableCell>
                {!isMobile && <TableCell>Approval</TableCell>}
                {!isMobile && <TableCell>Sent</TableCell>}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run._id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{run.period?.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{dayjs(run.created_at).format("MMM D, YYYY h:mm A")}</Typography>
                  </TableCell>
                  <TableCell><Chip size="small" label={run.status} color={statusColor(run.status)} /></TableCell>
                  {!isMobile && <TableCell>{run.approval?.status}</TableCell>}
                  {!isMobile && <TableCell>{run.dispatch?.sent_at ? dayjs(run.dispatch.sent_at).format("MMM D, h:mm A") : "—"}</TableCell>}
                  <TableCell align="right">
                    <Tooltip title="Preview HTML">
                      <IconButton size="small" onClick={() => { setPreviewHtml(run.snapshot?.html || ""); setPreviewOpen(true); }}>
                        <Preview fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {run.status === "pending_approval" && (
                      <>
                        <Tooltip title="Approve and send">
                          <IconButton size="small" onClick={() => handleRunAction(run, "approve")}>
                            <Send fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject">
                          <IconButton size="small" onClick={() => handleRunAction(run, "reject")}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {["sent", "failed"].includes(run.status) && (
                      <Tooltip title="Resend">
                        <IconButton size="small" onClick={() => handleRunAction(run, "resend")}>
                          <Refresh fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!runs.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">No report runs yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Paper>
  );

  return (
    <Stack spacing={2}>
      {renderHeader()}
      {!defaultBrandKey && (
        <Alert severity="info">Select a brand before configuring reports.</Alert>
      )}
      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs
          value={tab}
          onChange={(_event, value) => setTab(value)}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons="auto"
          sx={{ px: 1 }}
        >
          <Tab value="definitions" label="Configurations" />
          <Tab value="tasks" label="Task logs" />
          <Tab value="runs" label="Run history" />
        </Tabs>
      </Paper>
      {loading ? (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary">Loading reporting configuration...</Typography>
        </Paper>
      ) : (
        <>
          {tab === "definitions" && renderDefinitionEditor()}
          {tab === "tasks" && renderTasks()}
          {tab === "runs" && renderRuns()}
        </>
      )}

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Report preview</DialogTitle>
        <DialogContent dividers sx={{ bgcolor: "grey.100", p: 0 }}>
          <iframe
            title="Report preview"
            srcDoc={previewHtml || "<p>No preview available.</p>"}
            style={{ width: "100%", minHeight: "72vh", border: 0, background: "white" }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(categoryToDelete)}
        onClose={() => setCategoryToDelete(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete category?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              This will remove the category from new task logging, but existing tasks that already use it will keep their category, icon, and color.
            </Typography>
            {categoryToDelete && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ p: 1, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
              >
                <CategoryIcon icon={categoryToDelete.icon} color={categoryToDelete.color} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {categoryToDelete.name}
                </Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCategoryToDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteCategory}>
            Delete category
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
