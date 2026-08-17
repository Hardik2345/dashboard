import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Typography, useMediaQuery, useTheme } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { getDailyInsight } from "../lib/api.js";

export default function DailyInsightBar({ brandKey, date, refreshToken }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [insight, setInsight] = useState(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const measureRef = useRef(null);
  const displayInsightText = isMobile
    ? String(insight?.insight || "").replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim()
    : insight?.insight || "";

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
      setExpanded(false);
    });
    return () => {
      cancelled = true;
    };
  }, [brandKey, date, refreshToken]);

  useLayoutEffect(() => {
    if (!displayInsightText || !containerRef.current || !measureRef.current) {
      setOverflowing(false);
      return undefined;
    }
    const measure = () => {
      if (!containerRef.current || !measureRef.current) return;
      setOverflowing(measureRef.current.scrollWidth > containerRef.current.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [displayInsightText]);

  if (!brandKey || !date || !displayInsightText) return null;

  if (isMobile) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: expanded ? "flex-start" : "center",
          gap: 0.75,
          px: 1.5,
          py: 0.75,
          borderRadius: "10px",
          border: "1px solid",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
          bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
          overflow: "hidden",
        }}
      >
        <AutoAwesomeIcon
          sx={{
            fontSize: 16,
            color: "primary.main",
            flexShrink: 0,
            mt: expanded ? "2px" : 0,
          }}
        />
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            minWidth: 0,
            position: "relative",
          }}
        >
          <Box
            ref={measureRef}
            component="span"
            aria-hidden="true"
            sx={{
              position: "absolute",
              visibility: "hidden",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              fontSize: "0.8125rem",
            }}
          >
            Daily Insight {displayInsightText}
          </Box>
          <Typography
            ref={textRef}
            variant="body2"
            component="div"
            sx={{
              fontSize: "0.8125rem",
              color: "text.primary",
              whiteSpace: expanded ? "normal" : "nowrap",
              overflow: "hidden",
              textOverflow: expanded ? "clip" : "ellipsis",
              wordBreak: "break-word",
              pr: !expanded && overflowing ? 8 : 0,
            }}
          >
            <Box
              component="span"
              sx={{
                fontWeight: 600,
                color: "transparent",
                backgroundImage: "linear-gradient(90deg, #c084fc 0%, #a855f7 45%, #7c3aed 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Daily Insight
            </Box>{" "}
            {displayInsightText}
            {expanded ? (
              <Button
                size="small"
                onClick={() => setExpanded(false)}
                sx={{
                  minWidth: "auto",
                  px: 0,
                  py: 0,
                  ml: 1,
                  display: "inline-flex",
                  verticalAlign: "baseline",
                  fontSize: "0.75rem",
                  lineHeight: 1.2,
                  textTransform: "none",
                }}
              >
                Show less
              </Button>
            ) : null}
          </Typography>
          {!expanded && overflowing ? (
            <Button
              size="small"
              onClick={() => setExpanded(true)}
              sx={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                minWidth: "auto",
                px: 0,
                py: 0,
                bgcolor: isDark ? "rgba(12,12,12,0.92)" : "rgba(255,255,255,0.96)",
                boxShadow: "none",
                fontSize: "0.75rem",
                lineHeight: 1.2,
                textTransform: "none",
                "&:hover": {
                  bgcolor: isDark ? "rgba(18,18,18,0.98)" : "rgba(255,255,255,1)",
                  boxShadow: "none",
                },
              }}
            >
              Show more
            </Button>
          ) : null}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: isMobile ? "auto 1fr" : "auto auto 1fr",
        gridTemplateRows: isMobile ? "auto auto" : "auto",
        alignItems: expanded ? "flex-start" : "center",
        columnGap: 1,
        rowGap: isMobile ? 0.5 : 0,
        px: 1.5,
        py: 0.75,
        borderRadius: "10px",
        border: "1px solid",
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
        bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
        overflow: "hidden",
      }}
    >
      <AutoAwesomeIcon
        sx={{
          fontSize: 16,
          color: "primary.main",
          flexShrink: 0,
          gridColumn: "1 / 2",
          gridRow: "1 / 2",
          mt: isMobile && expanded ? "2px" : 0,
        }}
      />
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          flexShrink: 0,
          whiteSpace: "nowrap",
          gridColumn: "2 / 3",
          gridRow: "1 / 2",
          color: "transparent",
          backgroundImage: "linear-gradient(90deg, #c084fc 0%, #a855f7 45%, #7c3aed 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Daily Insight
      </Typography>
      <Box
        sx={{
          minWidth: 0,
          overflow: "hidden",
          gridColumn: isMobile ? "1 / -1" : "3 / 4",
          gridRow: isMobile ? "2 / 3" : "1 / 2",
          pl: isMobile ? "24px" : 0,
        }}
      >
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            position: "relative",
            width: "100%",
          }}
        >
          <Box
            ref={measureRef}
            component="span"
            aria-hidden="true"
            sx={{
              position: "absolute",
              visibility: "hidden",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              fontSize: "0.8125rem",
            }}
          >
            {displayInsightText}
          </Box>
          {expanded ? (
            <Typography
              ref={textRef}
              variant="body2"
              component="div"
              sx={{
                fontSize: "0.8125rem",
                color: "text.primary",
                whiteSpace: isMobile ? "normal" : "pre-wrap",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {displayInsightText}
              <Button
                size="small"
                onClick={() => setExpanded((prev) => !prev)}
                sx={{
                  minWidth: "auto",
                  px: 0,
                  py: 0,
                  ml: 1,
                  display: "inline-flex",
                  verticalAlign: "baseline",
                  fontSize: "0.75rem",
                  lineHeight: 1.2,
                  textTransform: "none",
                }}
              >
                Show less
              </Button>
            </Typography>
          ) : (
            <Box sx={{ position: "relative", pr: overflowing ? 8 : 0 }}>
              <Typography
                ref={textRef}
                variant="body2"
                component="div"
                sx={{
                  fontSize: "0.8125rem",
                  color: "text.primary",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {displayInsightText}
              </Typography>
              {overflowing ? (
                <Button
                  size="small"
                  onClick={() => setExpanded(true)}
                  sx={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    minWidth: "auto",
                    px: 0,
                    py: 0,
                    bgcolor: isDark ? "rgba(12,12,12,0.92)" : "rgba(255,255,255,0.96)",
                    boxShadow: "none",
                    fontSize: "0.75rem",
                    lineHeight: 1.2,
                    textTransform: "none",
                    "&:hover": {
                      bgcolor: isDark ? "rgba(18,18,18,0.98)" : "rgba(255,255,255,1)",
                      boxShadow: "none",
                    },
                  }}
                >
                  Show more
                </Button>
              ) : null}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
