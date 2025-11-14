import { useMemo } from 'react';
import {
  Autocomplete,
  Box,
  Chip,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';

const dtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function AuthorBrandSelector({
  brands,
  value,
  onChange,
  loading = false,
  lastLoadedAt = null,
  onRefresh,
}) {
  const theme = useTheme();

  const options = useMemo(
    () =>
      (Array.isArray(brands) ? brands : []).map((b) => ({
        label: b.key,
        value: b.key,
        host: b.host,
        db: b.db,
      })),
    [brands]
  );

  const selected = value ? options.find((opt) => opt.value === value) || null : null;

  const infoChips = selected
    ? [
        selected.host ? `Host: ${selected.host}` : null,
        selected.db ? `DB: ${selected.db}` : null,
      ].filter(Boolean)
    : [];

  const hintColor = alpha(theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.6 : 0.7);

  return (
    <Box
      sx={{
        borderRadius: 3,
    border: '1px solid',
    borderColor: 'divider',
    p: 2,
    bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.9 : 0.98),
        boxShadow: theme.palette.mode === 'dark'
          ? `0 12px 24px ${alpha(theme.palette.common.black, 0.28)}`
          : `0 10px 30px ${alpha(theme.palette.primary.main, 0.07)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Stack spacing={1.5} alignItems="stretch">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Stack spacing={0.25} minWidth={0} flex={1}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
              Active brand
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <StorefrontOutlinedIcon fontSize="small" color={selected ? 'primary' : 'disabled'} />
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: selected ? 'text.primary' : 'text.secondary',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selected ? selected.label : 'Select brand'}
              </Typography>
            </Stack>
          </Stack>
          <Tooltip title="Reload data" placement="left">
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  if (typeof onRefresh === 'function') onRefresh();
                }}
                disabled={loading || !selected}
                aria-label="Reload brand data"
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Autocomplete
          size="small"
          options={options}
          value={selected}
          loading={loading}
          getOptionLabel={(opt) => opt.label}
          isOptionEqualToValue={(opt, val) => opt.value === val.value}
          onChange={(event, newValue) => {
            if (typeof onChange === 'function') {
              onChange(newValue ? newValue.value : '');
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Switch brand"
              placeholder={loading ? 'Loading brands…' : 'Search brand key'}
              InputLabelProps={{ shrink: true }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '& fieldset': { borderColor: 'divider' },
                  '&:hover fieldset': { borderColor: 'text.secondary' },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                },
              }}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {params.InputProps.endAdornment}
                  </Box>
                ),
              }}
            />
          )}
          noOptionsText={loading ? 'Loading…' : 'No brands found'}
          disabled={loading || !options.length}
          clearOnEscape
        />

        <Stack spacing={0.5} minHeight={32}>
          {infoChips.length ? (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" rowGap={0.5}>
              {infoChips.map((chip) => (
                <Chip
                  key={chip}
                  size="small"
                  label={chip}
                  sx={{
                    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.12),
                    color: theme.palette.mode === 'dark'
                      ? theme.palette.primary.light
                      : theme.palette.primary.dark,
                    '& .MuiChip-label': { px: 1, fontSize: '0.7rem', fontWeight: 500 },
                  }}
                />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color={hintColor}>
              Connection metadata will appear after selecting a brand.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Last refreshed: {lastLoadedAt ? dtFormatter.format(lastLoadedAt) : 'Not loaded yet'}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
