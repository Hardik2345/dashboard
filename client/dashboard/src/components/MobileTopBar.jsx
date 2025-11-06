import { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Chip, Tooltip } from '@mui/material';
import { Popover, DatePicker } from '@shopify/polaris';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getLastUpdatedPTS } from '../lib/api.js';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(customParseFormat);

export default function MobileTopBar({ value, onChange }) {
  const [start, end] = value || [];
  const [popoverActive, setPopoverActive] = useState(false);
  const [month, setMonth] = useState((end || start || dayjs()).month());
  const [year, setYear] = useState((end || start || dayjs()).year());
  const [last, setLast] = useState({ loading: true, ts: null, tz: null });

  useEffect(() => {
    let cancelled = false;
    getLastUpdatedPTS().then(r => {
      if (cancelled) return;
      let parsed = null;
      if (r.raw) {
        const cleaned = r.raw.replace(/ IST$/,'').trim();
        const formats = ['YYYY-MM-DD hh:mm:ss A','YYYY-MM-DD HH:mm:ss','YYYY-MM-DD hh:mm A'];
        for (const f of formats) {
          const d = dayjs(cleaned, f, true);
          if (d.isValid()) { parsed = d; break; }
        }
      }
      setLast({ loading: false, ts: parsed, tz: r.timezone || null });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const focus = end || start;
    if (focus) { setMonth(focus.month()); setYear(focus.year()); }
  }, [start, end]);

  const selectedRange = useMemo(() => {
    if (!start && !end) return undefined;
    const s = start ? start.startOf('day').toDate() : undefined;
    const effectiveEnd = end || start;
    const e = effectiveEnd ? effectiveEnd.startOf('day').toDate() : undefined;
    if (!s || !e) return undefined;
    return { start: s, end: e };
  }, [start, end]);

  const dateLabel = useMemo(() => {
    if (start && end) {
      const same = start.isSame(end, 'day');
      if (same) return start.format('DD MMM YYYY');
      return `${start.format('DD MMM YYYY')} – ${end.format('DD MMM YYYY')}`;
    }
    if (start) return start.format('DD MMM YYYY');
    return 'Select dates';
  }, [start, end]);

  const togglePopover = useCallback(() => setPopoverActive(p => !p), []);
  const handleClose = useCallback(() => setPopoverActive(false), []);
  const handleMonthChange = useCallback((m, y) => { setMonth(m); setYear(y); }, []);
  const handleRangeChange = useCallback(({ start: ns, end: ne }) => {
    const s = ns ? dayjs(ns).startOf('day') : null;
    const e = ne ? dayjs(ne).startOf('day') : null;
    const focus = e || s;
    if (focus) { setMonth(focus.month()); setYear(focus.year()); }
    if (s && e && s.isAfter(e)) { onChange([e, s]); return; }
    if (s && !e) { onChange([s, s]); return; }
    onChange([s, e ?? s ?? null]);
  }, [onChange]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.5 }}>
      {last.loading ? (
        <Chip size="small" label="Updating…" sx={{ bgcolor: 'grey.100' }} />
      ) : last.ts ? (
        <Tooltip title={last.ts.format('YYYY-MM-DD HH:mm:ss')} arrow>
          <Chip size="small" variant="outlined" label={`Updated ${last.ts.fromNow()}`} sx={{ borderRadius: 1 }} />
        </Tooltip>
      ) : (
        <Chip size="small" variant="outlined" label="Updated: unavailable" />
      )}

      <Popover
        active={popoverActive}
        activator={
          <Chip
            size="small"
            color="primary"
            clickable
            onClick={togglePopover}
            label={dateLabel}
            sx={{ color: 'white', borderRadius: 1 }}
          />
        }
        onClose={handleClose}
        fullWidth={false}
        preferInputActivator={false}
        preferredAlignment="center"
      >
        <div style={{ padding: 12 }}>
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
    </Box>
  );
}
