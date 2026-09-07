import { useEffect, useMemo, useState } from "react";
import { Box, Card, IconButton, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { METRIC_DEFS, getStatusMeta } from "../webVitalsFormat.js";

const PERFORMANCE_DEF = METRIC_DEFS.performance;
const PAGE_SLOT_COUNT = 8;
const SELECTED_CARD_COLOR = "#10b981";

function BrandCard({ brand, selected, onSelect }) {
  const value = brand.metrics?.performance?.value ?? null;
  const statusMeta = getStatusMeta(brand.metrics?.performance?.status, "performance");
  const clickable = typeof onSelect === "function";

  return (
    <Card
      variant="outlined"
      onClick={clickable ? onSelect : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? Boolean(selected) : undefined}
      sx={{
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        cursor: clickable ? "pointer" : "default",
        transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        borderColor: selected ? SELECTED_CARD_COLOR : "divider",
        boxShadow: selected
          ? `0 0 0 1px ${SELECTED_CARD_COLOR}, 0 10px 20px ${alpha(SELECTED_CARD_COLOR, 0.2)}, 0 6px 6px ${alpha(SELECTED_CARD_COLOR, 0.1)}`
          : "none",
        "&:hover": clickable
          ? {
              borderColor: selected ? SELECTED_CARD_COLOR : "divider",
              boxShadow: selected
                ? `0 0 0 1.5px ${SELECTED_CARD_COLOR}, 0 14px 28px ${alpha(SELECTED_CARD_COLOR, 0.25)}, 0 10px 10px ${alpha(SELECTED_CARD_COLOR, 0.15)}`
                : "0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)",
              transform: "translateY(-4px)",
            }
          : {},
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {brand.brand_name || brand.brand_key}
      </Typography>

      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {PERFORMANCE_DEF.format(value)}
        {value !== null ? (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            /100
          </Typography>
        ) : null}
      </Typography>

      {statusMeta ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "999px",
              bgcolor: statusMeta.color,
              flexShrink: 0,
            }}
          />
          <Typography variant="caption" sx={{ color: statusMeta.color, fontWeight: 600 }}>
            {statusMeta.label}
          </Typography>
        </Box>
      ) : (
        <Typography variant="caption" color="text.secondary">
          No data
        </Typography>
      )}
    </Card>
  );
}

export default function WebVitalsAllBrandsSnapshot({
  brands,
  loading,
  selectedBrandKey,
  onSelectBrand,
}) {
  const [pageIndex, setPageIndex] = useState(0);

  const pages = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < brands.length; i += PAGE_SLOT_COUNT) {
      chunks.push(brands.slice(i, i + PAGE_SLOT_COUNT));
    }
    return chunks.length > 0 ? chunks : [[]];
  }, [brands]);

  useEffect(() => {
    if (pageIndex > pages.length - 1) setPageIndex(0);
  }, [pageIndex, pages.length]);

  const currentPage = pages[pageIndex] || [];

  return (
    <Box>
      {pages.length > 1 ? (
        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.25} sx={{ mb: 1 }}>
          <IconButton
            size="small"
            onClick={() => setPageIndex((current) => current - 1)}
            disabled={pageIndex === 0}
            sx={{ color: "text.secondary", bgcolor: "rgba(255,255,255,0.03)" }}
          >
            <ChevronLeftRoundedIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, textAlign: "center" }}>
            {pageIndex + 1}/{pages.length}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setPageIndex((current) => current + 1)}
            disabled={pageIndex === pages.length - 1}
            sx={{ color: "text.secondary", bgcolor: "rgba(255,255,255,0.03)" }}
          >
            <ChevronRightRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, 1fr)",
            sm: "repeat(4, 1fr)",
          },
          gap: 1.5,
        }}
      >
        {loading ? (
          Array.from({ length: PAGE_SLOT_COUNT }).map((_, index) => (
            <Card key={`skeleton-${index}`} variant="outlined" sx={{ p: 2, height: "100%" }}>
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" width={60} height={40} />
              <Skeleton variant="text" width="50%" />
            </Card>
          ))
        ) : brands.length === 0 ? (
          <Box sx={{ gridColumn: "1 / -1" }}>
            <Typography variant="body2" color="text.secondary">
              No web vitals data for this date across any brand.
            </Typography>
          </Box>
        ) : (
          currentPage.map((brand) => (
            <BrandCard
              key={brand.brand_key}
              brand={brand}
              selected={
                typeof onSelectBrand === "function" &&
                brand.brand_key === selectedBrandKey
              }
              onSelect={
                typeof onSelectBrand === "function"
                  ? () => onSelectBrand(brand.brand_key)
                  : undefined
              }
            />
          ))
        )}
      </Box>
    </Box>
  );
}
