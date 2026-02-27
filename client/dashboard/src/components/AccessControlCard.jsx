import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Stack,
  Typography,
  Alert,
  Button,
  Autocomplete,
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
  useMediaQuery,
  Switch,
  Paper,
  Divider,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DomainIcon from "@mui/icons-material/Domain";
import FilterListIcon from "@mui/icons-material/FilterList";
import {
  adminListUsers,
  adminUpsertUser,
  adminDeleteUser,
  listAuthorBrands,
  listDomainRules,
  upsertDomainRule,
  deleteDomainRule,
} from "../lib/api";

const GlassChip = ({ label, size = "small", isDark }) => (
  <Chip
    label={label}
    size={size}
    sx={{
      bgcolor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
      color: isDark ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.8)",
      borderRadius: "8px",
      fontWeight: 600,
      fontSize: "0.7rem",
      border: "1px solid",
      borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
      height: 24,
      "& .MuiChip-label": { px: 1 },
    }}
  />
);

const PERMISSION_OPTIONS = [
  "all",
  "product_filter",
  "utm_filter",
  "web_vitals",
  "payment_split_order",
  "payment_split_sales",
  "traffic_split",
  "sales_channel_filter",
  "device_type_filter",
  "sessions_drop_off_funnel",
  "product_conversion",
  "compare_mode",
];

const StatusSwitch = ({ active, onChange, label = "Active", isDark }) => (
  <Stack direction="row" spacing={1} alignItems="center">
    <Typography
      variant="caption"
      sx={{
        color: active
          ? isDark
            ? "#34d399"
            : "#059669"
          : isDark
            ? "#9ca3af"
            : "#6b7280",
        fontWeight: 600,
        opacity: active ? 1 : 0.6,
      }}
    >
      {active ? label : "Inactive"}
    </Typography>
    <Switch
      size="small"
      checked={active}
      onChange={onChange}
      sx={{
        width: 32,
        height: 18,
        padding: 0,
        display: "flex",
        "& .MuiSwitch-switchBase": {
          padding: "2px",
          "&.Mui-checked": {
            transform: "translateX(14px)",
            color: "#fff",
            "& + .MuiSwitch-track": {
              opacity: 1,
              backgroundColor: "#10b981",
            },
          },
        },
        "& .MuiSwitch-thumb": {
          width: 14,
          height: 14,
          boxShadow: "none",
        },
        "& .MuiSwitch-track": {
          borderRadius: 9,
          opacity: 1,
          backgroundColor: isDark ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.1)",
          boxSizing: "border-box",
        },
      }}
    />
  </Stack>
);

const UserMobileCard = ({ user, onEdit, onDelete, onStatusToggle, isDark }) => (
  <Box
    sx={{
      p: 2,
      mb: 2,
      borderRadius: "16px",
      bgcolor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
      border: "1px solid",
      borderColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
    }}
  >
    <Stack spacing={2}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Stack spacing={0.5}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, wordBreak: "break-all" }}
          >
            {user.email}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            {user.role === "admin" ? (
              <ShieldOutlinedIcon sx={{ fontSize: 16, color: "#fff" }} />
            ) : user.role === "author" ? (
              <ShieldOutlinedIcon sx={{ fontSize: 16, color: "#3b82f6" }} />
            ) : (
              <VisibilityOutlinedIcon sx={{ fontSize: 16, color: "#f59e0b" }} />
            )}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                textTransform: "capitalize",
                color:
                  user.role === "author"
                    ? "#3b82f6"
                    : user.role === "viewer"
                      ? "#f59e0b"
                      : "inherit",
              }}
            >
              {user.role}
            </Typography>
          </Stack>
        </Stack>
        <StatusSwitch
          active={user.status === "active"}
          onChange={() => onStatusToggle(user.email, user.status)}
          isDark={isDark}
        />
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 2,
          py: 1.5,
          borderTop: "1px solid",
          borderBottom: "1px solid",
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.05)"
            : "rgba(0, 0, 0, 0.05)",
        }}
      >
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ opacity: 0.5, fontWeight: 600 }}>
            Primary Brand
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user.primary_brand_id || "N/A"}
          </Typography>
        </Stack>
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ opacity: 0.5, fontWeight: 600 }}>
            All Brands
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {user.brand_memberships?.length > 0 ? (
              user.brand_memberships.map((m) => (
                <GlassChip
                  key={m.brand_id}
                  label={m.brand_id}
                  size="small"
                  isDark={isDark}
                />
              ))
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                All
              </Typography>
            )}
          </Box>
        </Stack>
        <Stack spacing={0.5} sx={{ gridColumn: "span 2" }}>
          <Typography variant="caption" sx={{ opacity: 0.5, fontWeight: 600 }}>
            Permissions
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {user.brand_memberships?.[0]?.permissions?.length > 0 ? (
              user.brand_memberships[0].permissions.map((p) => (
                <GlassChip key={p} label={p} size="small" isDark={isDark} />
              ))
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Full Access
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <IconButton
          size="small"
          onClick={() => onEdit(user)}
          sx={{
            bgcolor: isDark
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(0, 0, 0, 0.03)",
          }}
        >
          <EditIcon sx={{ fontSize: 18, color: "#3b82f6" }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => onDelete(user.email)}
          sx={{
            bgcolor: isDark
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(0, 0, 0, 0.03)",
          }}
        >
          <DeleteIcon sx={{ fontSize: 18, color: "#ef4444" }} />
        </IconButton>
      </Stack>
    </Stack>
  </Box>
);

const DomainMobileCard = ({ rule, onEdit, onDelete, isDark }) => (
  <Box
    sx={{
      p: 2,
      mb: 2,
      borderRadius: "16px",
      bgcolor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
      border: "1px solid",
      borderColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
    }}
  >
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.5}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {rule.domain}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <ShieldOutlinedIcon sx={{ fontSize: 16, color: "#3b82f6" }} />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                textTransform: "capitalize",
                color: "#3b82f6",
              }}
            >
              {rule.role}
            </Typography>
          </Stack>
        </Stack>
        <Chip
          size="small"
          label={rule.status}
          sx={{
            textTransform: "capitalize",
            fontWeight: 700,
            fontSize: "0.65rem",
            bgcolor:
              rule.status === "active"
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
            color: rule.status === "active" ? "#10b981" : "#ef4444",
            border: "1px solid",
            borderColor:
              rule.status === "active"
                ? "rgba(16, 185, 129, 0.2)"
                : "rgba(239, 68, 68, 0.2)",
          }}
        />
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 2,
          py: 1.5,
          borderTop: "1px solid",
          borderBottom: "1px solid",
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.05)"
            : "rgba(0, 0, 0, 0.05)",
        }}
      >
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ opacity: 0.5, fontWeight: 600 }}>
            Primary Brand
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {rule.primary_brand_id || "N/A"}
          </Typography>
        </Stack>
        <Stack spacing={0.5}>
          <Typography variant="caption" sx={{ opacity: 0.5, fontWeight: 600 }}>
            All Brands
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {rule.brand_ids?.length > 0 ? (
              rule.brand_ids.map((b) => (
                <GlassChip key={b} label={b} size="small" isDark={isDark} />
              ))
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Default
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <IconButton
          size="small"
          onClick={() => onEdit(rule)}
          sx={{
            bgcolor: isDark
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(0, 0, 0, 0.03)",
          }}
        >
          <EditIcon sx={{ fontSize: 18, color: "#3b82f6" }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => onDelete(rule.domain)}
          sx={{
            bgcolor: isDark
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(0, 0, 0, 0.03)",
          }}
        >
          <DeleteIcon sx={{ fontSize: 18, color: "#ef4444" }} />
        </IconButton>
      </Stack>
    </Stack>
  </Box>
);

const emptyForm = {
  email: "",
  role: "viewer",
  brand_ids: [],
  primary_brand_id: "",
  status: "active",
  permissions: ["all"],
};

export default function AccessControlCard() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isEdit, setIsEdit] = useState(false);
  const [filterRole, setFilterRole] = useState("all");
  const [knownBrands, setKnownBrands] = useState([]);
  const [domainRules, setDomainRules] = useState([]);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [domainForm, setDomainForm] = useState({
    domain: "",
    role: "viewer",
    brand_ids: [],
    primary_brand_id: "",
    permissions: ["all"],
    status: "active",
  });
  const [domainSaving, setDomainSaving] = useState(false);

  const availableBrands = useMemo(() => {
    const set = new Set(knownBrands);
    users.forEach((u) => {
      (u.brand_memberships || []).forEach((b) => {
        if (b.brand_id) set.add(b.brand_id.toUpperCase());
      });
    });
    return Array.from(set);
  }, [users, knownBrands]);

  async function loadUsers() {
    setLoading(true);
    const r = await adminListUsers();
    if (r.error) setError(r.data?.error || "Failed to load users");
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
        console.warn("Failed to load brands", r);
        return;
      }
      const raw = r.data ?? r;
      const source = Array.isArray(raw?.brands)
        ? raw.brands
        : Array.isArray(raw)
          ? raw
          : [];
      const brands = source
        .map((b) =>
          (b.key || b.brand_id || b.name || b.toString()).toUpperCase(),
        )
        .filter(Boolean);
      setKnownBrands(brands);
    })();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      filterRole === "all" ? true : u.role === filterRole,
    );
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
      brand_ids: (u.brand_memberships || []).map((b) => b.brand_id),
      primary_brand_id: u.primary_brand_id || "",
      status: u.status || "active",
      permissions: u.brand_memberships?.[0]?.permissions || ["all"],
    });
    setIsEdit(true);
    setDialogOpen(true);
  }

  function handleFormChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.email) {
      setError("Email is required");
      return;
    }
    if (!form.primary_brand_id) {
      setError("Primary brand is required");
      return;
    }

    let brandIds = form.brand_ids || [];
    if (form.role === "viewer") {
      if (!brandIds.length) {
        setError("Select at least one brand");
        return;
      }
      if (!brandIds.includes(form.primary_brand_id)) {
        setError("Primary brand must be one of the selected brands");
        return;
      }
    } else {
      const merged = new Set(brandIds);
      merged.add(form.primary_brand_id);
      brandIds = Array.from(merged);
    }

    setSaving(true);
    const payload = {
      ...form,
      brand_ids: brandIds,
      permissions: form.role === "author" ? ["all"] : form.permissions,
    };
    const r = await adminUpsertUser(payload);
    setSaving(false);
    if (r.error) {
      setError(r.data?.error || "Save failed");
      return;
    }
    setDialogOpen(false);
    setError(null);
    await loadUsers();
  }

  async function handleStatusToggle(email, currentStatus) {
    const nextStatus = currentStatus === "active" ? "suspended" : "active";
    const user = users.find((u) => u.email === email);
    if (!user) return;

    setSaving(true);
    const payload = {
      email: user.email,
      role: user.role,
      brand_ids: (user.brand_memberships || []).map((b) => b.brand_id),
      primary_brand_id: user.primary_brand_id,
      status: nextStatus,
      permissions: user.brand_memberships?.[0]?.permissions || ["all"],
    };

    const r = await adminUpsertUser(payload);
    setSaving(false);
    if (r.error) {
      setError(r.data?.error || "Failed to update status");
      return;
    }
    await loadUsers();
  }

  const filteredDomainRules = useMemo(() => domainRules, [domainRules]);

  function openNewDomainRule() {
    setDomainForm({
      domain: "",
      role: "viewer",
      brand_ids: [],
      primary_brand_id: "",
      permissions: ["all"],
      status: "active",
    });
    setDomainDialogOpen(true);
  }

  async function handleSaveDomainRule() {
    if (!domainForm.domain) {
      setError("Domain is required");
      return;
    }
    if (!domainForm.primary_brand_id) {
      setError("Primary brand is required");
      return;
    }

    if (domainForm.role === "viewer") {
      if (!domainForm.brand_ids.length) {
        setError("Select at least one brand");
        return;
      }
      if (!domainForm.brand_ids.includes(domainForm.primary_brand_id)) {
        setError("Primary brand must be one of the selected brands");
        return;
      }
    }

    const payload = {
      ...domainForm,
      domain: domainForm.domain.toLowerCase().trim(),
      brand_ids: domainForm.brand_ids,
      permissions:
        domainForm.role === "author" ? ["all"] : domainForm.permissions,
    };

    setDomainSaving(true);
    const r = await upsertDomainRule(payload);
    setDomainSaving(false);
    if (r.error) {
      setError(r.data?.error || "Failed to save domain rule");
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
      setError(r.data?.error || "Failed to delete domain rule");
      return;
    }
    loadDomainRules();
  }

  async function handleDelete(email) {
    if (!window.confirm(`Delete user ${email}?`)) return;
    const r = await adminDeleteUser(email);
    if (r.error) {
      setError(r.data?.error || "Delete failed");
      return;
    }
    await loadUsers();
  }

  function renderChips(list = [], max = 2) {
    if (!list.length) return null;
    const head = list.slice(0, max);
    const tail = list.slice(max);
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
        {head.map((item) => (
          <GlassChip key={item} size="small" label={item} isDark={isDark} />
        ))}
        {tail.length > 0 && (
          <Tooltip title={tail.join(", ")}>
            <GlassChip size="small" label={`+${tail.length}`} isDark={isDark} />
          </Tooltip>
        )}
      </Stack>
    );
  }

  const containerSx = {
    bgcolor: isDark ? "rgba(18, 18, 18, 0.8)" : "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(20px)",
    borderRadius: "24px",
    border: "1px solid",
    borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
    overflow: "hidden",
    boxShadow: isDark
      ? "0 8px 32px rgba(0, 0, 0, 0.4)"
      : "0 8px 32px rgba(0, 0, 0, 0.05)",
  };

  const tableHeaderSx = {
    "& th": {
      bgcolor: isDark ? "rgba(30, 30, 30, 0.95)" : "rgba(242, 242, 242, 0.95)",
      backdropFilter: "blur(10px)",
      color: isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)",
      fontSize: "0.75rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      borderBottom: "1px solid",
      borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
      py: 2.5,
      zIndex: 2,
    },
  };

  const tableRowSx = {
    transition: "background-color 0.2s",
    "& td": {
      borderBottom: "1px solid",
      borderColor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
      py: 2.5,
    },
    "&:hover": {
      bgcolor: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.01)",
    },
  };

  const actionButtonSx = (color) => ({
    width: 36,
    height: 36,
    bgcolor: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
    borderRadius: "10px",
    color: color === "error" ? "#ef4444" : isDark ? "#34d399" : "#10b981",
    transition: "all 0.2s",
    "&:hover": {
      bgcolor:
        color === "error"
          ? "rgba(239, 68, 68, 0.1)"
          : "rgba(16, 185, 129, 0.1)",
      transform: "scale(1.05)",
    },
  });

  const scrollbarSx = {
    "&::-webkit-scrollbar": {
      width: "6px",
      height: "6px",
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
      borderRadius: "10px",
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
    },
  };

  return (
    <Box
      sx={{ p: 2, bgcolor: isDark ? "#000" : "#f8f9fa", minHeight: "100vh" }}
    >
      <Stack spacing={4}>
        {/* Header Section */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={2}
        >
          <Box>
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, color: isDark ? "#fff" : "#000", mb: 0.5 }}
            >
              Access Control
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: isDark
                  ? "rgba(255, 255, 255, 0.5)"
                  : "rgba(0, 0, 0, 0.5)",
              }}
            >
              Manage who can sign in (author/viewer) and their brand access
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              onClick={openNewDomainRule}
              sx={{
                borderRadius: "12px",
                textTransform: "none",
                borderColor: isDark
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(0,0,0,0.1)",
                color: isDark ? "#fff" : "#000",
                px: 2,
                "&:hover": {
                  borderColor: isDark ? "#fff" : "#000",
                  bgcolor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.02)",
                },
              }}
            >
              Add Domain Rule
            </Button>
            <Button
              variant="contained"
              onClick={openNew}
              startIcon={<AddCircleOutlineIcon />}
              sx={{
                borderRadius: "12px",
                textTransform: "none",
                bgcolor: "#10b981",
                px: 2,
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
                "&:hover": {
                  bgcolor: "#059669",
                  boxShadow: "0 6px 20px rgba(16, 185, 129, 0.5)",
                },
              }}
            >
              Add User
            </Button>
          </Stack>
        </Stack>

        {/* User Access Panel */}
        <Paper sx={containerSx}>
          <Box
            sx={{
              p: 3,
              borderBottom: "1px solid",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.05)",
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <FilterListIcon
                size="small"
                sx={{
                  color: isDark
                    ? "rgba(255, 255, 255, 0.4)"
                    : "rgba(0, 0, 0, 0.4)",
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  color: isDark
                    ? "rgba(255, 255, 255, 0.6)"
                    : "rgba(0, 0, 0, 0.6)",
                  fontWeight: 500,
                }}
              >
                Filter by Role :
              </Typography>
              <Select
                size="small"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                sx={{
                  minWidth: 100,
                  bgcolor: isDark
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.02)",
                  borderRadius: "10px",
                  "& .MuiSelect-select": {
                    py: 0.7,
                    px: 1.5,
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  },
                  "& fieldset": { border: "none" },
                }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="author">Author</MenuItem>
                <MenuItem value="viewer">Viewer</MenuItem>
              </Select>
            </Stack>
          </Box>

          <Box
            sx={{
              maxHeight: "500px",
              overflowY: "auto",
              position: "relative",
              ...scrollbarSx,
            }}
          >
            {error && (
              <Alert severity="error" sx={{ m: 2, borderRadius: "12px" }}>
                {error}
              </Alert>
            )}

            {isMobile ? (
              <Box sx={{ p: 2 }}>
                {filteredUsers.map((u) => (
                  <UserMobileCard
                    key={u.id || u.email}
                    user={u}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onStatusToggle={handleStatusToggle}
                    isDark={isDark}
                  />
                ))}
                {!loading && filteredUsers.length === 0 && (
                  <Typography
                    variant="body2"
                    sx={{ textAlign: "center", py: 4, opacity: 0.5 }}
                  >
                    No users found
                  </Typography>
                )}
              </Box>
            ) : (
              <Table stickyHeader>
                <TableHead sx={tableHeaderSx}>
                  <TableRow>
                    <TableCell sx={{ pl: 4 }}>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Primary Brand</TableCell>
                    <TableCell>All Brands</TableCell>
                    <TableCell>Permissions</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" sx={{ pr: 4 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id || u.email} sx={tableRowSx}>
                      <TableCell
                        sx={{
                          pl: 4,
                          fontWeight: 500,
                          color: isDark ? "#fff" : "#000",
                        }}
                      >
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {u.role === "author" ? (
                            <ShieldOutlinedIcon
                              sx={{ fontSize: 18, color: "#3b82f6" }}
                            />
                          ) : (
                            <VisibilityOutlinedIcon
                              sx={{ fontSize: 18, color: "#f59e0b" }}
                            />
                          )}
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              color:
                                u.role === "author" ? "#3b82f6" : "#f59e0b",
                              textTransform: "capitalize",
                            }}
                          >
                            {u.role}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {u.primary_brand_id || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {renderChips(
                          (() => {
                            const ids = (u.brand_memberships || [])
                              .map((b) => b.brand_id)
                              .filter(Boolean);
                            if (u.role === "author")
                              return [...new Set(ids), "ALL"];
                            return ids;
                          })(),
                          3,
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            color: isDark
                              ? "rgba(255,255,255,0.7)"
                              : "rgba(0,0,0,0.7)",
                            fontWeight: 500,
                          }}
                        >
                          {u.role === "author"
                            ? "Full Access"
                            : u.brand_memberships?.[0]?.permissions?.[0] ===
                                "all"
                              ? "Full Access"
                              : `${u.brand_memberships?.[0]?.permissions?.length || 0} Permissions`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusSwitch
                          active={u.status === "active"}
                          onChange={() => handleStatusToggle(u.email, u.status)}
                          isDark={isDark}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 4 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent="flex-end"
                        >
                          <Tooltip title="Edit">
                            <IconButton
                              sx={actionButtonSx("primary")}
                              onClick={() => openEdit(u)}
                            >
                              <EditIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              sx={actionButtonSx("error")}
                              onClick={() => handleDelete(u.email)}
                            >
                              <DeleteIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        sx={{ textAlign: "center", py: 8, opacity: 0.5 }}
                      >
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            {loading && (
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)",
                  zIndex: 1,
                }}
              >
                <CircularProgress
                  size={32}
                  thickness={5}
                  sx={{ color: "#10b981" }}
                />
              </Box>
            )}
          </Box>
        </Paper>

        {/* Domain Rules Panel */}
        <Paper sx={containerSx}>
          <Box
            sx={{
              p: 3,
              borderBottom: "1px solid",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.05)",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <DomainIcon
                size="small"
                sx={{
                  color: isDark
                    ? "rgba(255, 255, 255, 0.4)"
                    : "rgba(0, 0, 0, 0.4)",
                }}
              />
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, color: isDark ? "#fff" : "#000" }}
              >
                Domain Rules :
              </Typography>
            </Stack>
          </Box>
          <Box
            sx={{
              maxHeight: "400px",
              overflowY: "auto",
              ...scrollbarSx,
            }}
          >
            {isMobile ? (
              <Box sx={{ p: 2 }}>
                {filteredDomainRules.map((r) => (
                  <DomainMobileCard
                    key={r._id || r.domain}
                    rule={r}
                    onEdit={setDomainForm} // domain rule dialog uses setDomainForm directly in orig code
                    onDelete={handleDeleteDomainRule}
                    isDark={isDark}
                  />
                ))}
                {!loading && filteredDomainRules.length === 0 && (
                  <Typography
                    variant="body2"
                    sx={{ textAlign: "center", py: 4, opacity: 0.5 }}
                  >
                    No domain rules found
                  </Typography>
                )}
              </Box>
            ) : (
              <Table stickyHeader>
                <TableHead sx={tableHeaderSx}>
                  <TableRow>
                    <TableCell sx={{ pl: 4 }}>Domain</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Primary Brand</TableCell>
                    <TableCell>All Brands</TableCell>
                    <TableCell>Permissions</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" sx={{ pr: 4 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDomainRules.map((r) => (
                    <TableRow key={r._id || r.domain} sx={tableRowSx}>
                      <TableCell
                        sx={{
                          pl: 4,
                          fontWeight: 500,
                          color: isDark ? "#fff" : "#000",
                        }}
                      >
                        {r.domain}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color:
                              r.role === "admin" || r.role === "author"
                                ? "#fff"
                                : "#f59e0b",
                            textTransform: "capitalize",
                          }}
                        >
                          {r.role}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {r.primary_brand_id}
                        </Typography>
                      </TableCell>
                      <TableCell>{renderChips(r.brand_ids || [], 2)}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            color: isDark
                              ? "rgba(255,255,255,0.7)"
                              : "rgba(0,0,0,0.7)",
                            fontWeight: 500,
                          }}
                        >
                          {r.role === "author" || r.role === "admin"
                            ? "Full Access"
                            : r.permissions?.[0] === "all"
                              ? "Full Access"
                              : `${r.permissions?.length || 0} Permissions`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <StatusSwitch
                          active={r.status === "active"}
                          onChange={() => {}}
                          isDark={isDark}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 4 }}>
                        <IconButton
                          sx={actionButtonSx("error")}
                          onClick={() => handleDeleteDomainRule(r.domain)}
                        >
                          <DeleteIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && filteredDomainRules.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        sx={{ textAlign: "center", py: 8, opacity: 0.5 }}
                      >
                        No domain rules found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Box>
        </Paper>
      </Stack>

      {/* Dialogs */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: { borderRadius: "20px", bgcolor: isDark ? "#1a1a1a" : "#fff" },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {isEdit ? "Edit User" : "Add New User"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Email Address"
              fullWidth
              value={form.email}
              onChange={(e) => handleFormChange("email", e.target.value)}
              disabled={isEdit}
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                label="Role"
                value={form.role}
                onChange={(e) => handleFormChange("role", e.target.value)}
                MenuProps={{
                  PaperProps: { sx: { zIndex: 1400 } },
                }}
              >
                <MenuItem value="author">Author</MenuItem>
                <MenuItem value="viewer">Viewer</MenuItem>
              </Select>
            </FormControl>
            {form.role === "viewer" && (
              <>
                <Autocomplete
                  multiple
                  freeSolo
                  options={availableBrands}
                  value={form.brand_ids}
                  onChange={(_, val) =>
                    handleFormChange(
                      "brand_ids",
                      val
                        .map((v) => v.toString().trim().toUpperCase())
                        .filter(Boolean),
                    )
                  }
                  slotProps={{
                    popper: { sx: { zIndex: 1400 } },
                  }}
                  ListboxProps={{
                    sx: { maxHeight: 250 },
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        variant="outlined"
                        label={option}
                        {...getTagProps({ index })}
                      />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Brands"
                      placeholder="Type and press Enter"
                      fullWidth
                    />
                  )}
                />
                <FormControl fullWidth>
                  <InputLabel>Primary Brand</InputLabel>
                  <Select
                    label="Primary Brand"
                    value={form.primary_brand_id}
                    onChange={(e) =>
                      handleFormChange("primary_brand_id", e.target.value)
                    }
                    MenuProps={{
                      PaperProps: { sx: { zIndex: 1400 } },
                    }}
                  >
                    {(form.brand_ids || []).map((b) => (
                      <MenuItem key={b} value={b}>
                        {b}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Autocomplete
                  multiple
                  options={PERMISSION_OPTIONS}
                  value={form.permissions}
                  onChange={(_, val) => handleFormChange("permissions", val)}
                  slotProps={{
                    popper: {
                      sx: { zIndex: 1400 },
                      placement: "bottom-start",
                      modifiers: [
                        {
                          name: "flip",
                          enabled: false,
                        },
                      ],
                    },
                  }}
                  ListboxProps={{
                    sx: { maxHeight: 250 },
                  }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        variant="outlined"
                        label={option}
                        {...getTagProps({ index })}
                      />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="Permissions" fullWidth />
                  )}
                />
              </>
            )}
            {form.role === "author" && (
              <Stack spacing={1.5}>
                <Autocomplete
                  freeSolo
                  options={availableBrands}
                  value={form.primary_brand_id}
                  onChange={(_, val) =>
                    handleFormChange(
                      "primary_brand_id",
                      (val || "").toString().trim().toUpperCase(),
                    )
                  }
                  slotProps={{
                    popper: {
                      sx: { zIndex: 1400 },
                      placement: "bottom-start",
                      modifiers: [
                        {
                          name: "flip",
                          enabled: false,
                        },
                      ],
                    },
                  }}
                  ListboxProps={{
                    sx: { maxHeight: 250 },
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Primary Brand (Required)"
                      required
                      fullWidth
                    />
                  )}
                />
                <Alert severity="info" sx={{ borderRadius: "12px" }}>
                  Authors have access to all brands and permissions.
                </Alert>
              </Stack>
            )}
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => handleFormChange("status", e.target.value)}
                MenuProps={{
                  PaperProps: { sx: { zIndex: 1400 } },
                }}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            variant="contained"
            sx={{
              borderRadius: "10px",
              textTransform: "none",
              fontWeight: 600,
              bgcolor: "#10b981",
              "&:hover": { bgcolor: "#059669" },
            }}
          >
            {isEdit ? "Save Changes" : "Create User"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Domain Rule Dialog */}
      <Dialog
        open={domainDialogOpen}
        onClose={() => setDomainDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: { borderRadius: "20px", bgcolor: isDark ? "#1a1a1a" : "#fff" },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Add Domain Rule</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Domain"
              fullWidth
              value={domainForm.domain}
              onChange={(e) =>
                setDomainForm((prev) => ({ ...prev, domain: e.target.value }))
              }
              helperText="Example: trytechit.co"
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                label="Role"
                value={domainForm.role}
                onChange={(e) =>
                  setDomainForm((prev) => ({ ...prev, role: e.target.value }))
                }
                MenuProps={{
                  PaperProps: { sx: { zIndex: 1400 } },
                }}
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
              onChange={(_, val) =>
                setDomainForm((prev) => ({
                  ...prev,
                  brand_ids: val
                    .map((v) => v.toString().trim().toUpperCase())
                    .filter(Boolean),
                }))
              }
              slotProps={{
                popper: {
                  sx: { zIndex: 1400 },
                  placement: "bottom-start",
                  modifiers: [
                    {
                      name: "flip",
                      enabled: false,
                    },
                  ],
                },
              }}
              ListboxProps={{
                sx: { maxHeight: 250 },
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    {...getTagProps({ index })}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField {...params} label="Brands" fullWidth />
              )}
            />
            <Autocomplete
              freeSolo
              options={
                domainForm.brand_ids.length
                  ? domainForm.brand_ids
                  : availableBrands
              }
              value={domainForm.primary_brand_id}
              onChange={(_, val) =>
                setDomainForm((prev) => ({
                  ...prev,
                  primary_brand_id: (val || "").toString().trim().toUpperCase(),
                }))
              }
              slotProps={{
                popper: {
                  sx: { zIndex: 1400 },
                  placement: "bottom-start",
                  modifiers: [
                    {
                      name: "flip",
                      enabled: false,
                    },
                  ],
                },
              }}
              ListboxProps={{
                sx: { maxHeight: 250 },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Primary Brand (Required)"
                  required
                  fullWidth
                />
              )}
            />
            {domainForm.role === "viewer" && (
              <Autocomplete
                multiple
                options={PERMISSION_OPTIONS}
                value={domainForm.permissions}
                onChange={(_, val) =>
                  setDomainForm((prev) => ({ ...prev, permissions: val }))
                }
                slotProps={{
                  popper: {
                    sx: { zIndex: 1400 },
                    placement: "bottom-start",
                    modifiers: [
                      {
                        name: "flip",
                        enabled: false,
                      },
                    ],
                  },
                }}
                ListboxProps={{
                  sx: { maxHeight: 250 },
                }}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      variant="outlined"
                      label={option}
                      {...getTagProps({ index })}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="Permissions" fullWidth />
                )}
              />
            )}
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={domainForm.status}
                onChange={(e) =>
                  setDomainForm((prev) => ({ ...prev, status: e.target.value }))
                }
                MenuProps={{
                  PaperProps: { sx: { zIndex: 1400 } },
                }}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => setDomainDialogOpen(false)}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveDomainRule}
            disabled={domainSaving}
            variant="contained"
            sx={{
              borderRadius: "10px",
              textTransform: "none",
              fontWeight: 600,
              bgcolor: "#10b981",
              "&:hover": { bgcolor: "#059669" },
            }}
          >
            Save Rule
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
