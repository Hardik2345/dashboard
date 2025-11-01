import { useCallback, useEffect, useMemo, useState } from 'react';
import { Paper, Stack, Typography } from '@mui/material';
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

  const presetOptions = [
    {
      key: 'today',
      label: 'Today',
      getRange: () => {
        const today = dayjs().startOf('day');
        return { start: today, end: today };
      }
    },
    {
      key: 'yesterday',
      label: 'Yesterday',
      getRange: () => {
        const yesterday = dayjs().subtract(1, 'day').startOf('day');
        return { start: yesterday, end: yesterday };
      }
    }
  ];

  const currentPresetKey = start && end
    ? presetOptions.find(({ getRange }) => {
        const { start: presetStart, end: presetEnd } = getRange();
        return start.isSame(presetStart, 'day') && end.isSame(presetEnd, 'day');
      })?.key ?? null
    : null;

  const handlePresetSelect = useCallback((preset) => {
    const { start: presetStart, end: presetEnd } = preset.getRange();
    const startDay = dayjs(presetStart).startOf('day');
    const endDay = dayjs(presetEnd).startOf('day');
    onChange([startDay, endDay]);
    setMonth(endDay.month());
    setYear(endDay.year());
  }, [onChange]);

  const activator = (
    <div style={{ width: '100%' }}>
      <Button onClick={togglePopover} disclosure fullWidth variant="secondary">
        {label}
      </Button>
    </div>
  );

  return (
    <Paper elevation={0} sx={{ p: 1.5 }}>
      <Stack spacing={0.75}>
        <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
          Date range
        </Typography>
        <Popover active={popoverActive} activator={activator} fullWidth onClose={handleClose} preferInputActivator={false}>
          <div style={{ padding: '12px', width: '320px' }}>
            <Stack spacing={1.5}>
              <ActionList
                actionRole="menuitemradio"
                items={presetOptions.map((preset) => ({
                  content: preset.label,
                  onAction: () => handlePresetSelect(preset),
                  active: currentPresetKey === preset.key,
                  id: preset.key
                }))}
              />
              <DatePicker
                month={month}
                year={year}
                onChange={handleRangeChange}
                onMonthChange={handleMonthChange}
                selected={selectedRange}
                allowRange
                multiMonth
              />
            </Stack>
          </div>
        </Popover>
      </Stack>
    </Paper>
  );
}
