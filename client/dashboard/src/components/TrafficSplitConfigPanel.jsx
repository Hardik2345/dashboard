import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Stack,
  Box,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
  Chip,
  IconButton,
  Divider,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

const MATCH_OPTIONS = [
  { value: "starts_with", label: "Starts with" },
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals to" },
];

const BUCKET_OPTIONS = [
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google" },
  { value: "direct", label: "Direct" },
  { value: "others", label: "Others" },
];

const normalize = (value) => String(value || "").trim().toLowerCase();

export default function TrafficSplitConfigPanel({
  rules = [],
  onAddRule,
  onRemoveRule,
  onClearRules,
}) {
  const [form, setForm] = useState({
    matchType: "contains",
    pattern: "",
    bucket: "others",
  });

  const normalizedPattern = normalize(form.pattern);

  const conflict = useMemo(() => {
    if (!normalizedPattern) return null;
    const exactMatcher = rules.find(
      (r) =>
        normalize(r?.matchType) === normalize(form.matchType) &&
        normalize(r?.pattern) === normalizedPattern,
    );

    if (!exactMatcher) return null;

    if (normalize(exactMatcher.bucket) === normalize(form.bucket)) {
      return {
        type: "duplicate",
        message:
          "This exact matcher is already configured for the same bucket.",
      };
    }

    return {
      type: "conflict",
      message:
        "Conflict detected: the same match condition already points to a different bucket.",
    };
  }, [rules, form.matchType, form.bucket, normalizedPattern]);

  const canSet = normalizedPattern.length > 0 && !conflict;

  const handleSetRule = () => {
    if (!canSet) return;
    onAddRule?.({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      matchType: form.matchType,
      pattern: normalizedPattern,
      bucket: form.bucket,
      createdAt: new Date().toISOString(),
    });
    setForm((prev) => ({ ...prev, pattern: "" }));
  };

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.05rem" }}>
              Traffic Split Config
            </Typography>
            <Typography variant="caption" color="text.secondary">
              User rules run first. Then default mapping runs for unmatched sources.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems="stretch">
            <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 150 } }}>
              <Select
                value={form.matchType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, matchType: e.target.value }))
                }
              >
                {MATCH_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              fullWidth
              placeholder="Source pattern (e.g. insta, google, direct)"
              value={form.pattern}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, pattern: e.target.value }))
              }
            />

            <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 140 } }}>
              <Select
                value={form.bucket}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, bucket: e.target.value }))
                }
              >
                {BUCKET_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              onClick={handleSetRule}
              disabled={!canSet}
              sx={{ minWidth: 96 }}
            >
              Set
            </Button>
          </Stack>

          {!normalizedPattern && (
            <Typography variant="caption" color="text.secondary">
              Enter a source pattern to add a mapping rule.
            </Typography>
          )}

          {conflict && (
            <Alert severity={conflict.type === "conflict" ? "error" : "warning"}>
              {conflict.message}
            </Alert>
          )}

          <Divider />

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2" fontWeight={700}>
              Active Rules ({rules.length})
            </Typography>
            <Button
              size="small"
              color="inherit"
              onClick={() => onClearRules?.()}
              disabled={!rules.length}
            >
              Clear all
            </Button>
          </Stack>

          {!rules.length ? (
            <Typography variant="body2" color="text.secondary">
              No custom rules yet.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {rules.map((rule) => (
                <Box
                  key={rule.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    px: 1,
                    py: 0.75,
                    gap: 1,
                  }}
                >
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                    <Chip
                      size="small"
                      label={MATCH_OPTIONS.find((x) => x.value === rule.matchType)?.label || rule.matchType}
                    />
                    <Chip size="small" variant="outlined" label={rule.pattern} />
                    <Typography variant="caption" color="text.secondary">
                      {"->"}
                    </Typography>
                    <Chip
                      size="small"
                      color="primary"
                      label={BUCKET_OPTIONS.find((x) => x.value === rule.bucket)?.label || rule.bucket}
                    />
                  </Stack>
                  <IconButton size="small" onClick={() => onRemoveRule?.(rule.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
