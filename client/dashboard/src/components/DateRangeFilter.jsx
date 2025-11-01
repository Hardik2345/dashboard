import { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid2 as Grid, Paper, Typography } from '@mui/material';
import { ActionList, Button, DatePicker, Popover } from '@shopify/polaris';
import dayjs from 'dayjs';

export default function DateRangeFilter({ value, onChange }) {
  const [start, end] = value;
  const initialReference = end || start || dayjs();
  const [popoverActive, setPopoverActive] = useState(false);
  const [month, setMonth] = useState(initialReference.month());
  const [year, setYear] = useState(initialReference.year());

  useEffect(() => {
    if (start && end && start.isAfter(end)) {
      onChange([end, start]);
    }
  }, [start, end, onChange]);

  useEffect(() => {
    const focusDate = end || start;
    if (focusDate) {
      setMonth(focusDate.month());
      setYear(focusDate.year());
    }
  }, [start, end]);

  const selectedRange = useMemo(() => {
    if (!start && !end) return undefined;
    const rangeStart = start ? start.startOf('day').toDate() : undefined;
    const effectiveEnd = end || start;
    const rangeEnd = effectiveEnd ? effectiveEnd.startOf('day').toDate() : undefined;
    if (!rangeStart || !rangeEnd) return undefined;
    return { start: rangeStart, end: rangeEnd };
  }, [start, end]);

  const label = useMemo(() => {
    if (start && end) {
      const sameDay = start.isSame(end, 'day');
      if (sameDay) {
        return start.format('DD MMM YYYY');
      }
      return `${start.format('DD MMM YYYY')} – ${end.format('DD MMM YYYY')}`;
    }
    if (start) {
      return start.format('DD MMM YYYY');
    }
    return 'Select dates';
  }, [start, end]);

  const togglePopover = useCallback(() => {
    setPopoverActive((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setPopoverActive(false);
  }, []);

  const handleMonthChange = useCallback((newMonth, newYear) => {
    setMonth(newMonth);
    setYear(newYear);
  }, []);

  const handleRangeChange = useCallback(({ start: nextStart, end: nextEnd }) => {
    const startDay = nextStart ? dayjs(nextStart).startOf('day') : null;
    const endDay = nextEnd ? dayjs(nextEnd).startOf('day') : null;
    const focus = endDay || startDay;

    if (focus) {
      setMonth(focus.month());
      setYear(focus.year());
    }

    if (startDay && endDay && startDay.isAfter(endDay)) {
      onChange([endDay, startDay]);
      return;
    }

    if (startDay && !endDay) {
      onChange([startDay, startDay]);
      return;
    }

    onChange([startDay, endDay ?? startDay ?? null]);
  }, [onChange]);

  const presets = useMemo(() => ([
    {
      key: 'today',
      content: 'Today',
      range: () => {
        const today = dayjs().startOf('day');
        return { start: today, end: today };
      }
    },
    {
      key: 'yesterday',
      content: 'Yesterday',
      range: () => {
        const yesterday = dayjs().subtract(1, 'day').startOf('day');
        return { start: yesterday, end: yesterday };
      }
    }
  ]), []);

  const activePresetKey = useMemo(() => {
    if (!start || !end) return null;
    return presets.find(({ range }) => {
      const preset = range();
      return start.isSame(preset.start, 'day') && end.isSame(preset.end, 'day');
    })?.key ?? null;
  }, [presets, start, end]);

  const handlePreset = useCallback((rangeFn) => {
    const { start: presetStart, end: presetEnd } = rangeFn();
    onChange([presetStart, presetEnd]);
    setMonth(presetEnd.month());
    setYear(presetEnd.year());
  }, [onChange]);

  const activator = (
    <Grid container spacing={1} alignItems="center">
      <Grid size={{ xs: 12, sm: 6 }}>
        <div style={{ width: '100%' }}>
          <Button onClick={togglePopover} disclosure fullWidth variant="secondary">
            {label}
          </Button>
        </div>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <ActionList
          actionRole="menuitemradio"
          items={presets.map((preset) => ({
            id: preset.key,
            content: preset.content,
            active: preset.key === activePresetKey,
            onAction: () => handlePreset(preset.range)
          }))}
        />
      </Grid>
    </Grid>
  );

  return (
    <Paper elevation={0} sx={{ p: 1.5 }}>
      <Stack spacing={0.75}>
        <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
          Date range
        </Typography>
        <Popover active={popoverActive} activator={activator} fullWidth onClose={handleClose} preferInputActivator={false}>
          <div style={{ padding: '12px' }}>
            <DatePicker
              month={month}
              year={year}
              onChange={handleRangeChange}
              onMonthChange={handleMonthChange}
              selected={selectedRange}
              allowRange
              multiMonth
            />
          </div>
        </Popover>
      </Stack>
    </Paper>
  );
}
