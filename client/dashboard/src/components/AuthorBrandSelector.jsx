import { useMemo } from 'react';
import { Card, CardContent, Stack, Typography, Autocomplete, TextField, Button, Chip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorefrontIcon from '@mui/icons-material/Storefront';

const dtFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function AuthorBrandSelector({
  brands,
  value,
  onChange,
  loading = false,
  lastLoadedAt = null,
  onRefresh,
}) {
  const options = useMemo(() => (Array.isArray(brands) ? brands : []).map((b) => ({
    label: b.key,
    value: b.key,
    host: b.host,
    db: b.db,
  })), [brands]);

  const selected = value ? options.find((opt) => opt.value === value) || null : null;

  const infoLines = selected ? [
    selected.host ? `DB host: ${selected.host}` : null,
    selected.db ? `Database: ${selected.db}` : null,
  ].filter(Boolean) : [];

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Stack spacing={0.75} flex={1} minWidth={0}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <StorefrontIcon fontSize="small" color="primary" />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {selected ? selected.label : 'Select a brand to explore data'}
              </Typography>
            </Stack>
            {selected ? (
              <Stack spacing={0.5} sx={{ pl: 3 }}>
                {infoLines.length ? (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" rowGap={0.5}>
                    {infoLines.map((line) => (
                      <Chip key={line} size="small" label={line} sx={{ bgcolor: 'action.hover' }} />
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ pl: 0.5 }}>
                    No connection metadata available.
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
                  Last refreshed: {lastLoadedAt ? dtFormatter.format(lastLoadedAt) : 'Not loaded yet'}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ pl: 3 }}>
                Pick a brand to load KPIs and sales trends. Your selection is remembered for next time.
              </Typography>
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ minWidth: { sm: 280, md: 320 } }}>
            <Autocomplete
              fullWidth
              size="small"
              options={options}
              getOptionLabel={(opt) => opt.label}
              isOptionEqualToValue={(opt, val) => opt.value === val.value}
              value={selected}
              loading={loading}
              onChange={(event, newValue) => {
                if (typeof onChange === 'function') {
                  onChange(newValue ? newValue.value : '');
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Switch brand"
                  placeholder={loading ? 'Loading…' : 'Search brand key'}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: params.InputProps.endAdornment,
                  }}
                />
              )}
              noOptionsText={loading ? 'Loading…' : 'No brands found'}
              disabled={loading || !options.length}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshIcon fontSize="small" />}
              onClick={() => { if (typeof onRefresh === 'function') onRefresh(); }}
              disabled={loading || !selected}
            >
              Reload data
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
