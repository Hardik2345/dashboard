import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
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
import { motion } from "framer-motion";
import { DASHBOARD_WIDGET_LABELS } from "../lib/dashboardLayout.js";

function WidgetFrame({
  id,
  isEditing,
  dragging = false,
  setNodeRef,
  style,
  handleProps = {},
  children,
}) {
  const elevated = dragging;

  return (
    <Box
      ref={setNodeRef}
      sx={{
        width: "100%",
        position: "relative",
      }}
      style={style}
    >
      <motion.div
        layout
        initial={false}
        animate={{
          scale: elevated ? 1.012 : 1,
          boxShadow: elevated
            ? "0 22px 48px rgba(0,0,0,0.22)"
            : "0 0 0 rgba(0,0,0,0)",
        }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            pt: isEditing ? 2.25 : 0,
            borderRadius: isEditing ? "22px" : 0,
            outline: isEditing
              ? "1px solid rgba(91,163,224,0.26)"
              : "1px solid transparent",
            boxShadow: isEditing
              ? "0 0 0 1px rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.08)"
              : "none",
            background: isEditing
              ? "linear-gradient(180deg, rgba(91,163,224,0.06), rgba(255,255,255,0.02))"
              : "transparent",
            transition:
              "outline-color 180ms ease, box-shadow 180ms ease, background 180ms ease",
          }}
        >
          {isEditing && (
            <Box
              sx={{
                position: "absolute",
                top: 10,
                left: 10,
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                gap: 1,
                pr: 1.25,
                py: 0.6,
                pl: 0.8,
                borderRadius: "999px",
                bgcolor: "rgba(16,16,16,0.86)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(14px)",
                boxShadow: "0 12px 26px rgba(0,0,0,0.22)",
              }}
            >
              <Box
                {...handleProps}
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: "9px",
                  display: "grid",
                  placeItems: "center",
                  color: "text.secondary",
                  bgcolor: "rgba(255,255,255,0.08)",
                  cursor: "grab",
                  touchAction: "none",
                  "&:active": {
                    cursor: "grabbing",
                  },
                }}
              >
                <DragIndicatorIcon sx={{ fontSize: 17 }} />
              </Box>
              <Typography variant="caption" fontWeight={700} sx={{ lineHeight: 1 }}>
                {DASHBOARD_WIDGET_LABELS[id] || id}
              </Typography>
            </Box>
          )}

          <Box sx={{ pointerEvents: isEditing ? "none" : "auto" }}>
            {children}
          </Box>
        </Box>
      </motion.div>
    </Box>
  );
}

function SortableWidget({ id, isEditing, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditing });

  return (
    <WidgetFrame
      id={id}
      isEditing={isEditing}
      dragging={isDragging}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.24 : 1,
        zIndex: isDragging ? 20 : "auto",
      }}
      handleProps={{ ...attributes, ...listeners }}
    >
      {children}
    </WidgetFrame>
  );
}

export default function InlineDashboardLayoutEditor({
  isEditing,
  itemIds,
  renderWidget,
  extraAfterId,
  extras,
  onOrderChange,
  onSave,
  onCancel,
  onReset,
  isDirty,
  isSaving = false,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
  );

  const overlayNode = useMemo(() => {
    if (!activeId) return null;
    return (
      <WidgetFrame id={activeId} isEditing dragging>
        {renderWidget(activeId)}
      </WidgetFrame>
    );
  }, [activeId, renderWidget]);

  if (!isEditing) {
    return (
      <Stack spacing={{ xs: 1, md: 1 }}>
        {itemIds.flatMap((widgetId) => {
          const nodes = [
            <motion.div
              key={widgetId}
              layout
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              style={{ width: "100%" }}
            >
              {renderWidget(widgetId)}
            </motion.div>,
          ];

          if (extraAfterId === widgetId && extras) {
            nodes.push(
              <motion.div
                key={`${widgetId}-extras`}
                layout
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                style={{ width: "100%" }}
              >
                {extras}
              </motion.div>,
            );
          }

          return nodes;
        })}
      </Stack>
    );
  }

  const content = itemIds.flatMap((widgetId) => {
    const nodes = [
      <SortableWidget key={widgetId} id={widgetId} isEditing={isEditing}>
        {renderWidget(widgetId)}
      </SortableWidget>,
    ];

    if (extraAfterId === widgetId && extras) {
      nodes.push(
        <motion.div
          key={`${widgetId}-extras`}
          layout
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          style={{ width: "100%" }}
        >
          {extras}
        </motion.div>,
      );
    }

    return nodes;
  });

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={({ active, over }) => {
          setActiveId(null);
          if (!over || active.id === over.id) return;
          const oldIndex = itemIds.indexOf(active.id);
          const newIndex = itemIds.indexOf(over.id);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
            return;
          }
          onOrderChange(arrayMove(itemIds, oldIndex, newIndex));
        }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <Stack spacing={{ xs: 1.15, md: 1.2 }}>{content}</Stack>
        </SortableContext>
        <DragOverlay>{overlayNode}</DragOverlay>
      </DndContext>

      <Box
        sx={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: { xs: 90, md: 24 },
          zIndex: 1400,
          px: 2,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <Box
          sx={{
            pointerEvents: "auto",
            width: "fit-content",
            maxWidth: "calc(100vw - 24px)",
            px: 1.1,
            py: 1,
            borderRadius: "999px",
            bgcolor: "rgba(17,17,17,0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 24px 50px rgba(0,0,0,0.34)",
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="nowrap"
          >
            <Typography
              variant="caption"
              sx={{
                px: 1.2,
                py: 0.75,
                borderRadius: "999px",
                bgcolor: isDirty
                  ? "rgba(91,163,224,0.16)"
                  : "rgba(255,255,255,0.06)",
                color: isDirty ? "#cfe7ff" : "text.secondary",
                border: "1px solid",
                borderColor: isDirty
                  ? "rgba(91,163,224,0.32)"
                  : "rgba(255,255,255,0.08)",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {isDirty ? "Unsaved Changes" : "Edit Mode"}
            </Typography>
            <Button
              onClick={onReset}
              disabled={isSaving}
              sx={{ borderRadius: "999px", px: 2, textTransform: "none" }}
            >
              Reset
            </Button>
            <Button
              onClick={onCancel}
              disabled={isSaving}
              sx={{ borderRadius: "999px", px: 2, textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={onSave}
              disabled={isSaving}
              sx={{ borderRadius: "999px", px: 2.5, textTransform: "none" }}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </Stack>
        </Box>
      </Box>
    </>
  );
}
