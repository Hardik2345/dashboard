import { Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import useWebVitals from "../hooks/useWebVitals.js";

const nfFloat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export default function WebPerformancePanel({
  query,
  selectedMetrics = [],
  activeMetric = null,
  onSelectMetric,
  onToggleMetric,
}) {
  const theme = useTheme();
  const { performanceAvg, performancePrev, performanceChange, loading } =
    useWebVitals(query, "PERFORMANCE", {
      usePerformanceSummary: true,
    });

  const selected = activeMetric === "performance";
  const radioSelected = selectedMetrics.includes("performance");
  const clickable = typeof onSelectMetric === "function";
  const selectionClickable = typeof onToggleMetric === "function";

  const handleKeyDown = (event) => {
    if (!clickable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectMetric("performance");
    }
  };

  const handleSelectionToggle = (event) => {
    if (!selectionClickable) return;
    event.preventDefault();
    event.stopPropagation();
    onToggleMetric("performance");
  };

  return (
    <Card
      elevation={0}
      onClick={clickable ? () => onSelectMetric("performance") : undefined}
      onKeyDown={handleKeyDown}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? selected : undefined}
      sx={{
        height: "100%",
        minHeight: { xs: 150, md: 310 },
        border: "1px solid",
        borderColor: selected ? "#06b6d4" : "divider",
        position: "relative",
        cursor: clickable ? "pointer" : "default",
        boxShadow: selected
          ? `0 0 0 1px #06b6d4, 0 10px 20px ${alpha("#06b6d4", 0.2)}, 0 6px 6px ${alpha("#06b6d4", 0.1)}`
          : "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
        transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "&:hover": clickable
          ? {
              boxShadow: selected
                ? `0 0 0 1.5px #06b6d4, 0 14px 28px ${alpha("#06b6d4", 0.25)}, 0 10px 10px ${alpha("#06b6d4", 0.15)}`
                : "0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)",
              transform: "translateY(-4px)",
            }
          : undefined,
        "&:focus-visible": clickable
          ? { borderColor: "primary.main" }
          : undefined,
      }}
    >
      <CardContent
        sx={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          p: { xs: 1.5, md: 2 },
          textAlign: "center",
          "&:last-child": { pb: { xs: 1.5, md: 2 } },
        }}
      >
        {loading ? (
          <Box sx={{ textAlign: "center" }}>
            <Skeleton variant="text" width={160} sx={{ mx: "auto" }} />
            <Skeleton variant="text" width={120} height={42} sx={{ mx: "auto" }} />
          </Box>
        ) : (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Web Performance(Avg)
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1 }}>
              {nfFloat.format(performanceAvg ?? 0)}
            </Typography>
            {query?.compare_start &&
            query?.compare_end &&
            performancePrev != null ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.75, fontWeight: 400 }}
              >
                vs {nfFloat.format(performancePrev)}
              </Typography>
            ) : null}
            {typeof performanceChange === "number" ? (
              <Typography
                variant="caption"
                sx={{
                  mt: 1,
                  display: "block",
                  color:
                    performanceChange > 0
                      ? "#10b981"
                      : performanceChange < 0
                        ? "#ef4444"
                        : "text.secondary",
                  fontWeight: 600,
                }}
              >
                {performanceChange > 0 ? "↗" : performanceChange < 0 ? "↘" : ""}
                {" "}
                {nfFloat.format(Math.abs(performanceChange))}%
              </Typography>
            ) : (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                Performance score for selected period
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
      {selectionClickable && (
        <Box
          component="button"
          type="button"
          aria-pressed={radioSelected}
          aria-label={`${radioSelected ? "Deselect" : "Select"} Web Performance(Avg)`}
          onClick={handleSelectionToggle}
          sx={{
            position: "absolute",
            right: 12,
            bottom: 12,
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "1.5px solid",
            borderColor: radioSelected
              ? "#06b6d4"
              : alpha(theme.palette.text.secondary, 0.35),
            bgcolor: radioSelected ? "#06b6d4" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.18s ease",
            boxShadow: radioSelected
              ? `0 2px 6px ${alpha("#06b6d4", 0.35)}`
              : "none",
            cursor: selectionClickable ? "pointer" : "default",
            p: 0,
            outline: "none",
            appearance: "none",
            WebkitAppearance: "none",
            "&:focus-visible": {
              boxShadow: `0 0 0 2px ${alpha("#06b6d4", 0.28)}`,
            },
          }}
        >
          {radioSelected && (
            <Box
              component="span"
              sx={{
                width: 7,
                height: 4,
                borderLeft: "2px solid #fff",
                borderBottom: "2px solid #fff",
                transform: "rotate(-45deg) translateY(-1px)",
              }}
            />
          )}
        </Box>
      )}
    </Card>
  );
}
