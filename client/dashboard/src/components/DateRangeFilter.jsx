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
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : false);

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

  // Track desktop vs mobile to show presets on larger screens only
  useEffect(() => {
    function onResize() {
      setIsDesktop(window.innerWidth >= 1024);
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
            fullWidth={false}
            onClose={handleClose}
            preferInputActivator={false}
            preferredAlignment="center"
            sectioned={false}
          >
            <div
              style={{
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxSizing: 'border-box',
                width: 'clamp(320px, 90vw, 560px)',
                minWidth: 'clamp(320px, 90vw, 320px)',
                maxWidth: 'clamp(320px, 90vw, 560px)',
                maxHeight: '70vh',
                overflowX: 'hidden',
                overflowY: 'auto'
              }}
            >
              {/* Presets row visible on desktop */}
              {isDesktop && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <Button
                    onClick={() => {
                      const today = dayjs().startOf('day');
                      onChange([today, today]);
                      setMonth(today.month());
                      setYear(today.year());
                      setPopoverActive(false);
                    }}
                    variant={start && end && start.isSame(dayjs().startOf('day'), 'day') && end.isSame(dayjs().startOf('day'), 'day') ? 'primary' : 'secondary'}
                  >
                    Today
                  </Button>

                  <Button
                    onClick={() => {
                      const yesterday = dayjs().subtract(1, 'day').startOf('day');
                      onChange([yesterday, yesterday]);
                      setMonth(yesterday.month());
                      setYear(yesterday.year());
                      setPopoverActive(false);
                    }}
                    variant={start && end && start.isSame(dayjs().subtract(1, 'day').startOf('day'), 'day') && end.isSame(dayjs().subtract(1, 'day').startOf('day'), 'day') ? 'primary' : 'secondary'}
                  >
                    Yesterday
                  </Button>

                  <Button
                    onClick={() => {
                      const endD = dayjs().startOf('day');
                      const startD = dayjs().subtract(29, 'day').startOf('day');
                      onChange([startD, endD]);
                      setMonth(endD.month());
                      setYear(endD.year());
                      setPopoverActive(false);
                    }}
                    variant={start && end && start.isSame(dayjs().subtract(29, 'day').startOf('day'), 'day') && end.isSame(dayjs().startOf('day'), 'day') ? 'primary' : 'secondary'}
                  >
                    Last 30 days
                  </Button>
                </div>
              )}

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
