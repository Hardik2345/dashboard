import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

const STATUS_META = {
  HEALTHY: { label: "Healthy", icon: CheckCircleIcon, color: "#10b981" },
  DEGRADED: { label: "Degraded", icon: WarningAmberIcon, color: "#f59e0b" },
  UNHEALTHY: { label: "Unhealthy", icon: ErrorIcon, color: "#ef4444" },
  UNKNOWN: { label: "Unknown", icon: HelpOutlineIcon, color: "#9ca3af" },
};

// Status is always conveyed via color + icon + text together, never color
// alone, so the badge stays legible for colorblind users and in screenshots.
export default function StatusBadge({ status, size = "medium", sx = {} }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const meta = STATUS_META[status] || STATUS_META.UNKNOWN;
  const Icon = meta.icon;

  const bg = isDark ? `${meta.color}33` : `${meta.color}1a`;
  const border = `${meta.color}99`;

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.6,
        borderRadius: "9999px",
        bgcolor: bg,
        border: "1px solid",
        borderColor: border,
        px: size === "small" ? 1 : 1.25,
        py: size === "small" ? 0.25 : 0.4,
        ...sx,
      }}
    >
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: meta.color,
          flexShrink: 0,
        }}
      />
      <Icon sx={{ fontSize: size === "small" ? 14 : 16, color: meta.color }} />
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: meta.color, whiteSpace: "nowrap" }}
      >
        {meta.label}
      </Typography>
    </Box>
  );
}
