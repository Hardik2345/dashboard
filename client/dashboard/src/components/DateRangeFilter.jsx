import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Stack, Typography } from '@mui/material';
import { Button, DatePicker, Popover } from '@shopify/polaris';
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

  const activator = (
    <div style={{ width: '100%' }}>
      <Button onClick={togglePopover} disclosure fullWidth variant="secondary">
        {label}
      </Button>
    </div>
  );

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent sx={{ py: 1.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Stack spacing={0.75}>
          <Typography variant="body2" sx={{ fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Date range
          </Typography>
          <Popover
            active={popoverActive}
            activator={activator}
            fullWidth
            onClose={handleClose}
            preferInputActivator={false}
            sectioned={false}
          >
            <div
              style={{
                padding: '12px',
                width: '100%',
                maxWidth: '360px',
                maxHeight: '70vh',
                display: 'flex',
                justifyContent: 'center',
                overflowX: 'hidden',
                overflowY: 'auto'
              }}
            >
              <DatePicker
                month={month}
                year={year}
                onChange={handleRangeChange}
                onMonthChange={handleMonthChange}
                selected={selectedRange}
                allowRange
              />
            </div>
          </Popover>
        </Stack>
      </CardContent>
    </Card>
  );
}
