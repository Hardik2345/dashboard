import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Popover, Tooltip, Typography, useTheme } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { getDailyInsight } from "../lib/api.js";

const PX_PER_SECOND = 40;
const MIN_DURATION_S = 12;

export default function DailyInsightBar({ brandKey, date, refreshToken }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [insight, setInsight] = useState(null);
  const [overflowing, setOverflowing] = useState(false);
  const [animationDuration, setAnimationDuration] = useState(`${MIN_DURATION_S}s`);
  const [paused, setPaused] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const popoverPaperRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!brandKey || !date) {
      setInsight(null);
      return () => {
        cancelled = true;
      };
    }
    getDailyInsight({ brandKey, date }).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setInsight(null);
        return;
      }
      setInsight(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [brandKey, date, refreshToken]);

  useLayoutEffect(() => {
    if (!insight?.insight || !containerRef.current || !textRef.current) {
      setOverflowing(false);
      return undefined;
    }
    const measure = () => {
      if (!containerRef.current || !textRef.current) return;
      const width = textRef.current.scrollWidth;
      setOverflowing(width > containerRef.current.clientWidth);
      setAnimationDuration(`${Math.max(MIN_DURATION_S, width / PX_PER_SECOND)}s`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [insight]);

  useEffect(() => {
    if (!anchorEl) return undefined;

    const timeoutId = window.setTimeout(() => {
      setAnchorEl(null);
    }, 5000);

    const handleOutsideInteraction = (event) => {
      const target = event.target;
      if (
        anchorEl?.contains?.(target) ||
        popoverPaperRef.current?.contains?.(target)
      ) {
        return;
      }
      setAnchorEl(null);
    };

    document.addEventListener("pointerdown", handleOutsideInteraction, true);
    document.addEventListener("touchstart", handleOutsideInteraction, true);
    document.addEventListener("mousedown", handleOutsideInteraction, true);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("pointerdown", handleOutsideInteraction, true);
      document.removeEventListener("touchstart", handleOutsideInteraction, true);
      document.removeEventListener("mousedown", handleOutsideInteraction, true);
    };
  }, [anchorEl]);

  if (!brandKey || !date || !insight?.insight) return null;

  const handleTap = (event) => {
    // Touch/mobile has no hover-to-pause, so tapping opens the full text instead.
    setAnchorEl(event.currentTarget);
  };

  return (
    <Tooltip
      title={insight.insight}
      enterDelay={400}
      placement="bottom-start"
      disableTouchListener
    >
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: "10px",
        border: "1px solid",
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
        bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
        overflow: "hidden",
        cursor: overflowing ? "pointer" : "default",
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={overflowing ? handleTap : undefined}
    >
      <AutoAwesomeIcon sx={{ fontSize: 16, color: "primary.main", flexShrink: 0 }} />
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: "text.secondary", flexShrink: 0, whiteSpace: "nowrap" }}
      >
        Daily Insight
      </Typography>
      <Box ref={containerRef} sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <Box
          sx={{
            display: "flex",
            whiteSpace: "nowrap",
            fontSize: "0.8125rem",
            color: "text.primary",
            width: "max-content",
            ...(overflowing
              ? {
                  animation: `daily-insight-marquee ${animationDuration} linear infinite`,
                  animationPlayState: paused ? "paused" : "running",
                  "@keyframes daily-insight-marquee": {
                    "0%": { transform: "translateX(0)" },
                    "100%": { transform: "translateX(-50%)" },
                  },
                }
              : {}),
          }}
        >
          <Box ref={textRef} component="span" sx={{ pr: overflowing ? 6 : 0 }}>
            {insight.insight}
          </Box>
          {overflowing && (
            <Box component="span" aria-hidden="true" sx={{ pr: 6 }}>
              {insight.insight}
            </Box>
          )}
        </Box>
      </Box>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            ref: popoverPaperRef,
            sx: { p: 1.5, maxWidth: 360 },
          },
        }}
      >
        <Typography variant="body2">{insight.insight}</Typography>
      </Popover>
    </Box>
    </Tooltip>
  );
}
