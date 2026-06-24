import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import Grid from "@mui/material/Grid2";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { toast } from "react-toastify";
import {
  exportSessionAnalyticsBrandsCsv,
  exportSessionAnalyticsUsersCsv,
  getSessionAnalyticsBrands,
  getSessionAnalyticsFilters,
  getSessionAnalyticsInsights,
  getSessionAnalyticsSummary,
  getSessionAnalyticsTrend,
  getSessionAnalyticsUsers,
} from "../../lib/api.js";
import SessionFilters from "./components/SessionFilters.jsx";
import SessionKPIRow from "./components/SessionKPIRow.jsx";
import SessionTrendChart from "./components/SessionTrendChart.jsx";
import SessionInsightsCard from "./components/SessionInsightsCard.jsx";
import BrandUsageTable from "./components/BrandUsageTable.jsx";
import UserEngagementTable from "./components/UserEngagementTable.jsx";

function todayRange() {
  const today = dayjs().format("YYYY-MM-DD");
  return { from: today, to: today };
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export default function SessionAnalyticsPage({ brandKey, availableBrands = [] }) {
  const initialRange = useMemo(() => todayRange(), []);
  const [filters, setFilters] = useState({
    preset: "today",
    from: initialRange.from,
    to: initialRange.to,
    brand: "",
    user: "",
    granularity: "hourly",
  });
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    users: [],
  });
  const [summary, setSummary] = useState(null);
  const [trendRows, setTrendRows] = useState([]);
  const [insights, setInsights] = useState({});
  const [brandRows, setBrandRows] = useState([]);
  const [userRows, setUserRows] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userRowsPerPage, setUserRowsPerPage] = useState(10);
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState("sessions");
  const [userDirection, setUserDirection] = useState("desc");
  const [loading, setLoading] = useState({
    filters: false,
    summary: false,
    trend: false,
    insights: false,
    brands: false,
    users: false,
  });

  const requestBase = useMemo(
    () => ({
      brand_key: brandKey,
      from: filters.from,
      to: filters.to,
      brand: filters.brand || undefined,
      user: filters.user || undefined,
    }),
    [brandKey, filters.brand, filters.from, filters.to, filters.user],
  );

  const mergedBrandOptions = useMemo(() => {
    const brands = new Set();
    for (const brand of availableBrands) {
      const key = (brand?.key || brand || "").toString().trim().toUpperCase();
      if (key) brands.add(key);
    }
    for (const brand of filterOptions.brands || []) {
      const key = (brand || "").toString().trim().toUpperCase();
      if (key) brands.add(key);
    }
    return Array.from(brands).sort();
  }, [availableBrands, filterOptions.brands]);

  const loadFilters = useCallback(async () => {
    if (!brandKey) return;
    setLoading((prev) => ({ ...prev, filters: true }));
    const response = await getSessionAnalyticsFilters(requestBase);
    setLoading((prev) => ({ ...prev, filters: false }));
    if (response.error) {
      toast.error("Failed to load session analytics");
      return;
    }
    setFilterOptions(response.data);
  }, [brandKey, requestBase]);

  const loadOverview = useCallback(async () => {
    if (!brandKey) return;
    setLoading((prev) => ({
      ...prev,
      summary: true,
      trend: true,
      insights: true,
      brands: true,
    }));

    const [summaryResponse, trendResponse, insightsResponse, brandsResponse] =
      await Promise.all([
        getSessionAnalyticsSummary(requestBase),
        getSessionAnalyticsTrend({
          ...requestBase,
          granularity: filters.granularity,
        }),
        getSessionAnalyticsInsights(requestBase),
        getSessionAnalyticsBrands(requestBase),
      ]);

    setLoading((prev) => ({
      ...prev,
      summary: false,
      trend: false,
      insights: false,
      brands: false,
    }));

    if (
      summaryResponse.error ||
      trendResponse.error ||
      insightsResponse.error ||
      brandsResponse.error
    ) {
      toast.error("Failed to load session analytics");
      return;
    }

    setSummary(summaryResponse.data || {});
    setTrendRows(trendResponse.data || []);
    setInsights(insightsResponse.data || {});
    setBrandRows(brandsResponse.data || []);
  }, [brandKey, filters.granularity, requestBase]);

  const loadUsers = useCallback(async () => {
    if (!brandKey) return;
    setLoading((prev) => ({ ...prev, users: true }));
    const response = await getSessionAnalyticsUsers({
      ...requestBase,
      page: userPage + 1,
      limit: userRowsPerPage,
      search: userSearch || undefined,
      sort: userSort,
      direction: userDirection,
    });
    setLoading((prev) => ({ ...prev, users: false }));
    if (response.error) {
      toast.error("Failed to load session analytics");
      return;
    }

    setUserRows(response.data.rows || []);
    setUserTotal(Number(response.data.total || 0));
  }, [
    brandKey,
    requestBase,
    userDirection,
    userPage,
    userRowsPerPage,
    userSearch,
    userSort,
  ]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setUserPage(0);
  }, [filters.brand, filters.user, filters.from, filters.to]);

  const handleFilterChange = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleExportBrands = useCallback(async () => {
    const response = await exportSessionAnalyticsBrandsCsv(requestBase);
    if (response.error) {
      toast.error("Failed to load session analytics");
      return;
    }
    downloadBlob(response.blob, response.filename);
  }, [requestBase]);

  const handleExportUsers = useCallback(async () => {
    const response = await exportSessionAnalyticsUsersCsv({
      ...requestBase,
      search: userSearch || undefined,
      sort: userSort,
      direction: userDirection,
    });
    if (response.error) {
      toast.error("Failed to load session analytics");
      return;
    }
    downloadBlob(response.blob, response.filename);
  }, [requestBase, userDirection, userSearch, userSort]);

  if (!brandKey) {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Select a brand to view session analytics.
        </Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, color: "text.secondary" }}>
          Session Analytics
        </Typography>
      </Box>

      <SessionFilters
        filters={filters}
        onChange={handleFilterChange}
        brandOptions={mergedBrandOptions}
        userOptions={filterOptions.users}
        loading={loading.filters}
      />

      <SessionKPIRow summary={summary} loading={loading.summary} />

      <Grid container spacing={{ xs: 2, md: 3 }}>
        <Grid size={{ xs: 12, md: 9 }}>
          <SessionTrendChart
            rows={trendRows}
            loading={loading.trend}
            granularity={filters.granularity}
            onGranularityChange={(value) => handleFilterChange({ granularity: value })}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SessionInsightsCard insights={insights} loading={loading.insights} />
        </Grid>
      </Grid>

      <BrandUsageTable
        rows={brandRows}
        loading={loading.brands}
        onExport={handleExportBrands}
      />

      <UserEngagementTable
        rows={userRows}
        total={userTotal}
        loading={loading.users}
        page={userPage}
        rowsPerPage={userRowsPerPage}
        search={userSearch}
        sort={userSort}
        direction={userDirection}
        onPageChange={setUserPage}
        onRowsPerPageChange={(value) => {
          setUserRowsPerPage(value);
          setUserPage(0);
        }}
        onSearchChange={(value) => {
          setUserSearch(value);
          setUserPage(0);
        }}
        onSortChange={(nextSort, nextDirection) => {
          setUserSort(nextSort);
          setUserDirection(nextDirection);
          setUserPage(0);
        }}
        onExport={handleExportUsers}
      />
    </Stack>
  );
}
