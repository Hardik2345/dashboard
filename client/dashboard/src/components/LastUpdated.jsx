import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Skeleton, Stack, Tooltip, Chip } from '@mui/material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getLastUpdatedPTS } from '../lib/api.js';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(customParseFormat);

export default function LastUpdated() {
  const [state, setState] = useState({ loading: true, error: false, ts: null, tz: null });

  useEffect(() => {
    let cancel = false;
    setState(s => ({ ...s, loading: true }));
    getLastUpdatedPTS().then(r => {
      if (cancel) return;
      let parsed = null;
      if (r.raw) {
        // Expected format: "YYYY-MM-DD HH:mm:ss AM/PM" (maybe with timezone word at end)
        const cleaned = r.raw.replace(/ IST$/,'').trim();
        const formats = [
          'YYYY-MM-DD hh:mm:ss A',
          'YYYY-MM-DD HH:mm:ss',
          'YYYY-MM-DD hh:mm A'
        ];
        for (const f of formats) {
          const d = dayjs(cleaned, f, true);
            if (d.isValid()) { parsed = d; break; }
        }
      }
      setState({ loading: false, error: r.error || !parsed, ts: parsed, tz: r.timezone });
    });
    return () => { cancel = true; };
  }, []);

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ py: 1.5 }}>
        {state.loading ? (
          <Skeleton variant="text" width={220} />
        ) : state.error || !state.ts ? (
          <Typography variant="body2" color="text.secondary">Last update: unavailable</Typography>
        ) : (
          <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">Last updated:</Typography>
            <Tooltip title={state.ts.format('YYYY-MM-DD HH:mm:ss')} arrow>
              <Chip size="small" color="default" label={state.ts.format('DD MMM YYYY, HH:mm')} sx={{ fontWeight: 500 }} />
            </Tooltip>
            <Typography variant="caption" color="text.secondary">({state.ts.fromNow()} {state.tz || ''})</Typography>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
