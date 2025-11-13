import { useMemo, useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Stack, Divider, Alert, Tabs, Tab } from '@mui/material';
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
import { me, login, logout, listAuthorBrands } from './lib/api.js';
import { TextField, Button, Paper, Typography } from '@mui/material';
import AuthorAdjustments from './components/AuthorAdjustments.jsx';
import Unauthorized from './components/Unauthorized.jsx';
import AccessControlCard from './components/AccessControlCard.jsx';
import WhitelistTable from './components/WhitelistTable.jsx';
import useSessionHeartbeat from './hooks/useSessionHeartbeat.js';
import AuthorBrandSelector from './components/AuthorBrandSelector.jsx';

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
const SESSION_TRACKING_ENABLED = String(import.meta.env.VITE_SESSION_TRACKING || 'false').toLowerCase() === 'true';
const AUTHOR_BRAND_STORAGE_KEY = 'author_active_brand_v1';

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

  const isAuthor = !!user?.isAuthor;
  const isBrandUser = !!user && !user.isAuthor;

  const [authorBrands, setAuthorBrands] = useState([]);
  const [authorBrandsLoading, setAuthorBrandsLoading] = useState(false);
  const [authorBrandKey, setAuthorBrandKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const stored = localStorage.getItem(AUTHOR_BRAND_STORAGE_KEY);
      return stored ? stored.toUpperCase() : '';
    } catch {
      return '';
    }
  });
  const [authorTab, setAuthorTab] = useState('dashboard');
  const [authorRefreshKey, setAuthorRefreshKey] = useState(0);
  const [authorLastLoadedAt, setAuthorLastLoadedAt] = useState(null);

  useSessionHeartbeat(SESSION_TRACKING_ENABLED && isBrandUser);

  const activeBrandKey = isAuthor ? (authorBrandKey || '') : (user?.brandKey || '');

  const metricsQuery = useMemo(() => {
    const base = { start: formatDate(start), end: formatDate(end) };
    const key = (activeBrandKey || '').toString().trim().toUpperCase();
    if (key) base.brand_key = key;
    if (isAuthor) base.refreshKey = authorRefreshKey;
    return base;
  }, [start, end, activeBrandKey, isAuthor, authorRefreshKey]);

  const handleAuthorBrandChange = useCallback((nextKeyRaw) => {
    const normalized = (nextKeyRaw || '').toString().trim().toUpperCase();
    const changed = normalized !== authorBrandKey;
    setAuthorBrandKey(normalized);
    if (typeof window !== 'undefined') {
      try {
        if (normalized) {
          localStorage.setItem(AUTHOR_BRAND_STORAGE_KEY, normalized);
        } else {
          localStorage.removeItem(AUTHOR_BRAND_STORAGE_KEY);
        }
      } catch {}
    }
    if (changed) {
      setAuthorRefreshKey((prev) => prev + 1);
      setAuthorLastLoadedAt(null);
    }
  }, [authorBrandKey]);

  const handleAuthorRefresh = useCallback(() => {
    setAuthorRefreshKey((prev) => prev + 1);
    setAuthorLastLoadedAt(null);
  }, []);

  const handleAuthorDataLoaded = useCallback((ts) => {
    if (!isAuthor) return;
    if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
      setAuthorLastLoadedAt(ts);
    }
  }, [isAuthor]);

  useEffect(() => {
    if (!isAuthor) {
      setAuthorBrands([]);
      setAuthorBrandsLoading(false);
      return;
    }
    let cancelled = false;
    setAuthorBrandsLoading(true);
    listAuthorBrands().then((json) => {
      if (cancelled) return;
      if (json.__error) {
        setAuthorBrands([]);
        return;
      }
      const arr = Array.isArray(json.brands) ? json.brands.map((b) => ({
        key: (b.key || '').toString().trim().toUpperCase(),
        host: b.host,
        db: b.db,
      })) : [];
      setAuthorBrands(arr);
    }).finally(() => {
      if (!cancelled) setAuthorBrandsLoading(false);
    });
    return () => { cancelled = true; };
  }, [isAuthor]);

  useEffect(() => {
    if (!isAuthor) return;
    if (!authorBrands.length) {
      if (authorBrandKey) {
        handleAuthorBrandChange('');
      }
      return;
    }
    const normalized = (authorBrandKey || '').toString().trim().toUpperCase();
    const exists = normalized && authorBrands.some((b) => b.key === normalized);
    if (!exists) {
      handleAuthorBrandChange(authorBrands[0].key);
    }
  }, [isAuthor, authorBrands, authorBrandKey, handleAuthorBrandChange]);

  useEffect(() => {
    if (!isAuthor) {
      setAuthorTab('dashboard');
    }
  }, [isAuthor]);

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
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Box component="img" src="/image.png" alt="Datum" sx={{ height: 64, objectFit: 'contain' }} />
                </Box>
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

  if (isAuthor) {
    const hasAuthorBrand = Boolean((authorBrandKey || '').trim());
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
          <Header user={user} onLogout={handleLogout} />
          <Box component="main" sx={{ width: '100%', maxWidth: 1200, mx: 'auto', px: { xs: 1.5, sm: 2.5, md: 4 }, py: { xs: 2, md: 4 } }}>
            <Stack spacing={{ xs: 2, md: 3 }}>
              <AuthorBrandSelector
                brands={authorBrands}
                value={authorBrandKey}
                loading={authorBrandsLoading}
                lastLoadedAt={authorLastLoadedAt}
                onChange={handleAuthorBrandChange}
                onRefresh={handleAuthorRefresh}
              />
              <Box
                sx={{
                  position: 'sticky',
                  top: { xs: 64, sm: 72 },
                  zIndex: (theme) => theme.zIndex.appBar - 1,
                  bgcolor: 'background.paper',
                  pt: { xs: 1, md: 0 },
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Tabs
                  value={authorTab}
                  onChange={(event, value) => setAuthorTab(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  textColor="primary"
                  indicatorColor="primary"
                  sx={{
                    '& .MuiTabs-indicator': { height: 3, borderRadius: 1.5 },
                    '& .MuiTab-root': {
                      minWidth: { xs: 120, sm: 140 },
                      fontSize: { xs: '0.8rem', sm: '0.9rem' },
                      textTransform: 'none',
                    },
                  }}
                >
                  <Tab label="Dashboard" value="dashboard" />
                  <Tab label="Access Control" value="access" />
                  <Tab label="Session Adjustments" value="adjustments" />
                  <Tab label="Brand Setup" value="brands" />
                </Tabs>
              </Box>

              {authorTab === 'dashboard' && (
                hasAuthorBrand ? (
                  <Stack spacing={{ xs: 1.5, md: 2 }}>
                    <Box sx={{ position: 'relative', zIndex: 0 }}>
                      <MobileTopBar value={range} onChange={setRange} brandKey={authorBrandKey} />
                    </Box>
                    <KPIs
                      query={metricsQuery}
                      selectedMetric={selectedMetric}
                      onSelectMetric={handleSelectMetric}
                      onLoaded={handleAuthorDataLoaded}
                    />
                    <HourlySalesCompare query={metricsQuery} metric={selectedMetric} />
                    <Divider textAlign="left">Funnel</Divider>
                    <FunnelChart query={metricsQuery} />
                    <OrderSplit query={metricsQuery} />
                    <PaymentSalesSplit query={metricsQuery} />
                  </Stack>
                ) : (
                  <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      Select a brand to load dashboard metrics.
                    </Typography>
                  </Paper>
                )
              )}

              {authorTab === 'access' && (
                <Stack spacing={{ xs: 2, md: 3 }}>
                  <AccessControlCard />
                  <WhitelistTable />
                </Stack>
              )}

              {authorTab === 'adjustments' && (
                hasAuthorBrand ? (
                  <AuthorAdjustments
                    brandKey={authorBrandKey}
                    onBrandKeyChange={handleAuthorBrandChange}
                    brands={authorBrands}
                  />
                ) : (
                  <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      Choose a brand to manage session adjustments.
                    </Typography>
                  </Paper>
                )
              )}

              {authorTab === 'brands' && (
                <Stack spacing={{ xs: 2, md: 3 }}>
                  <AuthorBrandForm />
                  <AuthorBrandList />
                </Stack>
              )}
            </Stack>
          </Box>
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
              <MobileTopBar value={range} onChange={setRange} brandKey={activeBrandKey} />
            </Box>
            <KPIs query={metricsQuery} selectedMetric={selectedMetric} onSelectMetric={handleSelectMetric} />
            <HourlySalesCompare query={metricsQuery} metric={selectedMetric} />
            <Divider textAlign="left">Funnel</Divider>
            <FunnelChart query={metricsQuery} />
            <OrderSplit query={metricsQuery} />
            <PaymentSalesSplit query={metricsQuery} />
          </Stack>
        </Container>
  <Footer />
      </Box>
    </ThemeProvider>
  );
}
