import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Popover,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditNoteIcon from "@mui/icons-material/EditNote";
import dayjs from "dayjs";
import { FunnelSingleDatePicker } from "./DailyFunnelPanel.jsx";
import {
  deleteDailyInsight,
  getDailyInsight,
  saveDailyInsight,
} from "../lib/api.js";

// Mirrors the backend's configured INSIGHT_CHAR_LIMIT.
const INSIGHT_CHAR_LIMIT = 500;

export default function DailyInsightsEditor({ brandKey, initialDate, onSaved }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [editDate, setEditDate] = useState(
    () => initialDate || dayjs().format("YYYY-MM-DD"),
  );
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const open = Boolean(anchorEl);

  const loadForDate = useCallback(
    (date) => {
      if (!brandKey || !date) return;
      setLoading(true);
      setError(null);
      getDailyInsight({ brandKey, date }).then((res) => {
        setLoading(false);
        if (res.error) {
          setError("Failed to load insight for this date");
          return;
        }
        setText(res.data?.insight || "");
      });
    },
    [brandKey],
  );

  useEffect(() => {
    if (open) loadForDate(editDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDateChange = (nextDate) => {
    const formatted = nextDate.format("YYYY-MM-DD");
    setEditDate(formatted);
    loadForDate(formatted);
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Insight cannot be empty");
      return;
    }
    if (trimmed.length > INSIGHT_CHAR_LIMIT) {
      setError(`Insight must be ${INSIGHT_CHAR_LIMIT} characters or fewer`);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveDailyInsight({
      brandKey,
      date: editDate,
      insight: trimmed,
    });
    setSaving(false);
    if (res.error) {
      setError(res.data?.error || "Failed to save insight");
      return;
    }
    setNotice("Insight saved");
    setAnchorEl(null);
    if (typeof onSaved === "function") {
      onSaved({ date: editDate, insight: trimmed });
    }
  };

  const handleDelete = async () => {
    if (!editDate) return;
    setDeleting(true);
    setError(null);
    const res = await deleteDailyInsight({ brandKey, date: editDate });
    setDeleting(false);
    if (res.error) {
      setError(res.data?.error || "Failed to remove insight");
      return;
    }
    setText("");
    setNotice("Insight removed");
    setAnchorEl(null);
    if (typeof onSaved === "function") {
      onSaved({ date: editDate, insight: "", deleted: true });
    }
  };

  return (
    <>
      <Tooltip title="Edit Daily Insight">
        <IconButton
          size="small"
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <EditNoteIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 2, width: 380 } } }}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle2">Daily Insights</Typography>

          <FunnelSingleDatePicker date={editDate} onApply={handleDateChange} />

          {error ? <Alert severity="error">{error}</Alert> : null}

          <TextField
            multiline
            minRows={4}
            maxRows={10}
            fullWidth
            placeholder="Write today's business insight..."
            value={text}
            onChange={(event) =>
              setText(event.target.value.slice(0, INSIGHT_CHAR_LIMIT))
            }
            disabled={loading}
            slotProps={{ htmlInput: { maxLength: INSIGHT_CHAR_LIMIT } }}
          />

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography
              variant="caption"
              color={
                text.length >= INSIGHT_CHAR_LIMIT
                  ? "error"
                  : "text.secondary"
              }
            >
              {text.length}/{INSIGHT_CHAR_LIMIT}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Button
              variant="text"
              color="error"
              size="small"
              startIcon={<DeleteOutlineIcon />}
              onClick={handleDelete}
              disabled={deleting || saving || loading || !text.trim()}
            >
              {deleting ? "Removing..." : "Remove Insight"}
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleSave}
              disabled={saving || deleting || loading}
            >
              {saving ? "Saving..." : "Save Insight"}
            </Button>
          </Box>
        </Stack>
      </Popover>

      <Snackbar
        open={!!notice}
        autoHideDuration={3000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setNotice(null)}
          severity="success"
          variant="filled"
          sx={{ width: "100%" }}
        >
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
