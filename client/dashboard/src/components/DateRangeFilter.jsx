import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, Stack, Typography, List, ListItemButton, ListItemText, Divider, Box } from '@mui/material';
import { Button, DatePicker, Popover } from '@shopify/polaris';
import dayjs from 'dayjs';

const DATE_PRESETS = [
  { label: 'Today', getValue: () => [dayjs().startOf('day'), dayjs().startOf('day')] },
  { label: 'Yesterday', getValue: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').startOf('day')] },
  { label: 'Last 7 Days', getValue: () => [dayjs().subtract(6, 'day').startOf('day'), dayjs().startOf('day')] },
  { label: 'Last 30 Days', getValue: () => [dayjs().subtract(29, 'day').startOf('day'), dayjs().startOf('day')] },
];

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

  const handlePresetSelect = useCallback((preset) => {
    const [presetStart, presetEnd] = preset.getValue();
    setMonth(presetEnd.month());
    setYear(presetEnd.year());
    onChange([presetStart, presetEnd]);
  }, [onChange]);

  // Check which preset is currently active
  const activePreset = useMemo(() => {
    if (!start || !end) return null;
    return DATE_PRESETS.find((preset) => {
      const [presetStart, presetEnd] = preset.getValue();
      return start.isSame(presetStart, 'day') && end.isSame(presetEnd, 'day');
    })?.label || null;
  }, [start, end]);

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
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                maxHeight: '70vh',
                overflowY: 'auto',
              }}
            >
              {/* Presets Panel */}
              <Box
                sx={{
                  minWidth: 230,
                  borderRight: { sm: '1px solid #e0e0e0' },
                  borderBottom: { xs: '1px solid #e0e0e0', sm: 'none' },
                  py: 1,
                }}
              >
                <List dense disablePadding>
                  {DATE_PRESETS.map((preset) => (
                    <ListItemButton
                      key={preset.label}
                      selected={activePreset === preset.label}
                      onClick={() => handlePresetSelect(preset)}
                      sx={{
                        py: 0.75,
                        px: 2,
                        '&.Mui-selected': {
                          backgroundColor: 'primary.light',
                          color: 'primary.main',
                          fontWeight: 600,
                          '&:hover': {
                            backgroundColor: 'primary.light',
                          },
                        },
                      }}
                    >
                      <ListItemText
                        primary={preset.label}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: activePreset === preset.label ? 600 : 400,
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>

              {/* Calendar Panel */}
              <Box
                sx={{
                  p: 1.5,
                  display: 'flex',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  width: 'clamp(320px, 90vw, 360px)',
                  minWidth: 'clamp(320px, 90vw, 360px)',
                  maxWidth: 'clamp(320px, 90vw, 360px)',
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
              </Box>
            </Box>
          </Popover>
        </Stack>
      </CardContent>
    </Card>
  );
}
