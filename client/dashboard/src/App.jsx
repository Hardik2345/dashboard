import { useMemo, useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Stack, Divider, Alert } from '@mui/material';
import Header from './components/Header.jsx';
import MobileTopBar from './components/MobileTopBar.jsx';
import AuthorBrandForm from './components/AuthorBrandForm.jsx';
import AuthorBrandList from './components/AuthorBrandList.jsx';
import KPIs from './components/KPIs.jsx';
import FunnelChart from './components/FunnelChart.jsx';
import OrderSplit from './components/OrderSplit.jsx';
import PaymentSalesSplit from './components/PaymentSalesSplit.jsx';
import HourlySalesCompare from './components/HourlySalesCompare.jsx';
import Footer from './components/Footer.jsx';
import { me, login, logout } from './lib/api.js';
import { TextField, Button, Paper, Typography } from '@mui/material';
import AuthorAdjustments from './components/AuthorAdjustments.jsx';
import Unauthorized from './components/Unauthorized.jsx';

function formatDate(dt) {
  return dt ? dayjs(dt).format('YYYY-MM-DD') : undefined;
}

function defaultRangeYesterdayToday() {
  // Default to today only
  const today = dayjs();
  return [today, today];
}

const RANGE_KEY = 'pts_date_range_v2';
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_TREND_METRIC = 'sales';
const TREND_METRICS = new Set(['sales', 'orders', 'sessions', 'cvr', 'atc', 'aov']);

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
  const [selectedMetric, setSelectedMetric] = useState(DEFAULT_TREND_METRIC);

  const query = useMemo(() => ({ start: formatDate(start), end: formatDate(end) }), [start, end]);

  const handleSelectMetric = useCallback((metricKey) => {
    if (!metricKey) return;
    setSelectedMetric(TREND_METRICS.has(metricKey) ? metricKey : DEFAULT_TREND_METRIC);
  }, []);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: 'light',
      primary: { main: '#0b6bcb' },
      background: { default: '#FDFDFD', paper: '#ffffff' }
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
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname || '/';
    const error = params.get('error') || '';
    const reason = params.get('reason') || '';
    const isUnauthorized = (path.startsWith('/login') || path.startsWith('/unauthorized')) && (
      error === 'google_oauth_failed' ||
      error === 'not_authorized' ||
      reason === 'not_authorized_domain'
    );

    if (isUnauthorized) {
      return (
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Unauthorized />
        </ThemeProvider>
      );
    }

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
                <Divider>or</Divider>
                <Button variant="outlined" onClick={()=>{
                  const base = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
                  window.location.href = `${base}/auth/google`;
                }}>Sign in with Google</Button>
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
              <Divider textAlign="left">Session adjustments</Divider>
              <AuthorAdjustments />
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
  <Container maxWidth="sm" sx={{ py: { xs: 0.75, sm: 1.5 } }}>
    <Stack spacing={{ xs: 1, sm: 1.25 }}>
            {/* Unified compact chips bar for all breakpoints */}
            <Box>
              <MobileTopBar value={range} onChange={setRange} />
            </Box>
            <KPIs query={query} selectedMetric={selectedMetric} onSelectMetric={handleSelectMetric} />
            <HourlySalesCompare query={query} metric={selectedMetric} />
            <Divider textAlign="left">Funnel</Divider>
            <FunnelChart query={query} />
            <OrderSplit query={query} />
            <PaymentSalesSplit query={query} />
          </Stack>
        </Container>
  <Footer />
      </Box>
    </ThemeProvider>
  );
}
