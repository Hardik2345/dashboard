import { useMemo, useState } from "react";
import { Box, Button, Stack, Typography, Tooltip } from "@mui/material";
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

function WidgetFrame({
  isEditing,
  allowChildInteractions = false,
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
        overflow: "visible",
        isolation: "isolate",
        zIndex: elevated ? 8 : 1,
      }}
      style={style}
    >
      <Box
        sx={{
          position: "relative",
          width: "100%",
          pt: 0,
          borderRadius: "22px",
          boxShadow: elevated ? "0 24px 52px rgba(0,0,0,0.24)" : "none",
          transform: elevated ? "scale(1.01)" : "scale(1)",
          transition: "box-shadow 180ms ease, transform 180ms ease",
          willChange: "transform",
        }}
      >
        {isEditing && (
          <Tooltip title="Drag to reorder">
            <Box
              {...handleProps}
              sx={{
                position: "absolute",
                top: 10,
                right: 12,
                zIndex: 20,
                width: 28,
                height: 28,
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                color: "#dff1ff",
                bgcolor: "rgba(10,10,10,0.96)",
                border: "1px solid rgba(91,163,224,0.42)",
                backdropFilter: "blur(18px)",
                boxShadow: "0 14px 28px rgba(0,0,0,0.28)",
                cursor: "grab",
                touchAction: "none",
                "&:active": {
                  cursor: "grabbing",
                },
              }}
            >
              <DragIndicatorIcon sx={{ fontSize: 16 }} />
            </Box>
          </Tooltip>
        )}

        <Box
          sx={{
            pointerEvents:
              isEditing && !allowChildInteractions ? "none" : "auto",
          }}
        >
          <Box
            sx={{
              opacity: isEditing ? 0.6 : 1,
              transition: "opacity 160ms ease",
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
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
      isEditing={isEditing}
      allowChildInteractions={id === "kpi_cards"}
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
      <WidgetFrame isEditing dragging>
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
      <Box
        sx={{
          mb: { xs: 1, md: 1.25 },
          px: { xs: 1.35, md: 1.5 },
          py: 1,
          borderRadius: "18px",
          bgcolor: "rgba(91,163,224,0.1)",
          border: "1px solid rgba(91,163,224,0.24)",
          color: "text.primary",
          backdropFilter: "blur(14px)",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 0.25, sm: 1 }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
        >
          <Typography variant="subtitle2" fontWeight={800}>
            Layout Edit Mode Active
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Drag blocks using the top-left handle, then save or cancel.
          </Typography>
        </Stack>
      </Box>

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
              {isDirty ? "Unsaved Changes" : "Layout Mode"}
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
