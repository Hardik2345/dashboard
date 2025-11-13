import { useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorefrontIcon from '@mui/icons-material/Storefront';

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

  const infoLines = selected
    ? [
        selected.host ? `DB host: ${selected.host}` : null,
        selected.db ? `Database: ${selected.db}` : null,
      ].filter(Boolean)
    : [];

  const [detailsOpen, setDetailsOpen] = useState(true);

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 1.75, md: 2.5 }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Stack spacing={1.25} flex={1} minWidth={0}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              width="100%"
              gap={1}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <StorefrontIcon fontSize="small" color="primary" />
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, fontSize: { xs: '1rem', md: '1.1rem' } }}
                >
                  {selected ? selected.label : 'Select a brand to explore data'}
                </Typography>
              </Stack>
              <IconButton
                size="small"
                onClick={() => setDetailsOpen((prev) => !prev)}
                aria-label={detailsOpen ? 'Collapse brand controls' : 'Expand brand controls'}
              >
                {detailsOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>
            <Collapse in={detailsOpen} timeout="auto" unmountOnExit>
              <Stack spacing={{ xs: 1.25, md: 1.5 }}>
                {selected ? (
                  <Stack spacing={0.75} sx={{ pl: { xs: 0.5, md: 3 } }}>
                    {infoLines.length ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" rowGap={0.5}>
                        {infoLines.map((line) => (
                          <Chip
                            key={line}
                            size="small"
                            label={line}
                            sx={{
                              bgcolor: 'action.hover',
                              fontSize: '0.7rem',
                              height: 24,
                              '& .MuiChip-label': { px: 1 },
                            }}
                          />
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
                  <Typography variant="body2" color="text.secondary" sx={{ pl: { xs: 0.5, md: 3 } }}>
                    Pick a brand to load KPIs and sales trends. Your selection is remembered for next time.
                  </Typography>
                )}

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 1, sm: 1.25 }}
                  alignItems="stretch"
                  sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 320, md: 360 } }}
                >
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
                        InputLabelProps={{ shrink: true }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            height: { xs: 40, sm: 42 },
                            '& .MuiAutocomplete-input': {
                              py: 0,
                            },
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
                  />
                  <Button
                    variant="contained"
                    color="primary"
                    disableElevation
                    startIcon={<RefreshIcon fontSize="small" />}
                    onClick={() => {
                      if (typeof onRefresh === 'function') onRefresh();
                    }}
                    disabled={loading || !selected}
                    sx={{
                      width: { xs: '100%', sm: 'auto' },
                      whiteSpace: 'nowrap',
                      px: { xs: 2, sm: 2.5 },
                      borderRadius: 2,
                      fontWeight: 600,
                      height: { xs: 40, sm: 42 },
                      minWidth: { sm: 150 },
                      alignSelf: { xs: 'stretch', sm: 'center' },
                      '& .MuiButton-startIcon': {
                        marginRight: 1,
                      },
                    }}
                  >
                    Reload data
                  </Button>
                </Stack>
              </Stack>
            </Collapse>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
