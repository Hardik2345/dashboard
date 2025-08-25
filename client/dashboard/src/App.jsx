import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Stack, Divider, Alert } from '@mui/material';
import Header from './components/Header.jsx';
import DateRangeFilter from './components/DateRangeFilter.jsx';
import KPIs from './components/KPIs.jsx';
import FunnelChart from './components/FunnelChart.jsx';
import OrderSplit from './components/OrderSplit.jsx';
import LastUpdated from './components/LastUpdated.jsx';

function formatDate(dt) {
  return dt ? dayjs(dt).format('YYYY-MM-DD') : undefined;
}

function defaultRangeYesterdayToday() {
  const end = dayjs();
  const start = dayjs().subtract(1, 'day');
  return [start, end];
}

export default function App() {
  const [range, setRange] = useState(defaultRangeYesterdayToday());
  const [start, end] = range;

  const query = useMemo(() => ({ start: formatDate(start), end: formatDate(end) }), [start, end]);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: 'light',
      primary: { main: '#0b6bcb' },
      background: { default: '#f9fafb', paper: '#ffffff' }
    },
    shape: { borderRadius: 12 },
  }), []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
        <Header />
        <Container maxWidth="sm" sx={{ py: 2 }}>
          <Stack spacing={2}>
            <DateRangeFilter value={range} onChange={setRange} />
            <LastUpdated />
            <KPIs query={query} />
            <Divider textAlign="left">Funnel</Divider>
            <FunnelChart query={query} />
            <OrderSplit query={query} />
            <Alert severity="info" sx={{ display: { xs: 'flex', sm: 'none' } }}>
              Tip: Rotate for a wider chart.
            </Alert>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
