import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import {
  DASHBOARD_LAYOUT_DEFAULTS,
  DASHBOARD_WIDGET_LABELS,
} from "../lib/dashboardLayout.js";

function LayoutChip({ active, children, onClick }) {
  return (
    <Button
      onClick={onClick}
      variant="text"
      sx={{
        minWidth: 0,
        px: 2,
        py: 1,
        borderRadius: "999px",
        color: active ? "#fff" : "text.secondary",
        bgcolor: active ? "rgba(91,163,224,0.95)" : "transparent",
        fontWeight: active ? 700 : 600,
        textTransform: "none",
        "&:hover": {
          bgcolor: active ? "rgba(91,163,224,1)" : "rgba(255,255,255,0.06)",
        },
      }}
    >
      {children}
    </Button>
  );
}

function LayoutRowCard({
  id,
  dragging = false,
  setNodeRef,
  style,
  handleProps = {},
}) {
  const elevated = dragging;

  return (
    <Box ref={setNodeRef} sx={style}>
      <motion.div
        layout
        initial={false}
        animate={{
          scale: elevated ? 1.015 : 1,
          boxShadow: elevated
            ? "0 18px 40px rgba(0,0,0,0.35)"
            : "0 6px 20px rgba(0,0,0,0.18)",
        }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
      >
        <Box
          sx={{
            px: { xs: 2, md: 2.25 },
            py: { xs: 1.6, md: 1.4 },
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            borderRadius: "18px",
            border: "1px solid",
            borderColor: elevated
              ? "rgba(91,163,224,0.7)"
              : "rgba(255,255,255,0.12)",
            bgcolor: elevated
              ? "rgba(91,163,224,0.14)"
              : "rgba(255,255,255,0.05)",
            backdropFilter: "blur(18px)",
            userSelect: "none",
            "&:hover": {
              borderColor: "rgba(255,255,255,0.22)",
              bgcolor: "rgba(255,255,255,0.08)",
            },
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: "12px",
              display: "grid",
              placeItems: "center",
              bgcolor: "rgba(255,255,255,0.08)",
              color: "text.secondary",
              flexShrink: 0,
              cursor: "grab",
              touchAction: "none",
            }}
            {...handleProps}
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700}>
              {DASHBOARD_WIDGET_LABELS[id] || id}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Dashboard block
            </Typography>
          </Box>
        </Box>
      </motion.div>
    </Box>
  );
}

function SortableRow({ id }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <LayoutRowCard
      id={id}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.28 : 1,
      }}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

export default function DashboardLayoutEditor({
  open,
  onClose,
  onSave,
  onPreviewChange,
  visibleDesktopIds,
  visibleMobileIds,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [activeTab, setActiveTab] = useState("desktop");
  const [draftDesktop, setDraftDesktop] = useState(visibleDesktopIds);
  const [draftMobile, setDraftMobile] = useState(visibleMobileIds);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab("desktop");
    setDraftDesktop(visibleDesktopIds);
    setDraftMobile(visibleMobileIds);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    onPreviewChange?.({
      desktop: draftDesktop,
      mobile: draftMobile,
    });
  }, [draftDesktop, draftMobile, onPreviewChange, open]);

  const currentItems = activeTab === "desktop" ? draftDesktop : draftMobile;
  const setCurrentItems =
    activeTab === "desktop" ? setDraftDesktop : setDraftMobile;

  const emptyMessage = activeTab === "desktop"
    ? "No desktop widgets are currently editable."
    : "No mobile widgets are currently editable.";

  const hasUnsavedChanges = useMemo(() => {
    const initialDesktop = visibleDesktopIds.join("|");
    const initialMobile = visibleMobileIds.join("|");
    return (
      draftDesktop.join("|") !== initialDesktop ||
      draftMobile.join("|") !== initialMobile
    );
  }, [draftDesktop, draftMobile, visibleDesktopIds, visibleMobileIds]);

  const handleDragStart = ({ active }) => {
    setActiveId(active.id);
  };

  const handleDragOver = () => {};

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    setCurrentItems((items) => {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return items;
      }
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleReset = () => {
    if (activeTab === "desktop") {
      setDraftDesktop(
        DASHBOARD_LAYOUT_DEFAULTS.desktop.filter((id) =>
          visibleDesktopIds.includes(id),
        ),
      );
      return;
    }

    setDraftMobile(
      DASHBOARD_LAYOUT_DEFAULTS.mobile.filter((id) =>
        visibleMobileIds.includes(id),
      ),
    );
  };

  const handleSave = () => {
    onSave({
      desktop: draftDesktop,
      mobile: draftMobile,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      PaperProps={{
        sx: isMobile
          ? {
              width: "100%",
              maxWidth: "100%",
              m: 0,
              mt: "auto",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              height: "80vh",
              maxHeight: "80vh",
              bgcolor: "rgba(16,16,16,0.82)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
            }
          : {
              width: "min(520px, calc(100vw - 32px))",
              maxWidth: "520px",
              borderRadius: 5,
              bgcolor: "rgba(16,16,16,0.8)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
            },
      }}
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(0,0,0,0.28)",
          backdropFilter: "blur(8px)",
        },
      }}
    >
      <DialogContent
        sx={{
          px: { xs: 2, md: 2.25 },
          pt: { xs: 1.5, md: 2 },
          pb: { xs: 12, md: 11 },
          overflowY: "auto",
        }}
      >
        <Stack spacing={2}>
          {isMobile && (
            <Box
              sx={{
                width: 44,
                height: 5,
                borderRadius: 999,
                mx: "auto",
                bgcolor: "rgba(255,255,255,0.18)",
              }}
            />
          )}

          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h6" fontWeight={800}>
                Customize Layout
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Drag blocks to preview your dashboard instantly.
              </Typography>
            </Box>
            <AnimatePresence initial={false}>
              {hasUnsavedChanges && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  <Box
                    sx={{
                      px: 1.25,
                      py: 0.75,
                      borderRadius: "999px",
                      bgcolor: "rgba(91,163,224,0.16)",
                      border: "1px solid rgba(91,163,224,0.35)",
                      color: "#cfe7ff",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                    }}
                  >
                    <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={700}>
                      Unsaved Changes
                    </Typography>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>
          </Stack>

          <Box
            sx={{
              p: 0.5,
              borderRadius: "999px",
              bgcolor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "inline-flex",
              gap: 0.5,
              alignSelf: "flex-start",
            }}
          >
            <LayoutChip
              active={activeTab === "desktop"}
              onClick={() => setActiveTab("desktop")}
            >
              Desktop Layout
            </LayoutChip>
            <LayoutChip
              active={activeTab === "mobile"}
              onClick={() => setActiveTab("mobile")}
            >
              Mobile Layout
            </LayoutChip>
          </Box>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {currentItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {emptyMessage}
                </Typography>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDragCancel={handleDragCancel}
                >
                  <SortableContext
                    items={currentItems}
                    strategy={verticalListSortingStrategy}
                  >
                    <Stack spacing={{ xs: 1.4, md: 1.15 }}>
                      {currentItems.map((widgetId) => (
                        <SortableRow key={widgetId} id={widgetId} />
                      ))}
                    </Stack>
                  </SortableContext>
                  <DragOverlay>
                    {activeId ? <LayoutRowCard id={activeId} dragging /> : null}
                  </DragOverlay>
                </DndContext>
              )}
            </motion.div>
          </AnimatePresence>
        </Stack>
      </DialogContent>

      <Box
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: isMobile ? 12 : 16,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          px: 2,
        }}
      >
        <Box
          sx={{
            pointerEvents: "auto",
            width: "fit-content",
            maxWidth: "100%",
            px: 1,
            py: 1,
            borderRadius: "999px",
            bgcolor: "rgba(17,17,17,0.88)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          }}
        >
          <Stack direction="row" spacing={1} flexWrap="nowrap">
            <Button
              onClick={handleReset}
              sx={{ borderRadius: "999px", px: 2, textTransform: "none" }}
            >
              Reset
            </Button>
            <Button
              onClick={onClose}
              sx={{ borderRadius: "999px", px: 2, textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              sx={{ borderRadius: "999px", px: 2.5, textTransform: "none" }}
            >
              Save
            </Button>
          </Stack>
        </Box>
      </Box>
    </Dialog>
  );
}
