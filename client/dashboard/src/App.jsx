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
import { listAuthorBrands } from './lib/api.js';
import { TextField, Button, Paper, Typography } from '@mui/material';
import AuthorAdjustments from './components/AuthorAdjustments.jsx';
import Unauthorized from './components/Unauthorized.jsx';
import AccessControlCard from './components/AccessControlCard.jsx';
import WhitelistTable from './components/WhitelistTable.jsx';
import useSessionHeartbeat from './hooks/useSessionHeartbeat.js';
import AuthorBrandSelector from './components/AuthorBrandSelector.jsx';
import { useAppDispatch, useAppSelector } from './state/hooks.js';
import { fetchCurrentUser, loginUser, logoutUser } from './state/slices/authSlice.js';

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
  const dispatch = useAppDispatch();
  const { user, initialized, loginStatus, loginError } = useAppSelector((state) => state.auth);
  const loggingIn = loginStatus === 'loading';
  const [range, setRange] = useState(loadInitialRange);
  const [start, end] = range;
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
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
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  async function handleLogin(e) {
    e.preventDefault();
    const action = await dispatch(loginUser({ email: loginForm.email, password: loginForm.password }));
    if (loginUser.fulfilled.match(action)) {
      setLoginForm({ email: '', password: '' });
    }
  }

  function handleLogout() {
    dispatch(logoutUser());
  }

  if (!initialized) return null;

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
                  <Box component="img" src="/brand-logo-final.png" alt="Datum" sx={{ height: 80, width: 220, objectFit: 'contain' }} />
                </Box>
                <TextField size="small" label="Email" type="email" required value={loginForm.email} onChange={e=>setLoginForm(f=>({ ...f, email: e.target.value }))} />
                <TextField size="small" label="Password" type="password" required value={loginForm.password} onChange={e=>setLoginForm(f=>({ ...f, password: e.target.value }))} />
                {loginError && <Alert severity="error">{loginError}</Alert>}
                <Button variant="contained" type="submit" disabled={loggingIn}>{loggingIn ? 'Logging in...' : 'Login'}</Button>
                <Divider>or</Divider>
                <button
                  type="button"
                  className="gsi-material-button"
                  onClick={() => {
                    const base = import.meta.env.VITE_API_BASE || '/api';
                    const target = base.startsWith('http') ? base : `${window.location.origin}${base}`;
                    window.location.href = `${target}/auth/google`;
                  }}
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon" aria-hidden>
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlnsXlink="http://www.w3.org/1999/xlink" style={{ display: 'block' }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">Sign in with Google</span>
                    <span style={{ display: 'none' }}>Sign in with Google</span>
                  </div>
                </button>
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
                  top: 0,
                  zIndex: (theme) => theme.zIndex.appBar + 1,
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
