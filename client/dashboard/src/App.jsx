import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  Suspense,
  lazy,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import dayjs from "dayjs";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Box,
  Stack,
  Divider,
  Alert,
  Skeleton,
  FormControl,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SidebarToggle from "./components/ui/SidebarToggle.jsx";
import { AnimeNavBar } from "./components/ui/AnimeNavBar.jsx";

import {
  LayoutGrid,
  Table2,
  Bell,
  ShieldCheck,
  Store,
  Filter,
  ScanLine,
} from "lucide-react";

const MOBILE_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "product-conversion", label: "Funnels", icon: Filter },
  { id: "ranveer-rs", label: "RS Campaign", icon: ({ className }) => <span className={className} style={{ fontWeight: 800, fontSize: "0.85rem" }}>RS</span> },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "tenant-setup", label: "Tenant Setup", icon: Store },
  //  { id: "notifications-log", label: "Logs", icon: Bell },
  { id: "access", label: "Access", icon: ShieldCheck },
  { id: "traffic-split-config", label: "Traffic Config", icon: Table2 },
  //  { id: 'brands', label: 'Setup', icon: Store },
];
const TenantSetupForm = lazy(() => import("./components/TenantSetupForm.jsx"));
const LogsPanel = lazy(() => import("./components/LogsPanel.jsx"));

import {
  listAuthorBrands,
  getTopProducts,
  getDashboardSummary,
  getHourlyTrend,
  getOrderSplit,
  getPaymentSalesSplit,
  getTrafficSourceSplit,
  doPost,
  doDelete,
} from "./lib/api.js";
import { TextField, Button, Paper, Typography, Chip } from "@mui/material";
import axios from "axios";
import { requestForToken, onMessageListener } from "./firebase";
import Unauthorized from "./components/Unauthorized.jsx";
import useSessionHeartbeat from "./hooks/useSessionHeartbeat.js";
import { useAppDispatch, useAppSelector } from "./state/hooks.js";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
} from "./state/slices/authSlice.js";
import { setBrand } from "./state/slices/brandSlice.js";
import {
  DEFAULT_PRODUCT_OPTION,
  DEFAULT_TREND_METRIC,
  setProductSelection,
  setRange,
  setCompareMode,
  setCompareDateRange,
  setSelectedMetric,
  setUtm,
  setSalesChannel,
  setDeviceType,
} from "./state/slices/filterSlice.js";
import MobileTopBar from "./components/MobileTopBar.jsx";
const MobileFilterDrawer = lazy(
  () => import("./components/MobileFilterDrawer.jsx"),
);
const UnifiedFilterBar = lazy(
  () => import("./components/UnifiedFilterBar.jsx"),
);
const AuthorBrandSelector = lazy(
  () => import("./components/AuthorBrandSelector.jsx"),
);
const Footer = lazy(() => import("./components/Footer.jsx"));

const KPIs = lazy(() => import("./components/KPIs.jsx"));
const FunnelChart = lazy(() => import("./components/charts/FunnelChart.jsx"));
const ModeOfPayment = lazy(() => import("./components/ModeOfPayment.jsx"));
const OrderSplit = lazy(() => import("./components/OrderSplit.jsx"));
const PaymentSalesSplit = lazy(
  () => import("./components/PaymentSalesSplit.jsx"),
);
const TrafficSourceSplit = lazy(
  () => import("./components/TrafficSourceSplit.jsx"),
);
const TrafficSplitConfigPanel = lazy(
  () => import("./components/TrafficSplitConfigPanel.jsx"),
);
const HourlySalesCompare = lazy(
  () => import("./components/HourlySalesCompare.jsx"),
);
const WebVitals = lazy(() => import("./components/WebVitals.jsx"));
const AccessControlCard = lazy(
  () => import("./components/AccessControlCard.jsx"),
);
const NotificationsLog = lazy(
  () => import("./components/NotificationsLog.jsx"),
);
const ProductConversionTable = lazy(
  () => import("./components/ProductConversionTable.jsx"),
);
const AuthorBrandForm = lazy(() => import("./components/AuthorBrandForm.jsx"));
const AuthorBrandList = lazy(() => import("./components/AuthorBrandList.jsx"));
const AlertsAdmin = lazy(() => import("./components/AlertsAdmin.jsx"));
const RanveerRSDashboard = lazy(
  () => import("./components/RanveerRSDashboard.jsx"),
);

function formatDate(dt) {
  return dt ? dayjs(dt).format("YYYY-MM-DD") : undefined;
}

const TREND_METRICS = new Set([
  "sales",
  "orders",
  "sessions",
  "cvr",
  "atc",
  "atc_rate",
  "aov",
]);
const WEB_VITAL_METRIC_KEYS = {
  FCP: "fcp",
  LCP: "lcp",
  TTFB: "ttfb",
  SESSIONS: "sessions",
  PERFORMANCE: "performance",
};
const SESSION_TRACKING_ENABLED =
  String(import.meta.env.VITE_SESSION_TRACKING || "false").toLowerCase() ===
  "true";
const AUTHOR_BRAND_STORAGE_KEY = "author_active_brand_v1";
const THEME_MODE_KEY = "dashboard_theme_mode";
const TRAFFIC_SPLIT_RULES_STORAGE_PREFIX = "traffic_split_rules_v1";
const DRAWER_WIDTH = 260;

function SectionFallback({ count = 1, height = 180 }) {
  return (
    <Stack spacing={{ xs: 1, md: 1.5 }}>
      {Array.from({ length: count }).map((_, idx) => (
        <Paper
          key={idx}
          variant="outlined"
          sx={{ p: { xs: 1.5, md: 2 }, borderStyle: "dashed" }}
        >
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
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Ignore storage access errors
  }
  return "light";
}

export default function App() {
  const dispatch = useAppDispatch();
  const authState = useAppSelector((state) => state.auth);
  const globalBrandKey = useAppSelector((state) => state.brand.brand);
  const { user, initialized, loginStatus, loginError } = useAppSelector(
    (state) => state.auth,
  );
  const {
    range,
    compareMode,
    compareDateRange,
    selectedMetric,
    productSelection,
    utm,
    salesChannel,
    deviceType,
  } = useAppSelector((state) => state.filters);
  const productTableStart = useAppSelector(
    (state) => state.productConversion?.start,
  );
  const productTableEnd = useAppSelector(
    (state) => state.productConversion?.end,
  );
  const loggingIn = loginStatus === "loading";
  // range holds ISO strings; normalize to dayjs for components that expect it
  const [start, end] = useMemo(
    () => [
      range?.[0] && dayjs(range[0]).isValid() ? dayjs(range[0]) : null,
      range?.[1] && dayjs(range[1]).isValid() ? dayjs(range[1]) : null,
    ],
    [range],
  );
  const normalizedRange = useMemo(() => [start, end], [start, end]);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  const isAuthor = !!user?.isAuthor;
  const isBrandUser = !!user && !user.isAuthor;

  const [authorBrands, setAuthorBrands] = useState([]);
  const [authorBrandsLoading, setAuthorBrandsLoading] = useState(false);
  // New state to strictly track if the initial fetch has completed
  const [brandsLoaded, setBrandsLoaded] = useState(false);

  const authorBrandKey = useMemo(
    () => (globalBrandKey || "").toString().trim().toUpperCase(),
    [globalBrandKey],
  );
  const viewerBrands = useMemo(() => {
    if (!user?.brand_memberships) return [];
    const seen = new Set();
    const list = [];
    for (const m of user.brand_memberships) {
      const key = (m.brand_id || "").toString().trim().toUpperCase();
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
      const stored =
        localStorage.getItem("author_active_tab_v1") || "dashboard";
      return stored === "adjustments" ? "dashboard" : stored;
    } catch {
      return "dashboard";
    }
  });

  const isMobile = useMediaQuery("(max-width:900px)"); // Responsive breakpoint for mobile

  const [authorRefreshKey, setAuthorRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false); // Valid New State
  const [darkMode, setDarkMode] = useState(loadInitialThemeMode);
  const [isScrolled, setIsScrolled] = useState(false);
  const [productOptions, setProductOptions] = useState([
    DEFAULT_PRODUCT_OPTION,
  ]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [funnelData, setFunnelData] = useState({
    stats: null,
    deltas: null,
    loading: true,
  });
  const [utmOptions, setUtmOptions] = useState(null);
  const [webVitalsMetric, setWebVitalsMetric] = useState("FCP");
  const [trafficSplitRules, setTrafficSplitRules] = useState([]);

  // Track navigation direction for transitions
  const [direction, setDirection] = useState(0);

  // RS Campaign Filter State
  const [rsCity, setRsCity] = useState("All");
  const [rsUtm, setRsUtm] = useState("All");
  const [rsCityOptions, setRsCityOptions] = useState(["All"]);
  const [rsUtmOptions, setRsUtmOptions] = useState(["All"]);

  // Animation variants for page content
  const pageVariants = {
    initial: (dir) => {
      const isMobileNow = window.innerWidth <= 900;
      const offset =
        dir > 0
          ? isMobileNow
            ? "100%"
            : 40
          : dir < 0
            ? isMobileNow
              ? "-100%"
              : -40
            : 0;
      return isMobileNow
        ? { x: offset, opacity: 0 }
        : { y: offset, opacity: 0 };
    },
    animate: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 260,
        damping: 28,
      },
    },
    exit: (dir) => {
      const isMobileNow = window.innerWidth <= 900;
      const offset =
        dir > 0
          ? isMobileNow
            ? "-100%"
            : -40
          : dir < 0
            ? isMobileNow
              ? "100%"
              : 40
            : 0;
      return isMobileNow
        ? { x: offset, opacity: 0 }
        : { y: offset, opacity: 0 };
    },
  };

  // Keep a data attribute on the body so global CSS (e.g., Polaris overrides) can react to theme changes.
  useEffect(() => {
    document.body.dataset.theme = darkMode;
    if (darkMode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Track scroll position for sticky panel border
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useSessionHeartbeat(SESSION_TRACKING_ENABLED && isBrandUser);

  // Push Notification setup
  useEffect(() => {
    if (!user) return;

    if (isAuthor) {
      requestForToken()
        .then((token) => {
          if (token) {
            doPost("/push/register-token", {
              token,
              user_info: {
                id: user.id || user._id,
                email: user.email,
                name: user.name,
              },
            }).then((res) => {
              if (res.error) {
                console.error("Failed to register FCM token:", res.status);
              } else {
                console.log("FCM token registered successfully");
              }
            });
          }
        })
        .catch((err) => console.error("Token request failed:", err));
    } else if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      // Non-admin user with existing permission: ensure token is unregistered
      requestForToken()
        .then((token) => {
          if (token) {
            doPost("/push/unregister-token", { token });
          }
        })
        .catch(() => {}); // Ignore errors when trying to clear
    }
  }, [user, isAuthor]);

  useEffect(() => {
    if (!isAuthor) return;

    // onMessageListener sometimes returns undefined if permissions aren't granted yet,
    // but our wrapper returns the unsubscribe function when successfully listening.
    let unsubscribe;
    try {
      unsubscribe = onMessageListener((payload) => {
        console.log("FCM Foreground message received:", payload);
        // We can trigger an event or state to refresh the notifications menu!
        // To keep it simple, we listen for window events in NotificationsMenu.
        window.dispatchEvent(new CustomEvent("fcm-foreground-message"));
      });
    } catch (err) {
      console.warn("FCM listen failed:", err);
    }
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [isAuthor]);

  const activeBrandKey = isAuthor
    ? authorBrandKey || user?.primary_brand_id || ""
    : (globalBrandKey || "").toString().trim().toUpperCase() ||
      (user?.primary_brand_id || "").toString().trim().toUpperCase() ||
      (user?.brandKey || "").toString().trim().toUpperCase() ||
      viewerBrands[0] ||
      "";

  const trafficSplitRulesStorageKey = useMemo(() => {
    const brand = (activeBrandKey || "GLOBAL").toString().trim().toUpperCase();
    return `${TRAFFIC_SPLIT_RULES_STORAGE_PREFIX}_${brand}`;
  }, [activeBrandKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(trafficSplitRulesStorageKey);
      if (!raw) {
        setTrafficSplitRules([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setTrafficSplitRules(Array.isArray(parsed) ? parsed : []);
    } catch {
      setTrafficSplitRules([]);
    }
  }, [trafficSplitRulesStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        trafficSplitRulesStorageKey,
        JSON.stringify(trafficSplitRules || []),
      );
    } catch {
      // Ignore storage write issues
    }
  }, [trafficSplitRulesStorageKey, trafficSplitRules]);

  const viewerPermissions = useMemo(() => {
    if (isAuthor) return ["all"];
    const memberships = user?.brand_memberships || [];
    const active = memberships.find(
      (m) =>
        (m.brand_id || "").toString().trim().toUpperCase() ===
        (activeBrandKey || "").toString().trim().toUpperCase(),
    );
    const source = active || memberships[0];
    const perms = source?.permissions || [];
    return perms.length ? perms : []; // Default to NO permissions if empty
  }, [isAuthor, user, activeBrandKey]);

  const hasPermission = useCallback(
    (perm) => {
      if (isAuthor) return true;
      if (viewerPermissions.includes("all")) return true;
      return viewerPermissions.includes(perm);
    },
    [isAuthor, viewerPermissions],
  );

  const canAccessRanveerRs = useMemo(() => {
    if (isAuthor) return true;
    return viewerBrands.includes("AJMAL");
  }, [isAuthor, viewerBrands]);

  const accessibleTabs = useMemo(() => {
    if (isAuthor) return null;
    const tabs = ["dashboard"];
    if (canAccessRanveerRs) tabs.push("ranveer-rs");
    // Keep viewers on dashboard tab only, even if they have funnel permission (since it's inline now)
    return tabs;
  }, [canAccessRanveerRs, isAuthor]);

  const showSidebar = isAuthor || (accessibleTabs && accessibleTabs.length > 1);

  const mobileNavItems = useMemo(() => {
    if (isAuthor) return MOBILE_NAV_ITEMS;
    return MOBILE_NAV_ITEMS.filter((item) => accessibleTabs?.includes(item.id));
  }, [isAuthor, accessibleTabs]);

  useEffect(() => {
    if (!initialized) return;
    if (authorTab === "ranveer-rs" && !canAccessRanveerRs) {
      setAuthorTab("dashboard");
      try {
        localStorage.setItem("author_active_tab_v1", "dashboard");
      } catch {
        // Ignore storage write errors
      }
    }
  }, [authorTab, canAccessRanveerRs, initialized]);

  // Derived arrays/labels for product multi-select used directly by child components
  const selectedProductIds = useMemo(() => {
    if (!productSelection) return "";
    if (Array.isArray(productSelection)) {
      return productSelection
        .map((p) => p.id)
        .filter(Boolean)
        .join(",");
    }
    return productSelection.id || "";
  }, [productSelection]);

  const selectedProductLabel = useMemo(() => {
    if (!productSelection) return "";
    if (Array.isArray(productSelection)) {
      if (productSelection.length > 1) {
        return `${productSelection.length} Products`;
      }
      return productSelection[0]?.label || "";
    }
    return productSelection.label || "";
  }, [productSelection]);

  useEffect(() => {
    if (!isAuthor && viewerBrands.length) {
      const current = (globalBrandKey || "").toString().trim().toUpperCase();
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
    const key = (activeBrandKey || "").toString().trim().toUpperCase();
    if (key) base.brand_key = key;
    if (utm?.source) base.utm_source = utm.source;
    if (utm?.medium) base.utm_medium = utm.medium;
    if (utm?.campaign) base.utm_campaign = utm.campaign;
    if (utm?.term) base.utm_term = utm.term;
    if (utm?.content) base.utm_content = utm.content;

    // Arrays allowed here
    if (salesChannel) base.sales_channel = salesChannel;
    if (deviceType && deviceType.length > 0) base.device_type = deviceType;

    if (isAuthor) {
      base.refreshKey = authorRefreshKey;
    }

    if (productSelection && (isAuthor || hasPermission("product_filter"))) {
      // Support array of products
      const products = Array.isArray(productSelection)
        ? productSelection
        : [productSelection];
      const ids = products.map((p) => p.id).filter(Boolean);
      if (ids.length > 0) base.product_id = ids;
    }

    // Compare mode: pass compare date range
    if (compareMode && compareDateRange?.[0] && compareDateRange?.[1]) {
      base.compare_start = formatDate(dayjs(compareDateRange[0]));
      base.compare_end = formatDate(dayjs(compareDateRange[1]));
    }

    return base;
  }, [
    start,
    end,
    compareMode,
    compareDateRange,
    activeBrandKey,
    isAuthor,
    authorRefreshKey,
    productSelection,
    utm,
    salesChannel,
    deviceType,
  ]);

  // General Query (Legacy / Single Value Fallback)
  const generalMetricsQuery = useMemo(() => {
    const base = { ...trendMetricsQuery };

    // Fallback to single value for components that don't support arrays yet
    if (Array.isArray(base.sales_channel)) {
      base.sales_channel = base.sales_channel[0] || "";
    }
    if (Array.isArray(base.product_id)) {
      base.product_id = base.product_id[0] || "";
    }
    // Also fallback UTMs if needed? most backends handle arrays now but let's be safe if specific components break
    // Actually metricsController seems to handle arrays mostly via `extractUtmParam` or `appendUtmWhere` which handles arrays.
    // But let's keep consistency with the requirement "only Trend Graph and 6 KPI Cards".

    return base;
  }, [trendMetricsQuery]);

  const escapeCsvCell = useCallback((value) => {
    const str = value == null ? "" : String(value);
    if (str.includes('"') || str.includes(",") || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }, []);

  const exportStartDate =
    generalMetricsQuery?.start || generalMetricsQuery?.end || "";
  const exportEndDate =
    generalMetricsQuery?.end || generalMetricsQuery?.start || exportStartDate;

  const asExcelTextDate = useCallback((value) => {
    return value ? `'${value}` : "";
  }, []);

  const buildBaseRow = useCallback((overrides = {}) => ({
    section: "",
    subsection: "",
    item_type: "",
    item_key: "",
    item_name: "",
    hour: "",
    rank: "",
    category: "",
    source_name: "",
    page_name: "",
    payment_mode: "",
    metric: "",
    value: "",
    previous_value: "",
    change_percent: "",
    unit: "",
    start_date: asExcelTextDate(exportStartDate),
    end_date: asExcelTextDate(exportEndDate),
    brand_key: activeBrandKey || "",
    selected_web_vitals_metric: "",
    generated_at: "",
    ...overrides,
  }), [activeBrandKey, asExcelTextDate, exportEndDate, exportStartDate]);

  const toBrandNameForPagespeed = useCallback((brandKey) => {
    switch ((brandKey || "").toUpperCase()) {
      case "TMC":
        return "TMC";
      case "BBB":
        return "BlaBliBluLife";
      case "PTS":
        return "SkincarePersonalTouch";
      default:
        return (brandKey || "").toUpperCase();
    }
  }, []);

  const getPreviousDateWindow = useCallback((startDate, endDate) => {
    if (!startDate || !endDate) return { prevStart: null, prevEnd: null };
    const s = dayjs(startDate);
    const e = dayjs(endDate);
    const dayCount = e.diff(s, "day") + 1;
    const prevEnd = s.subtract(1, "day");
    const prevStart = prevEnd.subtract(dayCount - 1, "day");
    return {
      prevStart: prevStart.format("YYYY-MM-DD"),
      prevEnd: prevEnd.format("YYYY-MM-DD"),
    };
  }, []);

  const fetchPagespeedResults = useCallback(async (brandName, startDate, endDate) => {
    if (!brandName || !startDate || !endDate) return [];
    const params = new URLSearchParams({
      brand_key: brandName,
      start_date: startDate,
      end_date: endDate,
    });
    const response = await fetch(`/api/external-pagespeed/pagespeed?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`pagespeed request failed: ${response.status}`);
    }
    const json = await response.json();
    return Array.isArray(json?.results) ? json.results : [];
  }, []);

  const buildWebVitalsSnapshot = useCallback(
    async (query, selectedMetric) => {
      const metricKey = WEB_VITAL_METRIC_KEYS[selectedMetric] || "fcp";
      const brandName = toBrandNameForPagespeed(query?.brand_key || activeBrandKey);
      const currentStart = query?.start;
      const currentEnd = query?.end;
      if (!brandName || !currentStart || !currentEnd) {
        return {
          selected_metric: selectedMetric,
          performance: {
            current_avg: null,
            previous_avg: null,
            change_percent: null,
          },
          top_pages: [],
        };
      }

      const { prevStart, prevEnd } = getPreviousDateWindow(currentStart, currentEnd);
      const [currentResults, previousResults] = await Promise.all([
        fetchPagespeedResults(brandName, currentStart, currentEnd),
        prevStart && prevEnd
          ? fetchPagespeedResults(brandName, prevStart, prevEnd)
          : Promise.resolve([]),
      ]);

      const performanceCurrent =
        currentResults.reduce((sum, row) => sum + Number(row?.performance || 0), 0) /
        (currentResults.length || 1);
      const performancePrevious =
        previousResults.reduce((sum, row) => sum + Number(row?.performance || 0), 0) /
        (previousResults.length || 1);
      const performanceChange =
        performancePrevious > 0
          ? ((performanceCurrent - performancePrevious) / performancePrevious) * 100
          : null;

      const reduceByUrl = (results) => {
        const grouped = {};
        for (const row of results) {
          const url = String(row?.url || "");
          if (!url) continue;
          if (!grouped[url]) grouped[url] = [];
          grouped[url].push(Number(row?.[metricKey] || 0));
        }
        return Object.entries(grouped).map(([url, values]) => {
          const sum = values.reduce((a, b) => a + b, 0);
          const isSumMetric = metricKey === "sessions";
          return {
            url,
            value: isSumMetric ? sum : sum / values.length,
          };
        });
      };

      const currentPages = reduceByUrl(currentResults);
      const previousPages = reduceByUrl(previousResults);
      const topPages = currentPages
        .map((page) => {
          const previous = previousPages.find((p) => p.url === page.url);
          const previousValue = previous?.value ?? null;
          const changePercent =
            previousValue && previousValue > 0
              ? ((page.value - previousValue) / previousValue) * 100
              : null;
          return {
            page_name: page.url,
            value: Number(page.value || 0),
            previous_value: previousValue,
            change_percent: changePercent,
          };
        })
        .sort((a, b) => {
          const descending = selectedMetric === "SESSIONS" || selectedMetric === "PERFORMANCE";
          return descending ? b.value - a.value : a.value - b.value;
        })
        .slice(0, 5);

      return {
        selected_metric: selectedMetric,
        performance: {
          current_avg: Number.isFinite(performanceCurrent) ? performanceCurrent : null,
          previous_avg: Number.isFinite(performancePrevious) ? performancePrevious : null,
          change_percent: Number.isFinite(performanceChange)
            ? performanceChange
            : null,
        },
        top_pages: topPages,
      };
    },
    [activeBrandKey, fetchPagespeedResults, getPreviousDateWindow, toBrandNameForPagespeed],
  );

  const handleDownloadSnapshot = useCallback(async () => {
    try {
      const summaryBase = {
        ...trendMetricsQuery,
        align: "hour",
      };

      
      const [summary, hourlyTrend, orderSplit, salesSplit, trafficSplit, webVitals] =
        await Promise.all([
          getDashboardSummary(summaryBase),
          getHourlyTrend({ ...trendMetricsQuery, aggregate: "avg-by-hour" }),
          getOrderSplit(generalMetricsQuery),
          getPaymentSalesSplit(generalMetricsQuery),
          getTrafficSourceSplit({
            ...generalMetricsQuery,
            mappingRules: trafficSplitRules,
          }),
          buildWebVitalsSnapshot(generalMetricsQuery, webVitalsMetric),
        ]);

      const metrics = summary?.metrics || {};
      const totalOrders = Number(metrics?.total_orders?.value || 0);
      const cancelledOrders = Number(metrics?.cancelled_orders?.value || 0);
      const refundedOrders = Number(metrics?.refunded_orders?.value || 0);

      const kpis = [
        { name: "Total Orders", key: "orders", value: totalOrders },
        { name: "Gross Revenue", key: "sales", value: Number(metrics?.total_sales?.value || 0) },
        {
          name: "Average Order Value",
          key: "aov",
          value: Number(metrics?.average_order_value?.value || 0),
        },
        {
          name: "Conversion Rate",
          key: "cvr",
          value: Number(metrics?.conversion_rate?.value || 0),
        },
        {
          name: "Total Sessions",
          key: "sessions",
          value: Number(metrics?.total_sessions?.value || 0),
        },
        {
          name: "ATC Sessions",
          key: "atc",
          value: Number(metrics?.total_atc_sessions?.value || 0),
        },
        {
          name: "Cancellation Rate",
          key: "cancellation_rate",
          value: totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0,
        },
        {
          name: "Refund Rate",
          key: "refund_rate",
          value: totalOrders > 0 ? (refundedOrders / totalOrders) * 100 : 0,
        },
        {
          name: "Web Performance(Avg)",
          key: "web_performance_avg",
          value: Number(webVitals?.performance?.current_avg || 0),
        },
      ];

      const hourlyPoints = Array.isArray(hourlyTrend?.points) ? hourlyTrend.points : [];
      const mapHourlySeries = (key, name, getter) => ({
        key,
        name,
        points: hourlyPoints.map((point) => ({
          hour: point?.hour,
          value: getter(point?.metrics || {}),
        })),
      });

      const hourlyTrends = [
        mapHourlySeries("orders", "Total Orders", (m) => Number(m?.orders || 0)),
        mapHourlySeries("sales", "Gross Revenue", (m) => Number(m?.sales || 0)),
        mapHourlySeries("aov", "Average Order Value", (m) => {
          const sales = Number(m?.sales || 0);
          const orders = Number(m?.orders || 0);
          return orders > 0 ? sales / orders : 0;
        }),
        mapHourlySeries("cvr", "Conversion Rate", (m) => Number(m?.cvr_ratio || 0) * 100),
        mapHourlySeries("sessions", "Total Sessions", (m) => Number(m?.sessions || 0)),
        mapHourlySeries("atc", "ATC Sessions", (m) => Number(m?.atc || 0)),
      ];

      const trafficCategories = [
        {
          category: "meta",
          label: "Meta",
          sessions: Number(trafficSplit?.meta?.sessions || 0),
          atc_sessions: Number(trafficSplit?.meta?.atc_sessions || 0),
          delta_percent: trafficSplit?.meta?.delta ?? null,
          atc_delta_percent: trafficSplit?.meta?.atc_delta ?? null,
          sources: Array.isArray(trafficSplit?.meta_breakdown)
            ? trafficSplit.meta_breakdown.map((src) => ({
                source_name: src?.name || "",
                sessions: Number(src?.sessions || 0),
                atc_sessions: Number(src?.atc_sessions || 0),
              }))
            : [],
        },
        {
          category: "google",
          label: "Google",
          sessions: Number(trafficSplit?.google?.sessions || 0),
          atc_sessions: Number(trafficSplit?.google?.atc_sessions || 0),
          delta_percent: trafficSplit?.google?.delta ?? null,
          atc_delta_percent: trafficSplit?.google?.atc_delta ?? null,
          sources: [],
        },
        {
          category: "direct",
          label: "Direct",
          sessions: Number(trafficSplit?.direct?.sessions || 0),
          atc_sessions: Number(trafficSplit?.direct?.atc_sessions || 0),
          delta_percent: trafficSplit?.direct?.delta ?? null,
          atc_delta_percent: trafficSplit?.direct?.atc_delta ?? null,
          sources: [],
        },
        {
          category: "others",
          label: "Others",
          sessions: Number(trafficSplit?.others?.sessions || 0),
          atc_sessions: Number(trafficSplit?.others?.atc_sessions || 0),
          delta_percent: trafficSplit?.others?.delta ?? null,
          atc_delta_percent: trafficSplit?.others?.atc_delta ?? null,
          sources: Array.isArray(trafficSplit?.others_breakdown)
            ? trafficSplit.others_breakdown.map((src) => ({
                source_name: src?.name || "",
                sessions: Number(src?.sessions || 0),
                atc_sessions: Number(src?.atc_sessions || 0),
              }))
            : [],
        },
      ];

      const generatedAt = new Date().toISOString();
      const rows = [];

      rows.push(
        buildBaseRow({
          section: "meta",
          subsection: "snapshot",
          item_type: "generated",
          item_name: "generated_at",
          metric: "generated_at",
          value: generatedAt,
          generated_at: generatedAt,
        }),
      );

      rows.push(
        buildBaseRow({
          section: "filters",
          subsection: "applied",
          item_type: "flag",
          item_name: "compare_mode",
          metric: "compare_mode",
          value: compareMode ? "true" : "false",
          generated_at: generatedAt,
        }),
      );

      const filterRows = [
        ["compare_start", generalMetricsQuery?.compare_start || ""],
        ["compare_end", generalMetricsQuery?.compare_end || ""],
        ["product_id", Array.isArray(generalMetricsQuery?.product_id)
          ? generalMetricsQuery.product_id.join("|")
          : (generalMetricsQuery?.product_id || "")],
        ["utm_source", Array.isArray(generalMetricsQuery?.utm_source)
          ? generalMetricsQuery.utm_source.join("|")
          : (generalMetricsQuery?.utm_source || "")],
        ["utm_medium", Array.isArray(generalMetricsQuery?.utm_medium)
          ? generalMetricsQuery.utm_medium.join("|")
          : (generalMetricsQuery?.utm_medium || "")],
        ["utm_campaign", Array.isArray(generalMetricsQuery?.utm_campaign)
          ? generalMetricsQuery.utm_campaign.join("|")
          : (generalMetricsQuery?.utm_campaign || "")],
        ["sales_channel", Array.isArray(generalMetricsQuery?.sales_channel)
          ? generalMetricsQuery.sales_channel.join("|")
          : (generalMetricsQuery?.sales_channel || "")],
        ["device_type", Array.isArray(generalMetricsQuery?.device_type)
          ? generalMetricsQuery.device_type.join("|")
          : (generalMetricsQuery?.device_type || "")],
      ];

      for (const [name, value] of filterRows) {
        rows.push(
          buildBaseRow({
            section: "filters",
            subsection: "applied",
            item_type: "filter",
            item_name: name,
            metric: name,
            value,
            generated_at: generatedAt,
          }),
        );
      }

      for (const kpi of kpis) {
        rows.push(
          buildBaseRow({
            section: "kpis",
            subsection: "summary",
            item_type: "kpi",
            item_key: kpi.key,
            item_name: kpi.name,
            metric: kpi.key,
            value: kpi.value,
            unit: kpi.key.includes("rate") || kpi.key === "cvr" ? "percent" : "value",
            generated_at: generatedAt,
          }),
        );
      }

      for (const trend of hourlyTrends) {
        for (const point of trend.points) {
          rows.push(
            buildBaseRow({
              section: "hourly_trends",
              subsection: trend.key,
              item_type: "hourly_point",
              item_key: trend.key,
              item_name: trend.name,
              hour: point.hour,
              metric: trend.key,
              value: point.value,
              unit: trend.key.includes("rate") || trend.key === "cvr" ? "percent" : "value",
              generated_at: generatedAt,
            }),
          );
        }
      }

      rows.push(
        buildBaseRow({
          section: "web_vitals",
          subsection: "performance",
          item_type: "summary",
          item_key: "web_performance_avg",
          item_name: "Web Performance(Avg)",
          metric: "performance_avg",
          value: webVitals?.performance?.current_avg ?? "",
          previous_value: webVitals?.performance?.previous_avg ?? "",
          change_percent: webVitals?.performance?.change_percent ?? "",
          generated_at: generatedAt,
        }),
      );

      (webVitals?.top_pages || []).forEach((page, index) => {
        rows.push(
          buildBaseRow({
            section: "web_vitals",
            subsection: "top_pages",
            item_type: "top_page",
            item_name: `Top Page ${index + 1}`,
            rank: index + 1,
            page_name: page.page_name || "",
            metric: webVitals?.selected_metric || webVitalsMetric,
            value: page.value ?? "",
            previous_value: page.previous_value ?? "",
            change_percent: page.change_percent ?? "",
            selected_web_vitals_metric:
              webVitals?.selected_metric || webVitalsMetric || "",
            generated_at: generatedAt,
          }),
        );
      });

      [
        { subsection: "by_order_count", items: [
          { payment_mode: "Prepaid", value: Number(orderSplit?.prepaid_orders || 0) },
          { payment_mode: "COD", value: Number(orderSplit?.cod_orders || 0) },
          { payment_mode: "Partially paid", value: Number(orderSplit?.partially_paid_orders || 0) },
        ] },
        { subsection: "by_sales", items: [
          { payment_mode: "Prepaid", value: Number(salesSplit?.prepaid_sales || 0) },
          { payment_mode: "COD", value: Number(salesSplit?.cod_sales || 0) },
          { payment_mode: "Partial", value: Number(salesSplit?.partial_sales || 0) },
        ] },
      ].forEach((split) => {
        split.items.forEach((item) => {
          rows.push(
            buildBaseRow({
              section: "payment_splits",
              subsection: split.subsection,
              item_type: "payment_mode",
              payment_mode: item.payment_mode,
              metric: split.subsection,
              value: item.value,
              generated_at: generatedAt,
            }),
          );
        });
      });

      for (const category of trafficCategories) {
        rows.push(
          buildBaseRow({
            section: "traffic_split",
            subsection: "category_summary",
            item_type: "traffic_category",
            category: category.label,
            metric: "sessions",
            value: category.sessions,
            change_percent: category.delta_percent ?? "",
            generated_at: generatedAt,
          }),
        );
        rows.push(
          buildBaseRow({
            section: "traffic_split",
            subsection: "category_summary",
            item_type: "traffic_category",
            category: category.label,
            metric: "atc_sessions",
            value: category.atc_sessions,
            change_percent: category.atc_delta_percent ?? "",
            generated_at: generatedAt,
          }),
        );

        for (const src of category.sources || []) {
          rows.push(
            buildBaseRow({
              section: "traffic_split",
              subsection: "source_breakdown",
              item_type: "traffic_source",
              category: category.label,
              source_name: src.source_name,
              metric: "sessions",
              value: src.sessions,
              generated_at: generatedAt,
            }),
          );
          rows.push(
            buildBaseRow({
              section: "traffic_split",
              subsection: "source_breakdown",
              item_type: "traffic_source",
              category: category.label,
              source_name: src.source_name,
              metric: "atc_sessions",
              value: src.atc_sessions,
              generated_at: generatedAt,
            }),
          );
        }
      }

      const csvHeader = [
        "section",
        "subsection",
        "item_type",
        "item_key",
        "item_name",
        "hour",
        "rank",
        "category",
        "source_name",
        "page_name",
        "payment_mode",
        "metric",
        "value",
        "previous_value",
        "change_percent",
        "unit",
        "start_date",
        "end_date",
        "brand_key",
        "selected_web_vitals_metric",
        "generated_at",
      ];
      const csvLines = [
        csvHeader.join(","),
        ...rows.map((row) => csvHeader.map((col) => escapeCsvCell(row[col])).join(",")),
      ];
      const csvText = `${csvLines.join("\n")}\n`;

      const filename = `datum_snapshot_${generalMetricsQuery?.start || "start"}_${generalMetricsQuery?.end || "end"}.csv`;
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to build dashboard snapshot:", error);
      window.alert("Failed to download dashboard snapshot. Please try again.");
    }
  }, [
    buildWebVitalsSnapshot,
    buildBaseRow,
    compareMode,
    escapeCsvCell,
    generalMetricsQuery,
    trafficSplitRules,
    trendMetricsQuery,
    webVitalsMetric,
  ]);

  const handleAuthorBrandChange = useCallback(
    (nextKeyRaw) => {
      const normalized = (nextKeyRaw || "").toString().trim().toUpperCase();
      const changed = normalized !== authorBrandKey;
      // Persist immediately alongside Redux
      try {
        localStorage.setItem("author_active_brand_v1", normalized);
      } catch {
        // Ignore storage write errors
      }

      dispatch(setBrand(normalized || ""));
      if (changed) {
        setAuthorRefreshKey((prev) => prev + 1);
      }
    },
    [authorBrandKey, dispatch],
  );

  // Reset UTM filters when brand changes
  useEffect(() => {
    dispatch(
      setUtm({ source: [], medium: [], campaign: [], term: [], content: [] }),
    );
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
    listAuthorBrands()
      .then((json) => {
        if (cancelled) return;
        if (json.__error || json.error) {
          setAuthorBrands([]);
          return;
        }
        const payload = json.data ?? json;
        const arr = Array.isArray(payload.brands)
          ? payload.brands.map((b) => ({
              key: (b.key || "").toString().trim().toUpperCase(),
              host: b.host,
              db: b.db,
            }))
          : []; // EXPLICIT REMOVAL
        setAuthorBrands(arr);
      })
      .finally(() => {
        if (!cancelled) {
          setAuthorBrandsLoading(false);
          setBrandsLoaded(true); // Mark as fully loaded
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthor]);

  useEffect(() => {
    if (!isAuthor) return;
    // CRITICAL: Strict check for completion of initial load
    if (!brandsLoaded) return;

    if (!authorBrands.length) {
      if (authorBrandKey) {
        handleAuthorBrandChange("");
      }
      return;
    }
    const normalized = (authorBrandKey || "").toString().trim().toUpperCase();
    const exists = normalized && authorBrands.some((b) => b.key === normalized);

    // Only force reset if we are sure the list is loaded and the key is truly invalid
    if (!exists) {
      handleAuthorBrandChange(authorBrands[0].key);
    }
  }, [
    isAuthor,
    authorBrands,
    authorBrandKey,
    handleAuthorBrandChange,
    brandsLoaded,
  ]);

  // Brand Enforcement on Load (URL Parameter > Primary Brand > Persisted)
  const [brandEnforcementDone, setBrandEnforcementDone] = useState(false);
  useEffect(() => {
    if (!initialized || !user || brandEnforcementDone) return;

    let enforcedBrand = null;
    const current = (globalBrandKey || "").toString().trim().toUpperCase();

    // 1. Check URL parameters
    const params = new URLSearchParams(window.location.search);
    const urlBrand = params.get("brand");

    if (urlBrand) {
      const normalizedUrl = urlBrand.trim().toUpperCase();
      // For authors, we assume the URL brand is acceptable for now.
      // It will be strictly validated later when authorBrands loaded.
      const isValidUrlBrand = isAuthor || viewerBrands.includes(normalizedUrl);

      if (isValidUrlBrand) {
        enforcedBrand = normalizedUrl;
        // Clean URL
        params.delete("brand");
        const newSearch = params.toString() ? `?${params.toString()}` : "";
        const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}${newSearch}${window.location.hash}`;
        window.history.replaceState({ path: newUrl }, "", newUrl);
      }
    }

    // 2. If no valid URL brand, and user is viewer, check Primary
    if (!enforcedBrand && !isAuthor) {
      const primary = (user.primary_brand_id || "")
        .toString()
        .trim()
        .toUpperCase();
      if (primary && viewerBrands.includes(primary)) {
        enforcedBrand = primary;
      }
    }

    if (enforcedBrand && current !== enforcedBrand) {
      handleAuthorBrandChange(enforcedBrand);
    }

    setBrandEnforcementDone(true);
  }, [
    initialized,
    user,
    isAuthor,
    viewerBrands,
    globalBrandKey,
    brandEnforcementDone,
    handleAuthorBrandChange,
  ]);

  // Persist tab state only for authors
  useEffect(() => {
    // Wait until initialized to decide if we should reset tab
    if (initialized && !isAuthor && (!accessibleTabs || !accessibleTabs.includes(authorTab))) {
      setAuthorTab("dashboard");
    }

    // Guard against legacy tab state that no longer exists
    if (initialized && authorTab === "adjustments") {
      setAuthorTab("dashboard");
      try {
        localStorage.setItem("author_active_tab_v1", "dashboard");
      } catch {
        // ignore storage issues
      }
    }
  }, [isAuthor, initialized, authorTab]);

  useEffect(() => {
    // Only authors or users with product_filter permission should see/use product filters; reset for everyone else.
    if (!isAuthor && !hasPermission("product_filter")) {
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
              const rawPath = (p.landing_page_path || "").toString();
              const slug = rawPath.includes("/products/")
                ? rawPath.split("/products/")[1] || rawPath
                : rawPath || p.product_id;
              const label = slug || p.product_id || "Unknown product";
              const sessions = Number(p.sessions || 0);
              const detail = `${sessions.toLocaleString()} sessions`;
              return { id: p.product_id, label, detail };
            })
          : [];

        const nextOptions = [DEFAULT_PRODUCT_OPTION, ...mapped];
        setProductOptions(nextOptions);

        // map current selection IDs to new options
        const currentIds = new Set(
          Array.isArray(productSelection)
            ? productSelection.map((p) => p.id)
            : [],
        );
        const validSelection = nextOptions.filter(
          (opt) => currentIds.has(opt.id) && opt.id !== "",
        );

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
  }, [
    start,
    end,
    activeBrandKey,
    authorRefreshKey,
    productSelection,
    initialized,
    user,
    isAuthor,
    hasPermission,
  ]);

  const handleSelectMetric = useCallback(
    (metricKey) => {
      if (!metricKey) return;
      dispatch(
        setSelectedMetric(
          TREND_METRICS.has(metricKey) ? metricKey : DEFAULT_TREND_METRIC,
        ),
      );
    },
    [dispatch],
  );

  const handleRangeChange = useCallback(
    (nextRange) => {
      if (!Array.isArray(nextRange)) return;
      dispatch(setRange(nextRange));
    },
    [dispatch],
  );

  const handleProductChange = useCallback(
    (value) => {
      // Reset UTMs when product changes
      dispatch(
        setUtm({ source: [], medium: [], campaign: [], term: [], content: [] }),
      );
      dispatch(setProductSelection(value || DEFAULT_PRODUCT_OPTION));
    },
    [dispatch],
  );

  const handleUtmChange = useCallback(
    (val) => {
      // Simply dispatch the new UTM object; multiselect logic is handled in the components
      dispatch(setUtm(val));
    },
    [dispatch],
  );

  const handleSalesChannelChange = useCallback(
    (val) => {
      dispatch(setSalesChannel(val));
    },
    [dispatch],
  );

  const handleDeviceTypeChange = useCallback(
    (val) => {
      dispatch(setDeviceType(val));
    },
    [dispatch],
  );

  const handleCompareModeChange = useCallback(
    (enabled) => {
      dispatch(setCompareMode(enabled));
      if (!enabled) {
        dispatch(setCompareDateRange([null, null]));
      }
    },
    [dispatch],
  );

  const handleCompareDateRangeChange = useCallback(
    (nextRange) => {
      if (!Array.isArray(nextRange)) return;
      dispatch(setCompareDateRange(nextRange));
    },
    [dispatch],
  );

  const handleSidebarOpen = useCallback(() => setSidebarOpen(true), []);
  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleSidebarTabChange = useCallback((tabId) => {
    setAuthorTab((prev) => {
      const oldIndex = MOBILE_NAV_ITEMS.findIndex((item) => item.id === prev);
      const newIndex = MOBILE_NAV_ITEMS.findIndex((item) => item.id === tabId);

      if (oldIndex !== -1 && newIndex !== -1) {
        setDirection(newIndex > oldIndex ? 1 : -1);
      } else {
        setDirection(0);
      }
      return tabId;
    });

    try {
      localStorage.setItem("author_active_tab_v1", tabId);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const handleToggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
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
    setFunnelData((prev) => {
      // If we are loading and have no stats yet in the new update,
      // but we ALREADY have stats from before, keep showing the old stats
      // to avoid a skeleton flash during the refresh.
      if (newData.loading && !newData.stats && prev?.stats) {
        return { ...newData, stats: prev.stats };
      }
      return newData;
    });
  }, []);

  const glassStyles = useMemo(
    () => ({
      backdropFilter: "blur(12px)",
      backgroundColor:
        darkMode === "dark"
          ? "rgba(255, 255, 255, 0.08)"
          : "rgba(255, 255, 255, 0.7)",
      border: "1px solid",
      borderColor:
        darkMode === "dark"
          ? "rgba(255, 255, 255, 0.15)"
          : "rgba(0, 0, 0, 0.05)",
    }),
    [darkMode],
  );

  const depthShadows = useMemo(
    () => ({
      boxShadow:
        darkMode === "dark"
          ? "0 20px 40px rgba(0, 0, 0, 0.6), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.15)"
          : "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.5)",
    }),
    [darkMode],
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode,
          ...(darkMode === "light"
            ? {
                primary: { main: "#0b6bcb" },
                background: { default: "#FDFDFD", paper: "#ffffff" },
              }
            : {
                primary: { main: "#5ba3e0" },
                background: { default: "#000000", paper: "#1a1a1a" },
                text: {
                  primary: "#f0f0f0",
                  secondary: "#c0c0c0",
                  disabled: "#808080",
                },
                divider: "#404040",
              }),
        },
        shape: { borderRadius: 12 },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 16,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                ...glassStyles,
                ...depthShadows,
                backgroundImage: "none",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow:
                    darkMode === "dark"
                      ? "0 30px 60px rgba(0, 0, 0, 0.8), inset 1px 1px 0px 0px rgba(255, 255, 255, 0.25)"
                      : "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
                },
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
                ...(darkMode === "dark"
                  ? {
                      backgroundColor: "rgba(65, 65, 65, 0.15)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                    }
                  : {}),
              },
            },
          },
        },
      }),
    [darkMode],
  );

  // Light-only theme for sign-in page
  const lightTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "light",
          primary: { main: "#0b6bcb" },
          background: { default: "#FDFDFD", paper: "#ffffff" },
        },
        shape: { borderRadius: 12 },
      }),
    [],
  );

  // Persist when range changes
  useEffect(() => {
    if (start && end) {
      try {
        const sIso = dayjs(start).isValid() ? dayjs(start).toISOString() : null;
        const eIso = dayjs(end).isValid() ? dayjs(end).toISOString() : null;
        if (sIso && eIso) {
          localStorage.setItem(
            "pts_date_range_v2",
            JSON.stringify({ start: sIso, end: eIso, savedAt: Date.now() }),
          );
        }
      } catch {
        // Ignore storage write errors
      }
    }
  }, [start, end]);

  useEffect(() => {
    try {
      localStorage.setItem("pts_utm_filters_v1", JSON.stringify(utm));
    } catch {
      // Ignore
    }
  }, [utm]);

  // Centralized UTM clearing for > 30 days
  useEffect(() => {
    if (!start || !end) return;
    const isOver30 = end.diff(start, "day") > 30;
    const hasUtm = Object.values(utm).some((v) =>
      Array.isArray(v) ? v.length > 0 : !!v,
    );

    if (isOver30 && hasUtm) {
      dispatch(
        setUtm({ source: [], medium: [], campaign: [], term: [], content: [] }),
      );
    }
  }, [start, end, utm, dispatch]);

  // Fetch UTM Options (Lifted from MobileTopBar)
  // Fetch UTM Options (Lifted from MobileTopBar)
  const lastFetchParams = useMemo(() => {
    return {
      brand: activeBrandKey,
      start: formatDate(start),
      end: formatDate(end),
      utm: JSON.stringify(utm),
      salesChannel: JSON.stringify(salesChannel),
      deviceType: JSON.stringify(deviceType),
      compare: compareMode,
      product: JSON.stringify(productSelection),
    };
  }, [
    activeBrandKey,
    start,
    end,
    utm,
    salesChannel,
    deviceType,
    compareMode,
    productSelection,
  ]);

  useEffect(() => {
    if (!activeBrandKey) return;

    // We use lastFetchParams to decide if we REALLY need a fetch.
    // However, since this effect depends on the memoized lastFetchParams,
    // it will only run when the params actually change.
    // The previous check was potentially too aggressive by blocking on brand_key alone.

    const productsForQuery = Array.isArray(productSelection)
      ? productSelection
      : [productSelection];
    const productIds = productsForQuery.map((p) => p.id).filter(Boolean);

    getDashboardSummary({
      brand_key: activeBrandKey,
      start: formatDate(start),
      end: formatDate(end),
      include_utm_options: true,
      utm_source: utm?.source, // Dependent filtering
      utm_medium: utm?.medium,
      utm_campaign: utm?.campaign,
      sales_channel: salesChannel,
      device_type: deviceType,
      compare: compareMode, // Include compare mode for deltas
      product_id: productIds.length > 0 ? productIds : undefined,
    })
      .then((res) => {
        if (res.filter_options) {
          setUtmOptions({ ...res.filter_options, brand_key: activeBrandKey });
        }

        // Also update funnelData for the Funnels tab and inline charts
        if (res.metrics) {
          const m = res.metrics;
          const stats = {
            total_sessions: m.total_sessions?.value ?? 0,
            total_atc_sessions: m.total_atc_sessions?.value ?? 0,
            total_orders: m.total_orders?.value ?? 0,
          };
          const deltas = {
            sessions: {
              diff_pct: m.total_sessions?.diff_pct,
              direction: m.total_sessions?.direction,
            },
            atc: {
              diff_pct: m.total_atc_sessions?.diff_pct,
              direction: m.total_atc_sessions?.direction,
            },
            orders: {
              diff_pct: m.total_orders?.diff_pct,
              diff_pp: m.total_orders?.diff_pp,
              direction: m.total_orders?.direction,
            },
          };
          handleFunnelData({ stats, deltas, loading: false });
        }
      })
      .catch(() => {
        handleFunnelData({ stats: null, deltas: null, loading: false });
      });
  }, [lastFetchParams, isAuthor, handleFunnelData]); // Depend on stable memoized params

  // Sync funnel data with product table's Curr date when on Funnels tab
  useEffect(() => {
    if (!isAuthor || authorTab !== "product-conversion") return;
    if (!activeBrandKey || !productTableStart || !productTableEnd) return;

    // Fetch funnel data using the product table's current date range
    getDashboardSummary({
      brand_key: activeBrandKey,
      start: productTableStart,
      end: productTableEnd,
      include_utm_options: false,
    })
      .then((res) => {
        if (res.metrics) {
          const m = res.metrics;
          const stats = {
            total_sessions: m.total_sessions?.value ?? 0,
            total_atc_sessions: m.total_atc_sessions?.value ?? 0,
            total_orders: m.total_orders?.value ?? 0,
          };
          const deltas = {
            sessions: {
              diff_pct: m.total_sessions?.diff_pct,
              direction: m.total_sessions?.direction,
            },
            atc: {
              diff_pct: m.total_atc_sessions?.diff_pct,
              direction: m.total_atc_sessions?.direction,
            },
            orders: {
              diff_pct: m.total_orders?.diff_pct,
              diff_pp: m.total_orders?.diff_pp,
              direction: m.total_orders?.direction,
            },
          };
          handleFunnelData({ stats, deltas, loading: false });
        }
      })
      .catch(() => {
        // Don't clear funnel data on error — keep previous data
      });
  }, [
    isAuthor,
    authorTab,
    activeBrandKey,
    productTableStart,
    productTableEnd,
    handleFunnelData,
  ]);

  // Check auth on mount
  useEffect(() => {
    // Check for access_token in URL (OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (token) {
      window.localStorage.setItem("gateway_access_token", token);
      if (refreshToken) {
        window.localStorage.setItem("gateway_refresh_token", refreshToken);
      }
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    dispatch(fetchCurrentUser());

    // Check for brand parameter to select it automatically (Deep Linking)
    const brandParam = params.get("brand");
    if (brandParam) {
      dispatch(setBrand(brandParam.toUpperCase()));
    }
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
    const action = await dispatch(
      loginUser({ email: loginForm.email, password: loginForm.password }),
    );
    if (loginUser.fulfilled.match(action)) {
      setLoginForm({ email: "", password: "" });
    }
  }

  async function handleLogout() {
    // Attempt to unregister FCM token before logging out
    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const token = await requestForToken();
        if (token) {
          await axios.post(
            "/api/push/unregister-token",
            { token },
            { withCredentials: true },
          );
        }
      }
    } catch (err) {
      console.warn("FCM unregister on logout failed:", err);
    }
    dispatch(logoutUser());
  }

  if (!initialized) return null;

  if (!user) {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname || "/";
    const error = params.get("error") || "";
    const reason = params.get("reason") || "";
    const isUnauthorized =
      (path.startsWith("/login") || path.startsWith("/unauthorized")) &&
      (error === "google_oauth_failed" ||
        error === "not_authorized" ||
        reason === "not_authorized_domain");

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
        <Box
          sx={{
            minHeight: "100svh",
            bgcolor: "background.default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
          }}
        >
          <Container maxWidth="xs">
            <Paper
              elevation={3}
              sx={{ p: 3, borderRadius: 3 }}
              component="form"
              onSubmit={handleLogin}
            >
              <Stack spacing={2}>
                <Box sx={{ display: "flex", justifyContent: "center" }}>
                  <Box
                    component="img"
                    src="/brand-logo-final.png"
                    alt="Datum"
                    sx={{ height: 80, width: 220, objectFit: "contain" }}
                  />
                </Box>
                <TextField
                  size="small"
                  label="Email"
                  type="email"
                  required
                  value={loginForm.email}
                  onChange={(e) =>
                    setLoginForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
                <TextField
                  size="small"
                  label="Password"
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
                {loginError && <Alert severity="error">{loginError}</Alert>}
                <Button variant="contained" type="submit" disabled={loggingIn}>
                  {loggingIn ? "Logging in..." : "Login"}
                </Button>
                <Divider>or</Divider>
                <button
                  type="button"
                  className="gsi-material-button"
                  onClick={() => {
                    const base = import.meta.env.VITE_API_BASE || "/api";
                    const target = base.startsWith("http")
                      ? base
                      : `${window.location.origin}${base}`;

                    const redirect =
                      import.meta.env.VITE_OAUTH_REDIRECT ||
                      window.location.origin;

                    window.location.href = `${target.replace(/\/$/, "")}/auth/google/start?redirect=${encodeURIComponent(redirect)}`;
                    console.log(window.location.href);
                  }}
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon" aria-hidden>
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                        style={{ display: "block" }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        ></path>
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        ></path>
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        ></path>
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        ></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      Sign in with Google
                    </span>
                    <span style={{ display: "none" }}>Sign in with Google</span>
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
  const hasBrand = Boolean((activeBrandKey || "").trim());
  const availableBrands = isAuthor
    ? authorBrands
    : viewerBrands.map((key) => ({ key }));
  const brandsForSelector = isAuthor ? authorBrands : viewerBrands;
  const showMultipleBrands = isAuthor
    ? authorBrands.length > 0
    : viewerBrands.length > 1;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppProvider
        i18n={enTranslations}
        theme={{ colorScheme: darkMode === "dark" ? "dark" : "light" }}
      >
        <Box
          sx={{
            display: "flex",
            minHeight: "100svh",
            bgcolor: "background.default",
          }}
        >
          {/* Sidebar Navigation - for authors OR viewers with multiple tabs */}
          {showSidebar && (
            <Sidebar
              open={isMobile ? sidebarOpen : desktopSidebarOpen}
              onClose={
                isMobile
                  ? handleSidebarClose
                  : () => setDesktopSidebarOpen(false)
              }
              activeTab={authorTab}
              onTabChange={handleSidebarTabChange}
              darkMode={darkMode === "dark"}
              user={user}
              onLogout={handleLogout}
              allowedTabs={accessibleTabs}
            />
          )}

          {/* Sidebar Toggle Button - Desktop Only */}
          {showSidebar && !isMobile && (
            <SidebarToggle
              checked={desktopSidebarOpen}
              onChange={setDesktopSidebarOpen}
              isDark={darkMode === "dark"}
              style={{
                position: "fixed",
                top: 24,
                left: desktopSidebarOpen ? DRAWER_WIDTH - 44 : 16,
                zIndex: 1301,
                transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          )}

          {/* Main content area */}
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: "100svh",
              width: showSidebar
                ? {
                    xs: "100%",
                    md: desktopSidebarOpen
                      ? `calc(100% - ${DRAWER_WIDTH}px)`
                      : "100%",
                  }
                : "100%",
              ml: showSidebar
                ? { xs: 0, md: desktopSidebarOpen ? `${DRAWER_WIDTH}px` : 0 }
                : 0,
              transition: (theme) =>
                theme.transitions.create(["width", "margin"], {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.enteringScreen,
                }),
            }}
          >
            {/* Sticky Header */}
            <Box
              sx={{
                position: { xs: "sticky", md: "static" },
                top: 0,
                zIndex: (theme) => theme.zIndex.appBar,
                bgcolor: darkMode === "dark" ? "#000000" : "#FDFDFD",
                borderBottom: isScrolled ? { xs: 1, md: 0 } : 0,
                borderColor:
                  darkMode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.08)",
                transition: "all 0.3s ease",
                pl:
                  showSidebar && !isMobile && !desktopSidebarOpen ? "56px" : 0,
              }}
            >
              <Header
                user={user}
                onLogout={handleLogout}
                onMenuClick={showSidebar ? handleSidebarOpen : undefined}
                showMenuButton={showSidebar}
                onTabChange={handleSidebarTabChange}
                isAdmin={isAuthor}
                darkMode={darkMode === "dark"}
                onToggleDarkMode={handleToggleDarkMode}
                brandKey={activeBrandKey}
                showFilterButton={
                  showSidebar ||
                  hasPermission("product_filter") ||
                  hasPermission("utm_filter") ||
                  hasPermission("sales_channel_filter") ||
                  hasPermission("device_type_filter") ||
                  showMultipleBrands
                }
                onFilterClick={() => setMobileFilterOpen(true)}
              />
            </Box>

            {/* Non-Sticky Sub-Header (MobileTopBar etc) */}
            <Box
              sx={{
                bgcolor: darkMode === "dark" ? "#000000" : "#FDFDFD",
                pb: 0,
              }}
            >
              <Box
                sx={{
                  px: { xs: 1.5, sm: 2.5, md: 4 },
                  pt: 0,
                  maxWidth: 1200,
                  mx: "auto",
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", md: "row" },
                    alignItems: authorTab === "ranveer-rs" ? { xs: "flex-start", md: "center" } : "center",
                    justifyContent: authorTab === "ranveer-rs" ? "space-between" : { xs: "space-between", md: "flex-end" },
                    width: "100%",
                    gap: 1,
                  }}
                >
                  {authorTab === "ranveer-rs" && (
                    <Typography variant="h6" sx={{ fontWeight: 700 }} color="text.primary">
                      RS Campaign
                    </Typography>
                  )}

                  {/* Unified Filter Bar - Desktop Only (Dashboard Tab) */}
                  {(!isMobile || authorTab === "ranveer-rs") && (authorTab === "dashboard" || authorTab === "ranveer-rs") && hasBrand && (
                    <Box sx={{ mb: { xs: 1, md: 0 } }}>

                      <UnifiedFilterBar
                        range={normalizedRange}
                        onRangeChange={handleRangeChange}
                        brandKey={activeBrandKey}
                        brands={brandsForSelector}
                        hideAllExceptDate={authorTab === "ranveer-rs"}
                        onBrandChange={

                          isAuthor
                            ? handleAuthorBrandChange
                            : (val) =>
                                dispatch(
                                  setBrand(
                                    (val || "").toString().trim().toUpperCase(),
                                  ),
                                )
                        }
                        isAuthor={isAuthor}
                        // Compare Mode Props
                        compareMode={compareMode}
                        onCompareModeChange={handleCompareModeChange}
                        compareDateRange={compareDateRange}
                        onCompareDateRangeChange={handleCompareDateRangeChange}
                        // Filter Props
                        productOptions={productOptions}
                        productValue={productSelection}
                        onProductChange={handleProductChange}
                        productLoading={productOptionsLoading}
                        utm={utm}
                        onUtmChange={handleUtmChange}
                        salesChannel={salesChannel}
                        onSalesChannelChange={handleSalesChannelChange}
                        deviceType={deviceType}
                        onDeviceTypeChange={handleDeviceTypeChange}
                        allowedFilters={{
                          product: hasPermission("product_filter"),
                          utm: hasPermission("utm_filter"),
                          salesChannel: hasPermission("sales_channel_filter"),
                          deviceType: hasPermission("device_type_filter"),
                        }}
                        utmOptions={utmOptions}
                        onDownload={handleDownloadSnapshot}
                      >
                        {authorTab === "ranveer-rs" && (
                          <Box sx={{ display: "flex", gap: 1, px: 1, alignItems: 'center' }}>
                            <FormControl size="small" variant="standard" sx={{ minWidth: 100 }}>
                              <Select
                                value={rsCity}
                                onChange={(e) => setRsCity(e.target.value)}
                                disableUnderline
                                sx={{ fontSize: '0.8rem' }}
                                renderValue={(selected) => (
                                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                    <Typography sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem' }}>City:</Typography>
                                    <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'primary.main' }}>{selected}</Typography>
                                  </Box>
                                )}
                                MenuProps={{ PaperProps: { sx: { maxHeight: 300, borderRadius: '12px', mt: 1 } } }}
                              >
                                {rsCityOptions.map(c => <MenuItem key={c} value={c} sx={{ fontSize: '0.8rem' }}>{c}</MenuItem>)}
                              </Select>
                            </FormControl>
                            <Divider orientation="vertical" flexItem sx={{ my: 1, height: 20 }} />
                            <FormControl size="small" variant="standard" sx={{ minWidth: 120 }}>
                              <Select
                                value={rsUtm}
                                onChange={(e) => setRsUtm(e.target.value)}
                                disableUnderline
                                sx={{ fontSize: '0.8rem' }}
                                renderValue={(selected) => (
                                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                    <Typography sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem' }}>UTM:</Typography>
                                    <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'primary.main' }}>{selected}</Typography>
                                  </Box>
                                )}
                                MenuProps={{ PaperProps: { sx: { maxHeight: 300, borderRadius: '12px', mt: 1 } } }}
                              >
                                {rsUtmOptions.map(u => <MenuItem key={u} value={u} sx={{ fontSize: '0.8rem' }}>{u}</MenuItem>)}
                              </Select>
                            </FormControl>
                          </Box>
                        )}
                      </UnifiedFilterBar>
                    </Box>
                  )}

                  {!isMobile &&
                    authorTab !== "dashboard" &&
                    authorTab !== "product-conversion" &&
                    authorTab !== "ranveer-rs" &&
                    authorTab !== "alerts" &&
                    authorTab !== "access" &&
                    authorTab !== "notifications-log" &&
                    authorTab !== "tenant-setup" &&
                    (isAuthor || showMultipleBrands) && (
                      <Box sx={{ mb: 1 }}>
                        <AuthorBrandSelector
                          brands={
                            isAuthor
                              ? authorBrands
                              : viewerBrands.map((key) => ({ key }))
                          }
                          value={activeBrandKey}
                          loading={isAuthor ? authorBrandsLoading : false}
                          onChange={
                            isAuthor
                              ? handleAuthorBrandChange
                              : (val) =>
                                  dispatch(
                                    setBrand(
                                      (val || "")
                                        .toString()
                                        .trim()
                                        .toUpperCase(),
                                    ),
                                  )
                          }
                        />
                      </Box>
                    )}

                  {/* Mobile Components (Keep existing MobileTopBar for mobile view) */}
                  {isMobile && authorTab === "dashboard" && hasBrand && (
                    <MobileTopBar
                      value={normalizedRange}
                      onChange={handleRangeChange}
                      brandKey={activeBrandKey}
                      compareMode={compareMode}
                      onCompareModeChange={handleCompareModeChange}
                      compareDateRange={compareDateRange}
                      onCompareDateRangeChange={handleCompareDateRangeChange}
                      showProductFilter={hasPermission("product_filter")}
                      productOptions={productOptions}
                      productValue={productSelection}
                      onProductChange={handleProductChange}
                      productLoading={productOptionsLoading}
                      utm={utm}
                      onUtmChange={handleUtmChange}
                      salesChannel={salesChannel}
                      onSalesChannelChange={handleSalesChannelChange}
                      deviceType={deviceType}
                      onDeviceTypeChange={handleDeviceTypeChange}
                      showUtmFilter={hasPermission("utm_filter")}
                      showSalesChannel={hasPermission("sales_channel_filter")}
                      utmOptions={utmOptions}
                      isAuthor={isAuthor}
                    />
                  )}
                </Box>
                <MobileFilterDrawer
                  showBrandFilter={showMultipleBrands}
                  showProductFilter={hasPermission("product_filter")}
                  showUtmFilter={hasPermission("utm_filter")}
                  showSalesChannel={hasPermission("sales_channel_filter")}
                  showDeviceType={hasPermission("device_type_filter")}
                  open={mobileFilterOpen}
                  onClose={() => setMobileFilterOpen(false)}
                  brandKey={activeBrandKey}
                  brands={
                    isAuthor
                      ? authorBrands
                      : viewerBrands.map((b) => ({ key: b }))
                  }
                  onBrandChange={handleAuthorBrandChange}
                  productOptions={productOptions}
                  productValue={productSelection}
                  onProductChange={handleProductChange}
                  utm={utm}
                  onUtmChange={handleUtmChange}
                  salesChannel={salesChannel}
                  onSalesChannelChange={handleSalesChannelChange}
                  deviceType={deviceType}
                  onDeviceTypeChange={handleDeviceTypeChange}
                  utmOptions={utmOptions}
                  dateRange={normalizedRange}
                  isDark={darkMode === "dark"}
                />
              </Box>
            </Box>

            <Box
              sx={{
                flex: 1,
                width: "100%",
                maxWidth: 1200,
                mx: "auto",
                px: { xs: 1.5, sm: 2.5, md: 4 },
                py: { xs: 1, md: 2 },
                pb: { xs: 14, md: 2 }, // Extra space for mobile bottom nav
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Stack spacing={{ xs: 1, md: 2 }} sx={{ position: "relative" }}>
                <AnimatePresence mode="wait" custom={direction} initial={false}>
                  <motion.div
                    key={authorTab}
                    custom={direction}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    style={{ width: "100%" }}
                  >
                    {authorTab === "notifications-log" && (
                      <motion.div
                        key="notifications-log"
                        custom={direction}
                        variants={pageVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        style={{ width: "100%", height: "100%" }}
                      >
                        <NotificationsLog darkMode={darkMode === "dark"} />
                      </motion.div>
                    )}
                    {authorTab === "tenant-setup" && (
                      <motion.div
                        key="tenant-setup"
                        custom={direction}
                        variants={pageVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        style={{ width: "100%" }}
                      >
                        <Suspense fallback={<SectionFallback count={1} />}>
                          <Stack spacing={2}>
                            <TenantSetupForm onOnboard={(data) => console.log("Onboard:", data)} />
                            <LogsPanel />
                          </Stack>
                        </Suspense>
                      </motion.div>
                    )}
                    {authorTab === "dashboard" &&
                      (hasBrand ? (
                        <Suspense fallback={<SectionFallback count={5} />}>
                          <Stack spacing={{ xs: 1, md: 1 }}>
                            {/* Row 1 KPIs - Full Width (Updates with Multiselect) */}
                            <KPIs
                              query={trendMetricsQuery}
                              selectedMetric={selectedMetric}
                              onSelectMetric={handleSelectMetric}
                              onFunnelData={handleFunnelData}
                              productId={selectedProductIds}
                              productLabel={selectedProductLabel}
                              utmOptions={utmOptions}
                              showRow={isMobile ? "mobile_top" : 1}
                              showWebVitals={hasPermission("web_vitals")}
                              compareMode={compareMode}
                            />

                            <Grid container spacing={2}>
                              {/* Left Column: Row 2 KPIs + Trend Graph */}
                              <Grid size={{ xs: 12 }}>
                                <Stack spacing={{ xs: 1, md: 1 }}>
                                  <KPIs
                                    query={trendMetricsQuery}
                                    selectedMetric={selectedMetric}
                                    onSelectMetric={handleSelectMetric}
                                    productId={selectedProductIds}
                                    productLabel={selectedProductLabel}
                                    utmOptions={utmOptions}
                                    showRow={isMobile ? "none" : 2}
                                    showWebVitals={hasPermission("web_vitals")}
                                    compareMode={compareMode}
                                  />
                                  <Grid container spacing={2} sx={{ mt: 2 }}>
                                    <Grid
                                      size={{
                                        xs: 12,
                                        md: hasPermission("web_vitals")
                                          ? 9
                                          : 12,
                                      }}
                                    >
                                      <HourlySalesCompare
                                        query={trendMetricsQuery}
                                        metric={selectedMetric}
                                      />
                                    </Grid>
                                    {isMobile &&
                                      hasPermission("web_vitals") && (
                                        <Grid size={{ xs: 12 }}>
                                          <KPIs
                                            query={trendMetricsQuery}
                                            selectedMetric={selectedMetric}
                                            onSelectMetric={handleSelectMetric}
                                            productId={selectedProductIds}
                                            productLabel={selectedProductLabel}
                                            utmOptions={utmOptions}
                                            showRow="mobile_bottom"
                                            showWebVitals={true}
                                          />
                                        </Grid>
                                      )}
                                    {hasPermission("web_vitals") && (
                                      <Grid size={{ xs: 12, md: 3 }}>
                                        <WebVitals
                                          query={generalMetricsQuery}
                                          metric={webVitalsMetric}
                                          onMetricChange={setWebVitalsMetric}
                                        />
                                      </Grid>
                                    )}
                                  </Grid>

                                  {/* Funnel Chart - Inline for viewers with permission only */}
                                  {!isAuthor &&
                                    hasPermission("sessions_drop_off_funnel") &&
                                    (funnelData?.stats ? (
                                      <Suspense
                                        fallback={
                                          <Skeleton
                                            variant="rounded"
                                            width="100%"
                                            height={250}
                                          />
                                        }
                                      >
                                        <Box sx={{ mt: 2 }}>
                                          <Typography
                                            variant="subtitle2"
                                            color="text.secondary"
                                            sx={{
                                              mb: 1.5,
                                              fontWeight: 500,
                                              ml: 1,
                                            }}
                                          >
                                            Sessions Drop-off Funnel
                                          </Typography>
                                          <FunnelChart
                                            data={[
                                              {
                                                label: "Sessions",
                                                value:
                                                  funnelData.stats
                                                    .total_sessions || 0,
                                                change: funnelData.deltas
                                                  ?.sessions?.diff_pct
                                                  ? Number(
                                                      funnelData.deltas.sessions
                                                        .diff_pct,
                                                    ).toFixed(1)
                                                  : undefined,
                                              },
                                              {
                                                label: "Add to Cart",
                                                value:
                                                  funnelData.stats
                                                    .total_atc_sessions || 0,
                                                change: funnelData.deltas?.atc
                                                  ?.diff_pct
                                                  ? Number(
                                                      funnelData.deltas.atc
                                                        .diff_pct,
                                                    ).toFixed(1)
                                                  : undefined,
                                              },
                                              {
                                                label: "Orders",
                                                value:
                                                  funnelData.stats
                                                    .total_orders || 0,
                                                change:
                                                  funnelData.deltas?.orders
                                                    ?.diff_pct ||
                                                  funnelData.deltas?.orders
                                                    ?.diff_pp
                                                    ? Number(
                                                        funnelData.deltas
                                                          ?.orders?.diff_pct ||
                                                          funnelData.deltas
                                                            ?.orders?.diff_pp,
                                                      ).toFixed(1)
                                                    : undefined,
                                              },
                                            ]}
                                            height={250}
                                          />
                                        </Box>
                                      </Suspense>
                                    ) : (
                                      <Skeleton
                                        variant="rounded"
                                        width="100%"
                                        height={290}
                                      />
                                    ))}

                                  {!isAuthor &&
                                    hasPermission("product_conversion") && (
                                      <Box sx={{ mt: 3 }}>
                                        <Typography
                                          variant="subtitle2"
                                          color="text.secondary"
                                          sx={{
                                            mb: 1.5,
                                            fontWeight: 500,
                                            ml: 1,
                                          }}
                                        >
                                          Product Performance
                                        </Typography>
                                        <Suspense
                                          fallback={
                                            <Skeleton
                                              variant="rounded"
                                              width="100%"
                                              height={300}
                                            />
                                          }
                                        >
                                          <ProductConversionTable
                                            brandKey={activeBrandKey}
                                            showCompareMode={hasPermission(
                                              "compare_mode",
                                            )}
                                          />
                                        </Suspense>
                                      </Box>
                                    )}
                                </Stack>
                              </Grid>
                            </Grid>
                            {(hasPermission("payment_split_order") ||
                              hasPermission("payment_split_sales")) && (
                              <ModeOfPayment query={generalMetricsQuery} />
                            )}
                            {hasPermission("traffic_split") && (
                              <TrafficSourceSplit
                                query={generalMetricsQuery}
                                compareMode={compareMode}
                                mappingRules={trafficSplitRules}
                              />
                            )}
                          </Stack>
                        </Suspense>
                      ) : (
                        <Paper
                          variant="outlined"
                          sx={{ p: { xs: 2, md: 3 }, textAlign: "center" }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Select a brand to load dashboard metrics.
                          </Typography>
                        </Paper>
                      ))}

                    {/* Author-only tabs */}
                    {isAuthor &&
                      authorTab === "product-conversion" &&
                      (hasBrand ? (
                        <Suspense fallback={<SectionFallback />}>
                          <Stack spacing={{ xs: 2, md: 3 }}>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                mb: 2,
                                mt: 1,
                              }}
                            >
                              <Typography
                                variant="h6"
                                sx={{
                                  color:
                                    darkMode === "dark"
                                      ? "text.primary"
                                      : "text.secondary",
                                  fontWeight: 600,
                                }}
                              >
                                Funnels
                              </Typography>
                              <Chip
                                label={`Brand: ${activeBrandKey}`}
                                size="small"
                                sx={{
                                  height: 24,
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  bgcolor:
                                    darkMode === "dark"
                                      ? "rgba(255,255,255,0.1)"
                                      : "rgba(0,0,0,0.05)",
                                  color:
                                    darkMode === "dark"
                                      ? "text.secondary"
                                      : "text.primary",
                                  border: "1px solid",
                                  borderColor:
                                    darkMode === "dark"
                                      ? "rgba(255,255,255,0.1)"
                                      : "rgba(0,0,0,0.1)",
                                }}
                              />
                            </Box>
                            {funnelData?.stats ? (
                              <Suspense
                                fallback={
                                  <Skeleton
                                    variant="rounded"
                                    width="100%"
                                    height={250}
                                  />
                                }
                              >
                                <FunnelChart
                                  data={[
                                    {
                                      label: "Sessions",
                                      value:
                                        funnelData.stats.total_sessions || 0,
                                      change: funnelData.deltas?.sessions
                                        ?.diff_pct
                                        ? Number(
                                            funnelData.deltas.sessions.diff_pct,
                                          ).toFixed(1)
                                        : undefined,
                                    },
                                    {
                                      label: "Add to Cart",
                                      value:
                                        funnelData.stats.total_atc_sessions ||
                                        0,
                                      change: funnelData.deltas?.atc?.diff_pct
                                        ? Number(
                                            funnelData.deltas.atc.diff_pct,
                                          ).toFixed(1)
                                        : undefined,
                                    },
                                    {
                                      label: "Orders",
                                      value: funnelData.stats.total_orders || 0,
                                      change:
                                        funnelData.deltas?.orders?.diff_pct ||
                                        funnelData.deltas?.orders?.diff_pp
                                          ? Number(
                                              funnelData.deltas?.orders
                                                ?.diff_pct ||
                                                funnelData.deltas?.orders
                                                  ?.diff_pp,
                                            ).toFixed(1)
                                          : undefined,
                                    },
                                  ]}
                                  height={250}
                                />
                              </Suspense>
                            ) : (
                              <Skeleton
                                variant="rounded"
                                width="100%"
                                height={250}
                              />
                            )}

                            <ProductConversionTable
                              brandKey={activeBrandKey}
                              showCompareMode={true}
                            />
                          </Stack>
                        </Suspense>
                      ) : (
                        <Paper
                          variant="outlined"
                          sx={{ p: { xs: 2, md: 3 }, textAlign: "center" }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Select a brand to view conversion metrics.
                          </Typography>
                        </Paper>
                      ))}

                    {canAccessRanveerRs && authorTab === "ranveer-rs" && (
                      <Suspense fallback={<SectionFallback count={2} height={220} />}>
                        <RanveerRSDashboard 
                          dateRange={normalizedRange} 
                          selectedCity={rsCity}
                          setSelectedCity={setRsCity}
                          selectedUtm={rsUtm}
                          setSelectedUtm={setRsUtm}
                          setCityOptions={setRsCityOptions}
                          setUtmOptions={setRsUtmOptions}
                        />

                      </Suspense>
                    )}

                    {isAuthor && authorTab === "access" && (
                      <Suspense fallback={<SectionFallback count={2} />}>
                        <Stack spacing={{ xs: 2, md: 3 }}>
                          <AccessControlCard />
                        </Stack>
                      </Suspense>
                    )}

                    {isAuthor && authorTab === "traffic-split-config" && (
                      hasBrand ? (
                        <Suspense fallback={<SectionFallback count={1} height={220} />}>
                          <Stack spacing={{ xs: 2, md: 3 }}>
                            <TrafficSplitConfigPanel
                              rules={trafficSplitRules}
                              onAddRule={(rule) =>
                                setTrafficSplitRules((prev) => [...prev, rule])
                              }
                              onRemoveRule={(id) =>
                                setTrafficSplitRules((prev) =>
                                  prev.filter((r) => r.id !== id),
                                )
                              }
                              onClearRules={() => setTrafficSplitRules([])}
                            />
                          </Stack>
                        </Suspense>
                      ) : (
                        <Paper
                          variant="outlined"
                          sx={{ p: { xs: 2, md: 3 }, textAlign: "center" }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Select a brand to configure traffic split mapping.
                          </Typography>
                        </Paper>
                      )
                    )}

                    {/*
                    {isAuthor && authorTab === 'brands' && (
                      <Suspense fallback={<SectionFallback count={2} />}>
                        <Stack spacing={{ xs: 2, md: 3 }}>
                          <AuthorBrandForm />
                          <AuthorBrandList />
                        </Stack>
                      </Suspense>
                    )}
                    */}

                    {authorTab === "alerts" &&
                      (authorBrands.length ? (
                        <Suspense fallback={<SectionFallback />}>
                          <AlertsAdmin
                            brands={authorBrands}
                            defaultBrandKey={authorBrandKey}
                          />
                        </Suspense>
                      ) : (
                        <Paper
                          variant="outlined"
                          sx={{ p: { xs: 2, md: 3 }, textAlign: "center" }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Add at least one brand to start configuring alerts.
                          </Typography>
                        </Paper>
                      ))}

                    {authorTab === "notifications-log" && (
                      <Suspense fallback={<SectionFallback />}>
                        <NotificationsLog darkMode={darkMode === "dark"} />
                      </Suspense>
                    )}
                  </motion.div>
                </AnimatePresence>
              </Stack>
            </Box>
            <Suspense fallback={null}>
              <Footer />
            </Suspense>
          </Box>
        </Box>
        {isMobile && mobileNavItems.length > 1 && (
          <AnimeNavBar
            items={mobileNavItems}
            activeTab={authorTab}
            onTabChange={handleSidebarTabChange}
            isDark={darkMode === "dark"}
          />
        )}
      </AppProvider>
    </ThemeProvider>
  );
}
