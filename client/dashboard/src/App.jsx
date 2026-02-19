import { useMemo, useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dayjs from 'dayjs';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Stack, Divider, Alert, Skeleton, useTheme, useMediaQuery } from '@mui/material';
import Grid from '@mui/material/Grid2';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import { AnimeNavBar } from './components/ui/AnimeNavBar.jsx';
import {
  LayoutGrid,
  Table2,
  Bell,
  ShieldCheck,
  Store,
  Filter
} from 'lucide-react';

const MOBILE_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'product-conversion', label: 'Funnels', icon: Filter },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'access', label: 'Access', icon: ShieldCheck },
  { id: 'brands', label: 'Setup', icon: Store },
];
import { listAuthorBrands, getTopProducts, getDashboardSummary } from './lib/api.js';
import { TextField, Button, Paper, Typography } from '@mui/material';
import Unauthorized from './components/Unauthorized.jsx';
import useSessionHeartbeat from './hooks/useSessionHeartbeat.js';
import { useAppDispatch, useAppSelector } from './state/hooks.js';
import { fetchCurrentUser, loginUser, logoutUser } from './state/slices/authSlice.js';
import { setBrand } from './state/slices/brandSlice.js';
import { DEFAULT_PRODUCT_OPTION, DEFAULT_TREND_METRIC, setProductSelection, setRange, setCompareMode, setSelectedMetric, setUtm, setSalesChannel } from './state/slices/filterSlice.js';
import MobileTopBar from './components/MobileTopBar.jsx';
const MobileFilterDrawer = lazy(() => import('./components/MobileFilterDrawer.jsx'));
const UnifiedFilterBar = lazy(() => import('./components/UnifiedFilterBar.jsx'));
const AuthorBrandSelector = lazy(() => import('./components/AuthorBrandSelector.jsx'));
const Footer = lazy(() => import('./components/Footer.jsx'));

const KPIs = lazy(() => import('./components/KPIs.jsx'));
const FunnelChart = lazy(() => import('./components/charts/FunnelChart.jsx'));
const ModeOfPayment = lazy(() => import('./components/ModeOfPayment.jsx'));
const OrderSplit = lazy(() => import('./components/OrderSplit.jsx'));
const PaymentSalesSplit = lazy(() => import('./components/PaymentSalesSplit.jsx'));
const TrafficSourceSplit = lazy(() => import('./components/TrafficSourceSplit.jsx'));
const HourlySalesCompare = lazy(() => import('./components/HourlySalesCompare.jsx'));
const WebVitals = lazy(() => import('./components/WebVitals.jsx'));
const AccessControlCard = lazy(() => import('./components/AccessControlCard.jsx'));
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
  const authState = useAppSelector((state) => state.auth);
  const globalBrandKey = useAppSelector((state) => state.brand.brand);
  const { user, initialized, loginStatus, loginError } = useAppSelector((state) => state.auth);
  const { range, compareMode, selectedMetric, productSelection, utm, salesChannel } = useAppSelector((state) => state.filters);
  const loggingIn = loginStatus === 'loading';
  // range holds ISO strings; normalize to dayjs for components that expect it
  const [start, end] = useMemo(
    () => [
      range?.[0] && dayjs(range[0]).isValid() ? dayjs(range[0]) : null,
      range?.[1] && dayjs(range[1]).isValid() ? dayjs(range[1]) : null,
    ],
    [range]
  );
  const normalizedRange = useMemo(() => [start, end], [start, end]);
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
  const viewerBrands = useMemo(() => {
    if (!user?.brand_memberships) return [];
    const seen = new Set();
    const list = [];
    for (const m of user.brand_memberships) {
      const key = (m.brand_id || '').toString().trim().toUpperCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(key);
      }
    }
    return list;
  }, [user]);

  // Initialize tab checking storage; guard against invalid reads
  const [authorTab, setAuthorTab] = useState(() => {
    try {
      const stored = localStorage.getItem('author_active_tab_v1') || 'dashboard';
      return stored === 'adjustments' ? 'dashboard' : stored;
    } catch {
      return 'dashboard';
    }
  });

  const isMobile = useMediaQuery('(max-width:900px)'); // Responsive breakpoint for mobile

  const [authorRefreshKey, setAuthorRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false); // Valid New State
  const [darkMode, setDarkMode] = useState(loadInitialThemeMode);
  const [isScrolled, setIsScrolled] = useState(false);
  const [productOptions, setProductOptions] = useState([DEFAULT_PRODUCT_OPTION]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [funnelData, setFunnelData] = useState({ stats: null, deltas: null, loading: true });
  const [utmOptions, setUtmOptions] = useState(null);

  // Track navigation direction for transitions
  const [direction, setDirection] = useState(0);

  // Animation variants for page content
  const pageVariants = {
    initial: (dir) => {
      const isMobileNow = window.innerWidth <= 900;
      const offset = dir > 0 ? (isMobileNow ? '100%' : 40) : dir < 0 ? (isMobileNow ? '-100%' : -40) : 0;
      return isMobileNow
        ? { x: offset, opacity: 0 }
        : { y: offset, opacity: 0 };
    },
    animate: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 28,
      },
    },
    exit: (dir) => {
      const isMobileNow = window.innerWidth <= 900;
      const offset = dir > 0 ? (isMobileNow ? '-100%' : -40) : dir < 0 ? (isMobileNow ? '100%' : 40) : 0;
      return isMobileNow
        ? { x: offset, opacity: 0 }
        : { y: offset, opacity: 0 };
    },
  };

  // Keep a data attribute on the body so global CSS (e.g., Polaris overrides) can react to theme changes.
  useEffect(() => {
    document.body.dataset.theme = darkMode;
    if (darkMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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

  const activeBrandKey = isAuthor
    ? (authorBrandKey || user?.primary_brand_id || '')
    : (
      (globalBrandKey || '').toString().trim().toUpperCase() ||
      (user?.primary_brand_id || '').toString().trim().toUpperCase() ||
      (user?.brandKey || '').toString().trim().toUpperCase() ||
      viewerBrands[0] ||
      ''
    );

  const viewerPermissions = useMemo(() => {
    if (isAuthor) return ['all'];
    const memberships = user?.brand_memberships || [];
    const active = memberships.find((m) => (m.brand_id || '').toString().trim().toUpperCase() === (activeBrandKey || '').toString().trim().toUpperCase());
    const source = active || memberships[0];
    const perms = source?.permissions || [];
    return perms.length ? perms : []; // Default to NO permissions if empty
  }, [isAuthor, user, activeBrandKey]);

  const hasPermission = useCallback((perm) => {
    if (isAuthor) return true;
    if (viewerPermissions.includes('all')) return true;
    return viewerPermissions.includes(perm);
  }, [isAuthor, viewerPermissions]);

  useEffect(() => {
    if (!isAuthor && viewerBrands.length) {
      const current = (globalBrandKey || '').toString().trim().toUpperCase();
      // If current brand is not in the allowed list, force switch to the first allowed brand
      const isValid = viewerBrands.includes(current);
      if (!isValid) {
        dispatch(setBrand(viewerBrands[0]));
      }
    }
  }, [isAuthor, viewerBrands, globalBrandKey, dispatch]);

  // Trend Query (Supports Arrays)
  const trendMetricsQuery = useMemo(() => {
    const base = { start: formatDate(start), end: formatDate(end) };
    const key = (activeBrandKey || '').toString().trim().toUpperCase();
    if (key) base.brand_key = key;
    if (utm?.source) base.utm_source = utm.source;
    if (utm?.medium) base.utm_medium = utm.medium;
    if (utm?.campaign) base.utm_campaign = utm.campaign;
    if (utm?.term) base.utm_term = utm.term;
    if (utm?.content) base.utm_content = utm.content;

    // Arrays allowed here
    if (salesChannel) base.sales_channel = salesChannel;

    if (isAuthor) {
      base.refreshKey = authorRefreshKey;
    }

    if (productSelection && (isAuthor || hasPermission('product_filter'))) {
      // Support array of products
      const products = Array.isArray(productSelection) ? productSelection : [productSelection];
      const ids = products.map(p => p.id).filter(Boolean);
      if (ids.length > 0) base.product_id = ids;
    }
    return base;
  }, [start, end, compareMode, activeBrandKey, isAuthor, authorRefreshKey, productSelection, utm, salesChannel]);

  // General Query (Legacy / Single Value Fallback)
  const generalMetricsQuery = useMemo(() => {
    const base = { ...trendMetricsQuery };

    // Fallback to single value for components that don't support arrays yet
    if (Array.isArray(base.sales_channel)) {
      base.sales_channel = base.sales_channel[0] || '';
    }
    if (Array.isArray(base.product_id)) {
      base.product_id = base.product_id[0] || '';
    }
    // Also fallback UTMs if needed? most backends handle arrays now but let's be safe if specific components break
    // Actually metricsController seems to handle arrays mostly via `extractUtmParam` or `appendUtmWhere` which handles arrays.
    // But let's keep consistency with the requirement "only Trend Graph and 6 KPI Cards".

    return base;
  }, [trendMetricsQuery]);

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
    dispatch(setUtm({ source: [], medium: [], campaign: [], term: [], content: [] }));
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
      if (json.__error || json.error) {
        setAuthorBrands([]);
        return;
      }
      const payload = json.data ?? json;
      const arr = Array.isArray(payload.brands) ? payload.brands.map((b) => ({
        key: (b.key || '').toString().trim().toUpperCase(),
        host: b.host,
        db: b.db,
      })).filter(b => b.key !== 'MILA') : []; // EXPLICIT REMOVAL
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

  // Viewer Brand Enforcement (Primary > Persisted)
  const [viewerBrandEnforced, setViewerBrandEnforced] = useState(false);
  useEffect(() => {
    if (isAuthor || !user || viewerBrandEnforced) return;

    // Logic: If user has a primary brand, and they have access to it, 
    // we should prioritize it on first load over the persisted 'globalBrandKey' 
    // IF the user is a viewer.
    const primary = (user.primary_brand_id || '').toString().trim().toUpperCase();
    const current = (globalBrandKey || '').toString().trim().toUpperCase();

    if (primary && viewerBrands.includes(primary)) {
      if (current !== primary) {
        handleAuthorBrandChange(primary);
      }
    }
    setViewerBrandEnforced(true);
  }, [isAuthor, user, viewerBrands, globalBrandKey, viewerBrandEnforced, handleAuthorBrandChange]);

  // Persist tab state only for authors
  useEffect(() => {
    // Wait until initialized to decide if we should reset tab
    if (initialized && !isAuthor) {
      setAuthorTab('dashboard');
    }
    // Guard against legacy tab state that no longer exists
    if (initialized && authorTab === 'adjustments') {
      setAuthorTab('dashboard');
      try {
        localStorage.setItem('author_active_tab_v1', 'dashboard');
      } catch {
        // ignore storage issues
      }
    }
  }, [isAuthor, initialized, authorTab]);

  useEffect(() => {
    // Only authors or users with product_filter permission should see/use product filters; reset for everyone else.
    if (!isAuthor && !hasPermission('product_filter')) {
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

        // map current selection IDs to new options
        const currentIds = new Set(Array.isArray(productSelection) ? productSelection.map(p => p.id) : []);
        const validSelection = nextOptions.filter(opt => currentIds.has(opt.id) && opt.id !== '');

        if (validSelection.length > 0) {
          setProductSelection(validSelection);
        } else {
          setProductSelection([DEFAULT_PRODUCT_OPTION]);
        }
      })
      .finally(() => {
        if (!cancelled) setProductOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [start, end, activeBrandKey, authorRefreshKey, productSelection, initialized, user, isAuthor, hasPermission]);

  const handleSelectMetric = useCallback((metricKey) => {
    if (!metricKey) return;
    dispatch(setSelectedMetric(TREND_METRICS.has(metricKey) ? metricKey : DEFAULT_TREND_METRIC));
  }, [dispatch]);

  const handleRangeChange = useCallback((nextRange) => {
    if (!Array.isArray(nextRange)) return;
    dispatch(setRange(nextRange));
  }, [dispatch]);

  const handleProductChange = useCallback((value) => {
    // Reset UTMs when product changes
    dispatch(setUtm({ source: [], medium: [], campaign: [], term: [], content: [] }));
    dispatch(setProductSelection(value || DEFAULT_PRODUCT_OPTION));
  }, [dispatch]);

  const handleUtmChange = useCallback((val) => {
    // Simply dispatch the new UTM object; multiselect logic is handled in the components
    dispatch(setUtm(val));
  }, [dispatch]);

  const handleSalesChannelChange = useCallback((val) => {
    dispatch(setSalesChannel(val));
  }, [dispatch]);

  const handleSidebarOpen = useCallback(() => setSidebarOpen(true), []);
  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleSidebarTabChange = useCallback((tabId) => {
    setAuthorTab((prev) => {
      const oldIndex = MOBILE_NAV_ITEMS.findIndex(item => item.id === prev);
      const newIndex = MOBILE_NAV_ITEMS.findIndex(item => item.id === tabId);

      if (oldIndex !== -1 && newIndex !== -1) {
        setDirection(newIndex > oldIndex ? 1 : -1);
      } else {
        setDirection(0);
      }
      return tabId;
    });

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

  // Wrapper to prevent skeleton flash on refresh
  const handleFunnelData = useCallback((newData) => {
    setFunnelData(prev => {
      // If we are loading and have no stats yet in the new update,
      // but we ALREADY have stats from before, keep showing the old stats
      // to avoid a skeleton flash during the refresh.
      if (newData.loading && !newData.stats && prev?.stats) {
        return { ...newData, stats: prev.stats };
      }
      return newData;
    });
  }, []);

  const glassStyles = useMemo(() => ({
    backdropFilter: 'blur(12px)',
    backgroundColor: darkMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.7)',
    border: '1px solid',
    borderColor: darkMode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)',
  }), [darkMode]);

  const depthShadows = useMemo(() => ({
    boxShadow: darkMode === 'dark'
      ? '0 20px 40px rgba(0, 0, 0, 0.6), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.15)'
      : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.5)',
  }), [darkMode]);

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
          background: { default: '#000000', paper: '#1a1a1a' },
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
            borderRadius: 16,
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            ...glassStyles,
            ...depthShadows,
            backgroundImage: 'none',
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: darkMode === 'dark'
                ? '0 30px 60px rgba(0, 0, 0, 0.8), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.25)'
                : '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            ...(darkMode === 'dark' ? {
              backgroundColor: 'rgba(65, 65, 65, 0.15)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            } : {}),
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
        const sIso = dayjs(start).isValid() ? dayjs(start).toISOString() : null;
        const eIso = dayjs(end).isValid() ? dayjs(end).toISOString() : null;
        if (sIso && eIso) {
          localStorage.setItem('pts_date_range_v2', JSON.stringify({ start: sIso, end: eIso, savedAt: Date.now() }));
        }
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
    const canFetch = isAuthor ? authorTab === 'dashboard' : hasPermission('utm_filter');
    if (!activeBrandKey || !canFetch) return;
    const s = formatDate(start);
    const e = formatDate(end);

    getDashboardSummary({
      brand_key: activeBrandKey,
      start: s,
      end: e,
      include_utm_options: true,
      utm_source: utm?.source, // Dependent filtering
      utm_medium: utm?.medium,
      utm_campaign: utm?.campaign,
      sales_channel: salesChannel
    })
      .then(res => {
        if (res.filter_options) setUtmOptions(res.filter_options);
      });
  }, [activeBrandKey, start, end, utm, isAuthor, authorTab, salesChannel]);

  // Check auth on mount
  useEffect(() => {
    // Check for access_token in URL (OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (token) {
      window.localStorage.setItem('gateway_access_token', token);
      if (refreshToken) {
        window.localStorage.setItem('gateway_refresh_token', refreshToken);
      }
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

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
                    const target = base.startsWith('http')
                      ? base
                      : `${window.location.origin}${base}`;

                    const redirect = import.meta.env.VITE_OAUTH_REDIRECT || window.location.origin;

                    window.location.href =
                      `${target.replace(/\/$/, '')}/auth/google/start?redirect=${encodeURIComponent(redirect)}`;
                    console.log(window.location.href);
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

  // Unified layout for both author and viewer roles
  const hasBrand = Boolean((activeBrandKey || '').trim());
  const availableBrands = isAuthor ? authorBrands : viewerBrands.map((key) => ({ key }));
  const brandsForSelector = isAuthor ? authorBrands : viewerBrands;
  const showMultipleBrands = isAuthor ? authorBrands.length > 0 : viewerBrands.length > 1;





  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider i18n={enTranslations} theme={{ colorScheme: darkMode === 'dark' ? 'dark' : 'light' }}>
        <Box sx={{ display: 'flex', minHeight: '100svh', bgcolor: 'background.default' }}>
          {/* Sidebar Navigation - only for authors */}
          {isAuthor && (
            <Sidebar
              open={sidebarOpen}
              onClose={handleSidebarClose}
              activeTab={authorTab}
              onTabChange={handleSidebarTabChange}
              darkMode={darkMode === 'dark'}
              user={user}
              onLogout={handleLogout}
            />
          )}

          {/* Main content area */}
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100svh',
              width: isAuthor ? { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` } : '100%',
              ml: isAuthor ? { xs: 0, md: `${DRAWER_WIDTH}px` } : 0,
            }}
          >
            {/* Sticky Header */}
            <Box
              sx={{
                position: { xs: 'sticky', md: 'static' },
                top: 0,
                zIndex: (theme) => theme.zIndex.appBar,
                bgcolor: darkMode === 'dark' ? '#000000' : '#FDFDFD',
                borderBottom: isScrolled ? { xs: 1, md: 0 } : 0,
                borderColor: darkMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                transition: 'border-color 0.2s ease',
              }}
            >
              <Header
                user={user}
                onLogout={handleLogout}
                onMenuClick={isAuthor ? handleSidebarOpen : undefined}
                showMenuButton={isAuthor}
                isAdmin={isAuthor}
                darkMode={darkMode === 'dark'}
                onToggleDarkMode={handleToggleDarkMode}
                brandKey={activeBrandKey}
                showFilterButton={isAuthor || hasPermission('product_filter') || hasPermission('utm_filter') || hasPermission('sales_channel_filter') || showMultipleBrands}
                onFilterClick={() => setMobileFilterOpen(true)}
              />
            </Box>

            {/* Non-Sticky Sub-Header (MobileTopBar etc) */}
            <Box
              sx={{
                bgcolor: darkMode === 'dark' ? '#000000' : '#FDFDFD',
                pb: 0,
              }}
            >
              <Box sx={{ px: { xs: 1.5, sm: 2.5, md: 4 }, pt: 0, maxWidth: 1200, mx: 'auto', width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    alignItems: 'center',
                    justifyContent: { xs: 'space-between', md: 'flex-end' },
                    width: '100%',
                    gap: 1,
                  }}
                >
                  {/* Unified Filter Bar - Desktop Only (Dashboard Tab) */}
                  {!isMobile && authorTab === 'dashboard' && hasBrand && (
                    <Box sx={{ mb: { xs: 1, md: 0 } }}>
                      <UnifiedFilterBar
                        range={normalizedRange}
                        onRangeChange={handleRangeChange}
                        brandKey={activeBrandKey}
                        brands={brandsForSelector}
                        onBrandChange={isAuthor ? handleAuthorBrandChange : (val) => dispatch(setBrand((val || '').toString().trim().toUpperCase()))}
                        isAuthor={isAuthor}
                        // Filter Props
                        productOptions={productOptions}
                        productValue={productSelection}
                        onProductChange={handleProductChange}
                        productLoading={productOptionsLoading}
                        utm={utm}
                        onUtmChange={handleUtmChange}
                        salesChannel={salesChannel}
                        onSalesChannelChange={handleSalesChannelChange}
                        allowedFilters={{
                          product: hasPermission('product_filter'),
                          utm: hasPermission('utm_filter'),
                          salesChannel: hasPermission('sales_channel_filter')
                        }}
                        utmOptions={utmOptions}
                        onDownload={() => console.log('Download triggered')}
                      />
                    </Box>
                  )}

                  {!isMobile && authorTab !== 'dashboard' && authorTab !== 'product-conversion' && (isAuthor || showMultipleBrands) && (
                    <Box sx={{ mb: 1 }}>
                      <AuthorBrandSelector
                        brands={isAuthor ? authorBrands : viewerBrands.map((key) => ({ key }))}
                        value={activeBrandKey}
                        loading={isAuthor ? authorBrandsLoading : false}
                        onChange={isAuthor ? handleAuthorBrandChange : (val) => dispatch(setBrand((val || '').toString().trim().toUpperCase()))}
                      />
                    </Box>
                  )}

                  {/* Mobile Components (Keep existing MobileTopBar for mobile view) */}
                  {isMobile && authorTab === 'dashboard' && hasBrand && (
                    <MobileTopBar
                      value={normalizedRange}
                      onChange={handleRangeChange}
                      brandKey={activeBrandKey}
                      showProductFilter={hasPermission('product_filter')}
                      productOptions={productOptions}
                      productValue={productSelection}
                      onProductChange={handleProductChange}
                      productLoading={productOptionsLoading}
                      utm={utm}
                      onUtmChange={handleUtmChange}
                      salesChannel={salesChannel}
                      onSalesChannelChange={handleSalesChannelChange}
                      showUtmFilter={hasPermission('utm_filter')}
                      showSalesChannel={hasPermission('sales_channel_filter')}
                      utmOptions={utmOptions}
                    />
                  )}
                </Box>
                <MobileFilterDrawer
                  showBrandFilter={showMultipleBrands}
                  showProductFilter={hasPermission('product_filter')}
                  showUtmFilter={hasPermission('utm_filter')}
                  showSalesChannel={hasPermission('sales_channel_filter')}
                  open={mobileFilterOpen}
                  onClose={() => setMobileFilterOpen(false)}
                  brandKey={authorBrandKey}
                  brands={isAuthor ? authorBrands : viewerBrands.map(b => ({ key: b }))}
                  onBrandChange={handleAuthorBrandChange}
                  productOptions={productOptions}
                  productValue={productSelection}
                  onProductChange={handleProductChange}
                  utm={utm}
                  onUtmChange={handleUtmChange}
                  salesChannel={salesChannel}
                  onSalesChannelChange={handleSalesChannelChange}
                  utmOptions={utmOptions}
                  dateRange={range}
                  isDark={darkMode === 'dark'}
                />
              </Box>
            </Box>

            <Box
              sx={{
                flex: 1,
                width: '100%',
                maxWidth: 1200,
                mx: 'auto',
                px: { xs: 1.5, sm: 2.5, md: 4 },
                py: { xs: 1, md: 2 },
                pb: { xs: 14, md: 2 }, // Extra space for mobile bottom nav
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              <Stack spacing={{ xs: 1, md: 2 }} sx={{ position: 'relative' }}>
                <AnimatePresence mode="wait" custom={direction} initial={false}>
                  <motion.div
                    key={authorTab}
                    custom={direction}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    style={{ width: '100%' }}
                  >
                    {authorTab === 'dashboard' && (
                      hasBrand ? (
                        <Suspense fallback={<SectionFallback count={5} />}>
                          <Stack spacing={{ xs: 1, md: 1 }}>
                            {/* Row 1 KPIs - Full Width (Updates with Multiselect) */}
                            <KPIs
                              query={trendMetricsQuery}
                              selectedMetric={selectedMetric}
                              onSelectMetric={handleSelectMetric}
                              onFunnelData={handleFunnelData}
                              productId={Array.isArray(productSelection) ? productSelection[0]?.id : productSelection?.id}
                              productLabel={Array.isArray(productSelection) && productSelection.length > 1 ? `${productSelection.length} Products` : (Array.isArray(productSelection) ? productSelection[0]?.label : productSelection?.label)}
                              utmOptions={utmOptions}
                              showRow={1}
                            />

                            <Grid container spacing={2}>
                              {/* Left Column: Row 2 KPIs + Trend Graph */}
                              <Grid size={{ xs: 12, md: hasPermission('web_vitals') ? 9 : 12 }}>
                                <Stack spacing={{ xs: 1, md: 1 }}>
                                  <KPIs
                                    query={trendMetricsQuery}
                                    selectedMetric={selectedMetric}
                                    onSelectMetric={handleSelectMetric}
                                    productId={Array.isArray(productSelection) ? productSelection[0]?.id : productSelection?.id}
                                    productLabel={Array.isArray(productSelection) && productSelection.length > 1 ? `${productSelection.length} Products` : (Array.isArray(productSelection) ? productSelection[0]?.label : productSelection?.label)}
                                    utmOptions={utmOptions}
                                    showRow={isMobile ? 'sessions_atc' : 2}
                                  />
                                  <HourlySalesCompare query={trendMetricsQuery} metric={selectedMetric} />
                                  {isMobile && (
                                    <KPIs
                                      query={trendMetricsQuery}
                                      selectedMetric={selectedMetric}
                                      onSelectMetric={handleSelectMetric}
                                      productId={Array.isArray(productSelection) ? productSelection[0]?.id : productSelection?.id}
                                      productLabel={Array.isArray(productSelection) && productSelection.length > 1 ? `${productSelection.length} Products` : (Array.isArray(productSelection) ? productSelection[0]?.label : productSelection?.label)}
                                      utmOptions={utmOptions}
                                      showRow="web_perf_cvr"
                                    />
                                  )}
                                </Stack>
                              </Grid>

                              {/* Right Column: Web Vitals Sidebar */}
                              {hasPermission('web_vitals') && (
                                <Grid size={{ xs: 12, md: 3 }}>
                                  <WebVitals query={generalMetricsQuery} />
                                </Grid>
                              )}
                            </Grid>

                            {hasPermission('traffic_split') && <TrafficSourceSplit query={generalMetricsQuery} />}
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

                    {/* Author-only tabs */}
                    {isAuthor && authorTab === 'access' && (
                      <Suspense fallback={<SectionFallback count={2} />}>
                        <Stack spacing={{ xs: 2, md: 3 }}>
                          <AccessControlCard />
                        </Stack>
                      </Suspense>
                    )}

                    {isAuthor && authorTab === 'product-conversion' && (
                      hasBrand ? (
                        <Suspense fallback={<SectionFallback />}>
                          <Stack spacing={{ xs: 2, md: 3 }}>
                            <Typography variant="h6" sx={{ color: darkMode === 'dark' ? 'text.primary' : 'text.secondary', fontWeight: 600, mt: 1 }}>Funnels</Typography>
                            {funnelData?.stats ? (
                              <Suspense fallback={<Skeleton variant="rounded" width="100%" height={250} />}>
                                <FunnelChart
                                  data={[
                                    {
                                      label: 'Sessions',
                                      value: funnelData.stats.total_sessions || 0,
                                      change: funnelData.deltas?.sessions?.diff_pct ? Number(funnelData.deltas.sessions.diff_pct).toFixed(1) : undefined,
                                    },
                                    {
                                      label: 'Add to Cart',
                                      value: funnelData.stats.total_atc_sessions || 0,
                                      change: funnelData.deltas?.atc?.diff_pct ? Number(funnelData.deltas.atc.diff_pct).toFixed(1) : undefined,
                                    },
                                    {
                                      label: 'Orders',
                                      value: funnelData.stats.total_orders || 0,
                                      change: (funnelData.deltas?.orders?.diff_pct || funnelData.deltas?.orders?.diff_pp) ? Number(funnelData.deltas?.orders?.diff_pct || funnelData.deltas?.orders?.diff_pp).toFixed(1) : undefined,
                                    }
                                  ]}
                                  height={250}
                                />
                              </Suspense>
                            ) : (
                              <Skeleton variant="rounded" width="100%" height={250} />
                            )}
                            {(hasPermission('payment_split_order') || hasPermission('payment_split_sales')) && <ModeOfPayment query={generalMetricsQuery} />}

                            <ProductConversionTable
                              brandKey={activeBrandKey}
                              brands={authorBrands}
                              onBrandChange={handleAuthorBrandChange}
                              brandsLoading={authorBrandsLoading}
                            />
                          </Stack>
                        </Suspense>
                      ) : (
                        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            Select a brand to load product conversion data.
                          </Typography>
                        </Paper>
                      )
                    )}

                    {isAuthor && authorTab === 'brands' && (
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
                  </motion.div>
                </AnimatePresence>
              </Stack>
            </Box>
            <Suspense fallback={null}><Footer /></Suspense>
          </Box>
        </Box>
        {isMobile && (
          <AnimeNavBar
            items={MOBILE_NAV_ITEMS}
            activeTab={authorTab}
            onTabChange={handleSidebarTabChange}
            isDark={darkMode === 'dark'}
          />
        )}
      </AppProvider>
    </ThemeProvider >
  );
}

