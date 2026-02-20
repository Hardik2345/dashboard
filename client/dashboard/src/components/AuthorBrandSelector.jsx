import { useMemo } from 'react';
import {
  Autocomplete,
  Box,
  TextField,
} from '@mui/material';

export default function AuthorBrandSelector({
  brands,
  value,
  onChange,
  loading = false,
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 140 }}>
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
                height: 32,
                bgcolor: 'background.paper',
                '& .MuiAutocomplete-input': {
                  py: 0,
                  fontSize: '0.8125rem',
                },
              },
            }}
          />
        )}
        noOptionsText={loading ? 'Loading…' : 'No brands'}
        disabled={loading || !options.length}
      />
    </Box>
  );
}
