import { useEffect } from 'react';
import { Stack, TextField, Paper } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

export default function DateRangeFilter({ value, onChange }) {
  const [start, end] = value;
  useEffect(() => {
    // ensure start <= end
    if (start && end && dayjs(start).isAfter(dayjs(end))) {
      onChange([end, start]);
    }
  }, [start, end, onChange]);

  return (
    <Paper elevation={0} sx={{ p: 1.5 }}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Stack direction="row" spacing={1} alignItems="center">
          <DatePicker
            label="Start"
            value={start ? dayjs(start) : null}
            format="DD-MM-YYYY"
            onChange={(d) => onChange([d || null, end])}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
          <DatePicker
            label="End"
            value={end ? dayjs(end) : null}
            format="DD-MM-YYYY"
            onChange={(d) => onChange([start, d || null])}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />
        </Stack>
      </LocalizationProvider>
    </Paper>
  );
}
