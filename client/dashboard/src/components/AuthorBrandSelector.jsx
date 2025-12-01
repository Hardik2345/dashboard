import { useMemo } from 'react';
import {
  Autocomplete,
  Box,
  IconButton,
  TextField,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

export default function AuthorBrandSelector({
  brands,
  value,
  onChange,
  loading = false,
  onRefresh,
}) {
  const options = useMemo(
    () =>
      (Array.isArray(brands) ? brands : []).map((b) => ({
        label: b.key,
        value: b.key,
      })),
    [brands]
  );

  const selected = value ? options.find((opt) => opt.value === value) || null : null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 280 }}>
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
            placeholder={loading ? 'Loading…' : 'Select brand'}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1.5,
                height: 36,
                bgcolor: 'background.paper',
                '& .MuiAutocomplete-input': {
                  py: 0,
                  fontSize: '0.875rem',
                },
              },
            }}
          />
        )}
        noOptionsText={loading ? 'Loading…' : 'No brands'}
        disabled={loading || !options.length}
      />
      <IconButton
        size="small"
        onClick={() => {
          if (typeof onRefresh === 'function') onRefresh();
        }}
        disabled={loading || !selected}
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          '&:hover': { bgcolor: 'primary.dark' },
          '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
          width: 36,
          height: 36,
        }}
        aria-label="Reload data"
      >
        <RefreshIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
