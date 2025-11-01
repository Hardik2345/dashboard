import { useMemo, useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Stack, Divider, Alert } from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import Header from './components/Header.jsx';
import AuthorBrandForm from './components/AuthorBrandForm.jsx';
import AuthorBrandList from './components/AuthorBrandList.jsx';
import DateRangeFilter from './components/DateRangeFilter.jsx';
import KPIs from './components/KPIs.jsx';
import FunnelChart from './components/FunnelChart.jsx';
import OrderSplit from './components/OrderSplit.jsx';
import PaymentSalesSplit from './components/PaymentSalesSplit.jsx';
import HourlySalesCompare from './components/HourlySalesCompare.jsx';
import LastUpdated from './components/LastUpdated.jsx';
import Footer from './components/Footer.jsx';
import { me, login, logout } from './lib/api.js';
import { TextField, Button, Paper, Typography } from '@mui/material';

function formatDate(dt) {
  return dt ? dayjs(dt).format('YYYY-MM-DD') : undefined;
}

function defaultRangeYesterdayToday() {
  const end = dayjs();
  const start = dayjs().subtract(1, 'day');
  return [start, end];
}

const RANGE_KEY = 'pts_date_range_v1';
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function loadInitialRange() {
  try {
    const raw = localStorage.getItem(RANGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.start && parsed.end && parsed.savedAt) {
        if (Date.now() - parsed.savedAt < TTL_MS) {
          return [dayjs(parsed.start), dayjs(parsed.end)];
        } else {
          localStorage.removeItem(RANGE_KEY);
        }
      }
    }
  } catch {}
  return defaultRangeYesterdayToday();
}

export default function App() {
  const [range, setRange] = useState(loadInitialRange);
  const [start, end] = range;
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const query = useMemo(() => ({ start: formatDate(start), end: formatDate(end) }), [start, end]);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: 'light',
      primary: { main: '#0b6bcb' },
      background: { default: '#f9fafb', paper: '#ffffff' }
    },
    shape: { borderRadius: 12 },
  }), []);

  // Persist when range changes
  useEffect(() => {
    if (start && end) {
      try {
        localStorage.setItem(RANGE_KEY, JSON.stringify({ start: start.toISOString(), end: end.toISOString(), savedAt: Date.now() }));
      } catch {}
    }
  }, [start, end]);

  // Check auth on mount
  useEffect(() => {
  me().then(r => { if (r.authenticated) setUser(r.user); setAuthChecked(true); });
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    const r = await login(loginForm.email, loginForm.password);
    setLoggingIn(false);
    if (r.error) {
      setLoginError(r.data?.error || 'Login failed');
    } else {
  setUser(r.data.user);
    }
  }

  function handleLogout() {
    logout();
    setUser(null);
  }

  if (!authChecked) return null;

  if (!user) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100svh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', p:2 }}>
          <Container maxWidth="xs">
            <Paper elevation={3} sx={{ p:3, borderRadius:3 }} component="form" onSubmit={handleLogin}>
              <Stack spacing={2}>
                <Typography variant="h5" sx={{ fontWeight: 700, textAlign: 'center' }}>The Dashboard App</Typography>
                <TextField size="small" label="Email" type="email" required value={loginForm.email} onChange={e=>setLoginForm(f=>({ ...f, email: e.target.value }))} />
                <TextField size="small" label="Password" type="password" required value={loginForm.password} onChange={e=>setLoginForm(f=>({ ...f, password: e.target.value }))} />
                {loginError && <Alert severity="error">{loginError}</Alert>}
                <Button variant="contained" type="submit" disabled={loggingIn}>{loggingIn ? 'Logging in...' : 'Login'}</Button>
              </Stack>
            </Paper>
          </Container>
        </Box>
      </ThemeProvider>
    );
  }

  // Author placeholder view
  if (user?.isAuthor) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
          <Header user={user} onLogout={handleLogout} />
          <Container maxWidth="md" sx={{ py:4 }}>
            <Stack spacing={3}>
              <Divider textAlign="left">Author Panel</Divider>
              <AuthorBrandForm />
              <AuthorBrandList />
            </Stack>
          </Container>
          <Footer />
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
  <Header user={user} onLogout={handleLogout} />
  <Container maxWidth="sm" sx={{ py: 2 }}>
          <Stack spacing={2}>
            <Grid container spacing={2} alignItems="stretch">
              <Grid xs={12} md={6}>
                <LastUpdated />
              </Grid>
              <Grid xs={12} md={6}>
                <DateRangeFilter value={range} onChange={setRange} />
              </Grid>
            </Grid>
            <KPIs query={query} />
            <Divider textAlign="left">Funnel</Divider>
            <FunnelChart query={query} />
            <OrderSplit query={query} />
            <PaymentSalesSplit query={query} />
            <HourlySalesCompare hours={6} />
            <Alert severity="info" sx={{ display: { xs: 'flex', sm: 'none' } }}>
              Tip: Rotate for a wider chart.
            </Alert>
          </Stack>
        </Container>
  <Footer />
      </Box>
    </ThemeProvider>
  );
}
