import { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Card, Tooltip } from '@mui/material';
import { Popover, DatePicker } from '@shopify/polaris';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getLastUpdatedPTS } from '../lib/api.js';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(customParseFormat);

export default function MobileTopBar({ value, onChange, brandKey }) {
  const [start, end] = value || [];
  const [popoverActive, setPopoverActive] = useState(false);
  const [month, setMonth] = useState((end || start || dayjs()).month());
  const [year, setYear] = useState((end || start || dayjs()).year());
  const [last, setLast] = useState({ loading: true, ts: null, tz: null });

  useEffect(() => {
    let cancelled = false;
    const normalizedKey = (brandKey || '').toString().trim().toUpperCase();
    setLast({ loading: true, ts: null, tz: null });
    getLastUpdatedPTS(normalizedKey ? { brandKey: normalizedKey } : undefined).then(r => {
      if (cancelled) return;
      let parsed = null;
      const sources = [];
      if (r.iso) sources.push(r.iso);
      if (r.raw) sources.push(r.raw);
      for (const src of sources) {
        if (parsed) break;
        const cleaned = typeof src === 'string' ? src.replace(/ IST$/,'').trim() : src;
        if (!cleaned) continue;
        if (typeof cleaned === 'string') {
          const formats = ['YYYY-MM-DDTHH:mm:ss.SSSZ','YYYY-MM-DDTHH:mm:ssZ','YYYY-MM-DD hh:mm:ss A','YYYY-MM-DD HH:mm:ss','YYYY-MM-DD hh:mm A'];
          for (const f of formats) {
            const d = dayjs(cleaned, f, true);
            if (d.isValid()) { parsed = d; break; }
          }
          if (!parsed) {
            const auto = dayjs(cleaned);
            if (auto.isValid()) parsed = auto;
          }
        } else if (cleaned instanceof Date) {
          const auto = dayjs(cleaned);
          if (auto.isValid()) parsed = auto;
        }
      }
      setLast(prev => ({ loading: false, ts: parsed || prev.ts, tz: r.timezone || prev.tz || null }));
    }).catch(() => {
      if (cancelled) return;
      setLast(prev => ({ loading: false, ts: prev.ts, tz: prev.tz }));
    });
    return () => { cancelled = true; };
  }, [brandKey]);

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
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75, py: 0.25 }}>
      {last.loading ? (
        <Card elevation={0} sx={{  px: 0.75, height: 32, display: 'flex', alignItems: 'center', bgcolor: 'grey.50', fontSize: 13 }}>
          Updating…
        </Card>
      ) : last.ts ? (
        <Tooltip title={`${last.ts.format('YYYY-MM-DD HH:mm:ss')}${last.tz ? ` ${last.tz}` : ''}`} arrow>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', px: 0.75, height: 32, display: 'flex', alignItems: 'center', fontSize: 13 }}>
            Updated {last.ts.fromNow()}
          </Card>
        </Tooltip>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', px: 0.75, height: 32, display: 'flex', alignItems: 'center', fontSize: 13 }}>
          Updated: unavailable
        </Card>
      )}

      <Popover
        active={popoverActive}
        activator={
          <Card
            elevation={0}
            onClick={togglePopover}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                togglePopover();
              }
            }}
            sx={{
              px: 1,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              width: 'auto',
              maxWidth: { xs: 140, sm: 200 },
              textAlign: 'center',
              userSelect: 'none',
              fontSize: 13,
              '&:hover': { filter: 'brightness(0.98)' }
            }}
          >
            <span style={{ display: 'inline-block', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {dateLabel}
            </span>
          </Card>
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
