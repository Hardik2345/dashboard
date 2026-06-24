import { Box, ButtonBase, Typography, useTheme } from "@mui/material";
import {
  CURRENCY_DISPLAY_MODES,
  useCurrencyDisplayMode,
} from "../lib/currency.js";

function ToggleOption({ label, active, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        px: 1.25,
        py: 0.5,
        borderRadius: "999px",
        color: active ? "#fff" : "text.secondary",
        bgcolor: active ? "primary.main" : "transparent",
        fontSize: "0.72rem",
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        transition: "all 0.2s ease",
      }}
    >
      {label}
    </ButtonBase>
  );
}

export default function DashboardCurrencyToggle() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { mode, setMode, canToggle } = useCurrencyDisplayMode();

  if (!canToggle) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 0.75,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          fontWeight: 700,
          letterSpacing: 0.2,
          textTransform: "uppercase",
        }}
      >
        Currency
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          p: 0.25,
          borderRadius: "999px",
          border: "1px solid",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
          bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
        }}
      >
        <ToggleOption
          label="Store Currency"
          active={mode === CURRENCY_DISPLAY_MODES.STORE}
          onClick={() => setMode(CURRENCY_DISPLAY_MODES.STORE)}
        />
        <ToggleOption
          label="INR"
          active={mode === CURRENCY_DISPLAY_MODES.INR}
          onClick={() => setMode(CURRENCY_DISPLAY_MODES.INR)}
        />
      </Box>
    </Box>
  );
}
