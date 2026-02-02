import { useMemo, useState, useEffect, useCallback, Suspense, lazy } from 'react';
import dayjs from 'dayjs';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Stack, Divider, Alert, Skeleton } from '@mui/material';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import { listAuthorBrands, getTopProducts, getDashboardSummary } from './lib/api.js';
import { TextField, Button, Paper, Typography } from '@mui/material';
import Unauthorized from './components/Unauthorized.jsx';
import useSessionHeartbeat from './hooks/useSessionHeartbeat.js';
import { useAppDispatch, useAppSelector } from './state/hooks.js';
import { fetchCurrentUser, loginUser, logoutUser } from './state/slices/authSlice.js';
import { setBrand } from './state/slices/brandSlice.js';
import { DEFAULT_PRODUCT_OPTION, DEFAULT_TREND_METRIC, setProductSelection, setRange, setCompareMode, setSelectedMetric, setUtm } from './state/slices/filterSlice.js';
import MobileTopBar from './components/MobileTopBar.jsx';
import MobileFilterDrawer from './components/MobileFilterDrawer.jsx'; // New Import
import AuthorBrandSelector from './components/AuthorBrandSelector.jsx';
import Footer from './components/Footer.jsx';

const KPIs = lazy(() => import('./components/KPIs.jsx'));
const FunnelChart = lazy(() => import('./components/FunnelChart.jsx'));
const OrderSplit = lazy(() => import('./components/OrderSplit.jsx'));
const PaymentSalesSplit = lazy(() => import('./components/PaymentSalesSplit.jsx'));
const HourlySalesCompare = lazy(() => import('./components/HourlySalesCompare.jsx'));
const WebVitals = lazy(() => import('./components/WebVitals.jsx'));
const AuthorAdjustments = lazy(() => import('./components/AuthorAdjustments.jsx'));
const AccessControlCard = lazy(() => import('./components/AccessControlCard.jsx'));
const WhitelistTable = lazy(() => import('./components/WhitelistTable.jsx'));
const ProductConversionTable = lazy(() => import('./components/ProductConversionTable.jsx'));
const AuthorBrandForm = lazy(() => import('./components/AuthorBrandForm.jsx'));
const AuthorBrandList = lazy(() => import('./components/AuthorBrandList.jsx'));
const AlertsAdmin = lazy(() => import('./components/AlertsAdmin.jsx'));

function formatDate(dt) {
  return dt ? dayjs(dt).format('YYYY-MM-DD') : undefined;
}

const TREND_METRICS = new Set(['sales', 'orders', 'sessions', 'cvr', 'atc', 'aov']);
const SESSION_TRACKING_ENABLED = String(import.meta.env.VITE_SESSION_TRACKING || 'false').toLowerCase() === 'true';
const AUTHOR_BRAND_STORAGE_KEY = 'author_active_brand_v1';
const THEME_MODE_KEY = 'dashboard_theme_mode';
const DRAWER_WIDTH = 260;

function SectionFallback({ count = 1, height = 180 }) {
  return (
    <Stack spacing={{ xs: 1, md: 1.5 }}>
      {Array.from({ length: count }).map((_, idx) => (
        <Paper key={idx} variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderStyle: 'dashed' }}>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rectangular" height={height} sx={{ my: 1 }} />
          <Skeleton variant="text" width="60%" />
        </Paper>
      ))}
    </Stack>
  );
}

function loadInitialThemeMode() {
  try {
    const saved = localStorage.getItem(THEME_MODE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export default function App() {
  const dispatch = useAppDispatch();
  const {
    user, initialized, loginStatus, loginError,
    GlobalBrandKey: globalBrandKey,
  } = useAppSelector((state) => ({
    ...state.auth,
    GlobalBrandKey: state.brand.brand
  }));
  const { range, compareMode, selectedMetric, productSelection, utm } = useAppSelector((state) => state.filters);
  const loggingIn = loginStatus === 'loading';
  const [start, end] = range;
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  const isAuthor = !!user?.isAuthor;
  const isBrandUser = !!user && !user.isAuthor;

  const [authorBrands, setAuthorBrands] = useState([]);
  const [authorBrandsLoading, setAuthorBrandsLoading] = useState(false);
  // New state to strictly track if the initial fetch has completed
  const [brandsLoaded, setBrandsLoaded] = useState(false);

  const authorBrandKey = useMemo(
    () => (globalBrandKey || '').toString().trim().toUpperCase(),
    [globalBrandKey]
  );

  // Initialize tab checking storage; guard against invalid reads
  const [authorTab, setAuthorTab] = useState(() => {
    try {
      return localStorage.getItem('author_active_tab_v1') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });

  const [authorRefreshKey, setAuthorRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false); // Valid New State
  const [darkMode, setDarkMode] = useState(loadInitialThemeMode);
  const [isScrolled, setIsScrolled] = useState(false);
  const [productOptions, setProductOptions] = useState([DEFAULT_PRODUCT_OPTION]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [funnelData, setFunnelData] = useState({ stats: null, deltas: null, loading: true });
  const [utmOptions, setUtmOptions] = useState(null);

  // Keep a data attribute on the body so global CSS (e.g., Polaris overrides) can react to theme changes.
  useEffect(() => {
    document.body.dataset.theme = darkMode;
  }, [darkMode]);

  // Track scroll position for sticky panel border
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useSessionHeartbeat(SESSION_TRACKING_ENABLED && isBrandUser);

  const activeBrandKey = isAuthor ? (authorBrandKey || '') : (user?.brandKey || '');

  const metricsQuery = useMemo(() => {
    const base = { start: formatDate(start), end: formatDate(end) };
    const key = (activeBrandKey || '').toString().trim().toUpperCase();
    if (key) base.brand_key = key;
    if (utm?.source) base.utm_source = utm.source;
    if (utm?.medium) base.utm_medium = utm.medium;
    if (utm?.campaign) base.utm_campaign = utm.campaign;

    if (isAuthor) {
      base.refreshKey = authorRefreshKey;
      if (productSelection?.id) base.product_id = productSelection.id;
    }
    if (compareMode) base.compare = compareMode;
    return base;
  }, [start, end, compareMode, activeBrandKey, isAuthor, authorRefreshKey, productSelection?.id, utm]);

  const handleAuthorBrandChange = useCallback((nextKeyRaw) => {
    const normalized = (nextKeyRaw || '').toString().trim().toUpperCase();
    const changed = normalized !== authorBrandKey;
    // Persist immediately alongside Redux
    try {
      localStorage.setItem('author_active_brand_v1', normalized);
    } catch {
      // Ignore storage write errors
    }

    dispatch(setBrand(normalized || ''));
    if (changed) {
      setAuthorRefreshKey((prev) => prev + 1);
    }
  }, [authorBrandKey, dispatch]);

  // Reset UTM filters when brand changes
  useEffect(() => {
    dispatch(setUtm({ source: '', medium: '', campaign: '' }));
  }, [activeBrandKey, dispatch]);

  useEffect(() => {
    if (!isAuthor) {
      setAuthorBrands([]);
      setAuthorBrandsLoading(false);
      setBrandsLoaded(false);
      return;
    }
    let cancelled = false;
    setAuthorBrandsLoading(true);
    setBrandsLoaded(false); // Reset loaded state on new fetch start
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
      if (!cancelled) {
        setAuthorBrandsLoading(false);
        setBrandsLoaded(true); // Mark as fully loaded
      }
    });
    return () => { cancelled = true; };
  }, [isAuthor]);

  useEffect(() => {
    if (!isAuthor) return;
    // CRITICAL: Strict check for completion of initial load
    if (!brandsLoaded) return;

    if (!authorBrands.length) {
      if (authorBrandKey) {
        handleAuthorBrandChange('');
      }
      return;
    }
    const normalized = (authorBrandKey || '').toString().trim().toUpperCase();
    const exists = normalized && authorBrands.some((b) => b.key === normalized);

    // Only force reset if we are sure the list is loaded and the key is truly invalid
    if (!exists) {
      handleAuthorBrandChange(authorBrands[0].key);
    }
  }, [isAuthor, authorBrands, authorBrandKey, handleAuthorBrandChange, brandsLoaded]);

  // Persist tab state only for authors
  useEffect(() => {
    // Wait until initialized to decide if we should reset tab
    if (initialized && !isAuthor) {
      setAuthorTab('dashboard');
    }
  }, [isAuthor, initialized]);

  useEffect(() => {
    // Only authors should see/use product filters; reset for everyone else.
    if (!isAuthor) {
      setProductOptions([DEFAULT_PRODUCT_OPTION]);
      setProductSelection(DEFAULT_PRODUCT_OPTION);
      setProductOptionsLoading(false);
      return;
    }

    if (!start || !end) {
      setProductOptions([DEFAULT_PRODUCT_OPTION]);
      setProductSelection(DEFAULT_PRODUCT_OPTION);
      return;
    }

    if (!initialized || !user) {
      setProductOptions([DEFAULT_PRODUCT_OPTION]);
      setProductSelection(DEFAULT_PRODUCT_OPTION);
      setProductOptionsLoading(false);
      return;
    }

    if (!activeBrandKey) {
      setProductOptions([DEFAULT_PRODUCT_OPTION]);
      setProductSelection(DEFAULT_PRODUCT_OPTION);
      setProductOptionsLoading(false);
      return;
    }

    let cancelled = false;
    setProductOptionsLoading(true);

    const params = {
      start: formatDate(start),
      end: formatDate(end),
      limit: 50,
      brand_key: activeBrandKey,
    };

    getTopProducts(params)
      .then(({ products, error }) => {
        if (cancelled) return;
        if (error) {
          setProductOptions([DEFAULT_PRODUCT_OPTION]);
          setProductSelection(DEFAULT_PRODUCT_OPTION);
          return;
        }

        const mapped = Array.isArray(products)
          ? products.map((p) => {
            const rawPath = (p.landing_page_path || '').toString();
            const slug = rawPath.includes('/products/')
              ? rawPath.split('/products/')[1] || rawPath
              : rawPath || p.product_id;
            const label = slug || p.product_id || 'Unknown product';
            const sessions = Number(p.sessions || 0);
            const detail = `${sessions.toLocaleString()} sessions`;
            return { id: p.product_id, label, detail };
          })
          : [];

        const nextOptions = [DEFAULT_PRODUCT_OPTION, ...mapped];
        setProductOptions(nextOptions);

        const existing = nextOptions.find((opt) => opt.id === productSelection.id);
        setProductSelection(existing || DEFAULT_PRODUCT_OPTION);
      })
      .finally(() => {
        if (!cancelled) setProductOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [start, end, activeBrandKey, authorRefreshKey, productSelection.id, initialized, user, isAuthor]);

  const handleSelectMetric = useCallback((metricKey) => {
    if (!metricKey) return;
    dispatch(setSelectedMetric(TREND_METRICS.has(metricKey) ? metricKey : DEFAULT_TREND_METRIC));
  }, [dispatch]);

  const handleRangeChange = useCallback((nextRange, mode = null) => {
    if (!Array.isArray(nextRange)) return;
    dispatch(setRange(nextRange));
    dispatch(setCompareMode(mode));
  }, [dispatch]);

  const handleProductChange = useCallback((option) => {
    // Reset UTMs when product changes
    dispatch(setUtm({ source: '', medium: '', campaign: '' }));

    if (!option || typeof option !== 'object') {
      dispatch(setProductSelection(DEFAULT_PRODUCT_OPTION));
      return;
    }
    dispatch(setProductSelection(option));
  }, [dispatch]);

  const handleUtmChange = useCallback((val) => {
    // If source is changing, reset dependent filters (medium, campaign) ONLY if they aren't provided
    if (val && typeof val === 'object' && 'source' in val) {
      const update = { ...val };
      if (!('medium' in val)) update.medium = '';
      if (!('campaign' in val)) update.campaign = '';
      dispatch(setUtm(update));
    } else {
      dispatch(setUtm(val));
    }
  }, [dispatch]);

  const handleSidebarOpen = useCallback(() => setSidebarOpen(true), []);
  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleSidebarTabChange = useCallback((tabId) => {
    setAuthorTab(tabId);
    try {
      localStorage.setItem('author_active_tab_v1', tabId);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const handleToggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(THEME_MODE_KEY, next);
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: darkMode,
      ...(darkMode === 'light'
        ? {
          primary: { main: '#0b6bcb' },
          background: { default: '#FDFDFD', paper: '#ffffff' },
        }
        : {
          primary: { main: '#5ba3e0' },
          background: { default: '#121212', paper: '#1e1e1e' },
          text: {
            primary: '#f0f0f0',
            secondary: '#c0c0c0',
            disabled: '#808080',
          },
          divider: '#404040',
        }),
    },
    shape: { borderRadius: 12 },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            ...(darkMode === 'dark' && {
              backgroundColor: '#1e1e1e',
              borderColor: '#333',
            }),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            ...(darkMode === 'dark' && {
              backgroundImage: 'none',
            }),
          },
        },
      },
    },
  }), [darkMode]);

  // Light-only theme for sign-in page
  const lightTheme = useMemo(() => createTheme({
    palette: {
      mode: 'light',
      primary: { main: '#0b6bcb' },
      background: { default: '#FDFDFD', paper: '#ffffff' },
    },
    shape: { borderRadius: 12 },
  }), []);

  // Persist when range changes
  useEffect(() => {
    if (start && end) {
      try {
        localStorage.setItem('pts_date_range_v2', JSON.stringify({ start: start.toISOString(), end: end.toISOString(), savedAt: Date.now() }));
      } catch {
        // Ignore storage write errors
      }
    }
  }, [start, end]);

  useEffect(() => {
    try {
      localStorage.setItem('pts_utm_filters_v1', JSON.stringify(utm));
    } catch {
      // Ignore
    }
  }, [utm]);

  // Fetch UTM Options (Lifted from MobileTopBar)
  useEffect(() => {
    if (!isAuthor || authorTab !== 'dashboard' || !activeBrandKey) return;
    const s = formatDate(start);
    const e = formatDate(end);

    getDashboardSummary({
      brand_key: activeBrandKey,
      start: s,
      end: e,
      include_utm_options: true,
      utm_source: utm?.source, // Dependent filtering
      utm_medium: utm?.medium,
      utm_campaign: utm?.campaign
    })
      .then(res => {
        if (res.filter_options) setUtmOptions(res.filter_options);
      });
  }, [activeBrandKey, start, end, utm, isAuthor, authorTab]);

  // Check auth on mount
  useEffect(() => {
    dispatch(fetchCurrentUser());
  }, [dispatch]);

  // Session Expiry Notification - DISABLED per user request
  // useEffect(() => {
  //   if (!user || !expiresAt) return; // 'expiresAt' needs to be selected from state
  //
  //   const expiryTime = new Date(expiresAt).getTime();
  //   const now = Date.now();
  //   const tenMinutes = 10 * 60 * 1000;
  //   const timeUntilWarning = expiryTime - now - tenMinutes;
  //
  //   if (timeUntilWarning > 0) {
  //     console.log(`[Session] Warning scheduled in ${(timeUntilWarning / 60000).toFixed(1)} minutes`);
  //     const timer = setTimeout(() => {
  //       if (Notification.permission === 'granted') {
  //         new Notification('Session Expiring soon ⏳', {
  //           body: 'Your session will expire in 10 minutes. Please refresh or save your work.',
  //           icon: '/favicon.png'
  //         });
  //       }
  //     }, timeUntilWarning);
  //     return () => clearTimeout(timer);
  //   }
  // }, [user, expiresAt]);

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
        <ThemeProvider theme={lightTheme}>
          <CssBaseline />
          <Unauthorized />
        </ThemeProvider>
      );
    }

    return (
      <ThemeProvider theme={lightTheme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100svh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
          <Container maxWidth="xs">
            <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }} component="form" onSubmit={handleLogin}>
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Box component="img" src="/brand-logo-final.png" alt="Datum" sx={{ height: 80, width: 220, objectFit: 'contain' }} />
                </Box>
                <TextField size="small" label="Email" type="email" required value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} />
                <TextField size="small" label="Password" type="password" required value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} />
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
        <AppProvider i18n={enTranslations} theme={{ colorScheme: darkMode === 'dark' ? 'dark' : 'light' }}>
          <Box sx={{ display: 'flex', minHeight: '100svh', bgcolor: 'background.default' }}>
            {/* Sidebar Navigation */}
            <Sidebar
              open={sidebarOpen}
              onClose={handleSidebarClose}
              activeTab={authorTab}
              onTabChange={handleSidebarTabChange}
              darkMode={darkMode === 'dark'}
            />

            {/* Main content area */}
            <Box
              component="main"
              sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100svh',
                width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
              }}
            >
              {/* Sticky Top Panel (mobile only) */}
              <Box
                sx={{
                  position: { xs: 'sticky', md: 'static' },
                  top: 0,
                  zIndex: (theme) => theme.zIndex.appBar,
                  bgcolor: darkMode === 'dark' ? '#121212' : '#FDFDFD',
                  // pb: 1, // Removed to eliminate extra black area
                  // borderBottom handled in Header.jsx now
                }}
              >
                <Header
                  user={user}
                  onLogout={handleLogout}
                  onMenuClick={handleSidebarOpen}
                  showMenuButton
                  darkMode={darkMode === 'dark'}
                  onToggleDarkMode={handleToggleDarkMode}
                  onFilterClick={() => setMobileFilterOpen(true)}
                  showFilterButton={true}
                />
              </Box>
              <Box sx={{ px: { xs: 1.5, sm: 2.5, md: 4 }, pt: { xs: 0.5, sm: 2 }, maxWidth: 1200, mx: 'auto', width: '100%' }}>
                <Stack spacing={{ xs: 2, sm: 1 }}>
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    <AuthorBrandSelector
                      brands={authorBrands}
                      value={authorBrandKey}
                      loading={authorBrandsLoading}
                      onChange={handleAuthorBrandChange}
                    />
                  </Box>
                  {authorTab === 'dashboard' && hasAuthorBrand && (
                    <MobileTopBar
                      value={range}
                      compareMode={compareMode}
                      onChange={handleRangeChange}
                      brandKey={authorBrandKey}
                      productOptions={productOptions}
                      productValue={productSelection}
                      onProductChange={handleProductChange}
                      productLoading={productOptionsLoading}
                      utm={utm}
                      onUtmChange={handleUtmChange}
                      showUtmFilter={true}
                      utmOptions={utmOptions}
                    />
                  )}
                  <MobileFilterDrawer
                    open={mobileFilterOpen}
                    onClose={() => setMobileFilterOpen(false)}
                    brandKey={authorBrandKey}
                    brands={authorBrands}
                    onBrandChange={handleAuthorBrandChange}
                    productOptions={productOptions}
                    productValue={productSelection}
                    onProductChange={handleProductChange}
                    utm={utm}
                    onUtmChange={handleUtmChange}
                    dateRange={range}
                    isDark={darkMode === 'dark'}
                  />
                </Stack>
              </Box>

              <Box
                sx={{
                  flex: 1,
                  width: '100%',
                  maxWidth: 1200,
                  mx: 'auto',
                  px: { xs: 1.5, sm: 2.5, md: 4 },
                  py: { xs: 1, md: 2 },
                }}
              >
                <Stack spacing={{ xs: 1, md: 2 }}>
                  {authorTab === 'dashboard' && (
                    hasAuthorBrand ? (
                      <Suspense fallback={<SectionFallback count={5} />}>
                        <Stack spacing={{ xs: 1, md: 1.5 }}>
                          <KPIs
                            query={metricsQuery}
                            selectedMetric={selectedMetric}
                            onSelectMetric={handleSelectMetric}
                            onFunnelData={setFunnelData}
                            productId={productSelection.id}
                            productLabel={productSelection.label}
                            utmOptions={utmOptions}
                          />
                          <HourlySalesCompare query={metricsQuery} metric={selectedMetric} />
                          <WebVitals query={metricsQuery} />
                          <Divider textAlign="left" sx={{ '&::before, &::after': { borderColor: 'divider' }, color: darkMode === 'dark' ? 'text.primary' : 'text.secondary' }}>Funnel</Divider>
                          <FunnelChart funnelData={funnelData} />
                          <OrderSplit query={metricsQuery} />
                          <PaymentSalesSplit query={metricsQuery} />
                        </Stack>
                      </Suspense>
                    ) : (
                      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          Select a brand to load dashboard metrics.
                        </Typography>
                      </Paper>
                    )
                  )}

                  {authorTab === 'access' && (
                    <Suspense fallback={<SectionFallback count={2} />}>
                      <Stack spacing={{ xs: 2, md: 3 }}>
                        <AccessControlCard />
                        <WhitelistTable />
                      </Stack>
                    </Suspense>
                  )}

                  {authorTab === 'adjustments' && (
                    hasAuthorBrand ? (
                      <Suspense fallback={<SectionFallback />}>
                        <AuthorAdjustments
                          brandKey={authorBrandKey}
                          onBrandKeyChange={handleAuthorBrandChange}
                          brands={authorBrands}
                        />
                      </Suspense>
                    ) : (
                      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          Choose a brand to manage session adjustments.
                        </Typography>
                      </Paper>
                    )
                  )}

                  {authorTab === 'product-conversion' && (
                    hasAuthorBrand ? (
                      <Suspense fallback={<SectionFallback />}>
                        <ProductConversionTable
                          brandKey={authorBrandKey}
                          brands={authorBrands}
                          onBrandChange={handleAuthorBrandChange}
                          brandsLoading={authorBrandsLoading}
                        />
                      </Suspense>
                    ) : (
                      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          Select a brand to load product conversion data.
                        </Typography>
                      </Paper>
                    )
                  )}

                  {authorTab === 'brands' && (
                    <Suspense fallback={<SectionFallback count={2} />}>
                      <Stack spacing={{ xs: 2, md: 3 }}>
                        <AuthorBrandForm />
                        <AuthorBrandList />
                      </Stack>
                    </Suspense>
                  )}

                  {authorTab === 'alerts' && (
                    authorBrands.length ? (
                      <Suspense fallback={<SectionFallback />}>
                        <AlertsAdmin
                          brands={authorBrands}
                          defaultBrandKey={authorBrandKey}
                        />
                      </Suspense>
                    ) : (
                      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          Add at least one brand to start configuring alerts.
                        </Typography>
                      </Paper>
                    )
                  )}
                </Stack>
              </Box>
              <Footer />
            </Box>
          </Box>
        </AppProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider i18n={enTranslations} theme={{ colorScheme: darkMode === 'dark' ? 'dark' : 'light' }}>
        <Box sx={{ minHeight: '100svh', bgcolor: 'background.default' }}>
          {/* Sticky Top Panel (mobile only) */}
          <Box
            sx={{
              position: { xs: 'sticky', md: 'static' },
              top: 0,
              zIndex: (theme) => theme.zIndex.appBar,
              bgcolor: darkMode === 'dark' ? '#121212' : '#FDFDFD',
              pb: 0,
              borderBottom: isScrolled ? { xs: 1, md: 0 } : 0,
              borderColor: darkMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              transition: 'border-color 0.2s ease',
            }}
          >
            <Header
              user={user}
              onLogout={handleLogout}
              darkMode={darkMode === 'dark'}
              onToggleDarkMode={handleToggleDarkMode}
              onFilterClick={() => setMobileFilterOpen(true)}
              showFilterButton={!!(isAuthor || user?.isAdmin)}
            />
          </Box>
          <Container maxWidth="sm" sx={{ pt: { xs: 1, sm: 2 }, mt: { xs: 1.5, sm: 0 }, position: 'relative', zIndex: 1 }}>
            <MobileTopBar
              value={range}
              onChange={handleRangeChange}
              brandKey={activeBrandKey}
              showProductFilter={!!(isAuthor || user?.isAdmin)}
              showUtmFilter={!!(isAuthor || user?.isAdmin)}
              productOptions={productOptions}
              productValue={productSelection}
              onProductChange={handleProductChange}
              productLoading={productOptionsLoading}
              utm={utm}
              onUtmChange={handleUtmChange}
            />
            <MobileFilterDrawer
              open={mobileFilterOpen}
              onClose={() => setMobileFilterOpen(false)}
              brandKey={activeBrandKey}
              brands={isAuthor ? authorBrands : (activeBrandKey ? [{ key: activeBrandKey }] : [])}
              onBrandChange={isAuthor ? handleAuthorBrandChange : undefined}
              productOptions={productOptions}
              productValue={productSelection}
              onProductChange={handleProductChange}
              utm={utm}
              onUtmChange={handleUtmChange}
              dateRange={range}
              isDark={darkMode === 'dark'}
            />
          </Container>
          <Container maxWidth="sm" sx={{ py: { xs: 0.75, sm: 1.5 } }}>
            <Stack spacing={{ xs: 1, sm: 1.25 }}>
              <Suspense fallback={<SectionFallback count={4} />}>
                <KPIs
                  query={metricsQuery}
                  selectedMetric={selectedMetric}
                  onSelectMetric={handleSelectMetric}
                  onFunnelData={setFunnelData}
                  productId={productSelection.id}
                  productLabel={productSelection.label}
                />
                <HourlySalesCompare query={metricsQuery} metric={selectedMetric} />
                <Divider textAlign="left" sx={{ '&::before, &::after': { borderColor: 'divider' }, color: darkMode === 'dark' ? 'text.primary' : 'text.secondary' }}>Funnel</Divider>
                <FunnelChart funnelData={funnelData} />
                <OrderSplit query={metricsQuery} />
                <PaymentSalesSplit query={metricsQuery} />
              </Suspense>
            </Stack>
          </Container>
          <Footer />
        </Box>
      </AppProvider>
    </ThemeProvider>
  );
}
