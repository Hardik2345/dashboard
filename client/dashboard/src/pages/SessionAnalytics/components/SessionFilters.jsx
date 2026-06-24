import { useMemo } from "react";
import dayjs from "dayjs";
import {
  Autocomplete,
  Card,
  CardContent,
  FormControl,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";

const PRESETS = [
  { id: "today", label: "Today", getRange: () => [dayjs(), dayjs()] },
  { id: "yesterday", label: "Yesterday", getRange: () => [dayjs().subtract(1, "day"), dayjs().subtract(1, "day")] },
  { id: "last7", label: "Last 7 Days", getRange: () => [dayjs().subtract(6, "day"), dayjs()] },
  { id: "last30", label: "Last 30 Days", getRange: () => [dayjs().subtract(29, "day"), dayjs()] },
  { id: "custom", label: "Custom", getRange: null },
];

function toDateString(value) {
  return value ? dayjs(value).format("YYYY-MM-DD") : "";
}

export default function SessionFilters({
  filters,
  onChange,
  brandOptions = [],
  userOptions = [],
  loading = false,
}) {
  const selectedUser = useMemo(
    () => (filters.user ? userOptions.find((option) => option === filters.user) || filters.user : null),
    [filters.user, userOptions],
  );

  if (loading) {
    return <Skeleton variant="rounded" height={124} />;
  }

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <CardContent sx={{ p: { xs: 1.5, md: 2 }, "&:last-child": { pb: { xs: 1.5, md: 2 } } }}>
        <Stack spacing={2}>
          <ToggleButtonGroup
            value={filters.preset}
            exclusive
            onChange={(_event, nextValue) => {
              if (!nextValue) return;
              if (nextValue === "custom") {
                onChange({ preset: "custom" });
                return;
              }
              const preset = PRESETS.find((item) => item.id === nextValue);
              const [from, to] = preset.getRange();
              onChange({
                preset: nextValue,
                from: from.format("YYYY-MM-DD"),
                to: to.format("YYYY-MM-DD"),
                granularity: from.isSame(to, "day") ? "hourly" : "daily",
              });
            }}
            sx={{ flexWrap: "wrap", gap: 1 }}
          >
            {PRESETS.map((preset) => (
              <ToggleButton key={preset.id} value={preset.id} size="small">
                {preset.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <TextField
              size="small"
              label="From"
              type="date"
              value={toDateString(filters.from)}
              onChange={(event) =>
                onChange({
                  preset: "custom",
                  from: event.target.value,
                  granularity: event.target.value === filters.to ? "hourly" : filters.granularity,
                })
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              size="small"
              label="To"
              type="date"
              value={toDateString(filters.to)}
              onChange={(event) =>
                onChange({
                  preset: "custom",
                  to: event.target.value,
                  granularity: filters.from === event.target.value ? "hourly" : filters.granularity,
                })
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <Select
                displayEmpty
                value={filters.brand || ""}
                onChange={(event) => onChange({ brand: event.target.value })}
              >
                <MenuItem value="">All Brands</MenuItem>
                {brandOptions.map((brand) => (
                  <MenuItem key={brand} value={brand}>
                    {brand}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              options={userOptions}
              value={selectedUser}
              onChange={(_event, value) => onChange({ user: value || "" })}
              renderInput={(params) => <TextField {...params} size="small" label="User" />}
              fullWidth
              clearOnEscape
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
