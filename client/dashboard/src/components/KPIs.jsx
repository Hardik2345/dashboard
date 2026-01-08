import { useEffect, useState, useMemo } from "react";
import Grid from "@mui/material/Grid2";
import { Stack, Typography } from "@mui/material";
import KPIStat from "./KPIStat.jsx";
import {
  getDashboardSummary,
  getProductKpis,
} from "../lib/api.js";

const nfInt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfMoney = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const nfMoney2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const nfPct = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 2,
});

export default function KPIs({
  query,
  selectedMetric,
  onSelectMetric,
  onLoaded,
  onFunnelData,
  productId,
  productLabel,
}) {
  const [loading, setLoading] = useState(true);
  const [deltaLoading, setDeltaLoading] = useState(true);
  const [data, setData] = useState({});
  const start = query?.start;
  const end = query?.end;
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;
  const scopedProductId = (productId || "").toString().trim();
  const isProductScoped = scopedProductId.length > 0;

  const scopeLabel = useMemo(() => {
    if (!isProductScoped) return "All products";
    return productLabel || scopedProductId;
  }, [isProductScoped, productLabel, scopedProductId]);

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setData({});
      setLoading(false);
      setDeltaLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setDeltaLoading(true);

    if (isProductScoped) {
      const base = brandKey
        ? { start, end, brand_key: brandKey, product_id: scopedProductId }
        : { start, end, product_id: scopedProductId };

      getProductKpis(base)
        .then((resp) => {
          if (cancelled) return;
          if (resp.error) {
            setData({});
            setLoading(false);
            return;
          }

          const orders = { value: resp.total_orders ?? 0 };
          const sales = { value: resp.total_sales ?? 0 };
          const aovValue = orders.value > 0 ? resp.total_sales / orders.value : 0;

          const funnel = {
            total_sessions: resp.sessions ?? 0,
            total_atc_sessions: resp.sessions_with_cart_additions ?? 0,
            total_orders: orders.value,
          };

          const cvr = {
            cvr: resp.conversion_rate ?? 0,
            cvr_percent: resp.conversion_rate_pct ?? 0,
            total_orders: orders.value,
            total_sessions: funnel.total_sessions,
          };

          const aov = {
            aov: aovValue,
            total_sales: sales.value,
            total_orders: orders.value,
          };

          setData((prev) => ({ ...prev, orders, sales, aov, cvr, funnel }));
          setLoading(false);
          setDeltaLoading(false);
          if (typeof onLoaded === "function") {
            onLoaded(new Date());
          }
        })
        .catch(() => {
          setLoading(false);
          setDeltaLoading(false);
        });
    } else {
      const base = brandKey
        ? { start, end, brand_key: brandKey, align: "hour" }
        : { start, end, align: "hour" };

      // Fetch summary first for fast value rendering (cache-backed)
      getDashboardSummary(base)
        .then((resp) => {
          if (cancelled) return;
          if (resp.error || !resp.metrics) {
            setData({});
            setLoading(false);
            return;
          }
          const m = resp.metrics || {};
          const orders = { value: m.total_orders?.value ?? 0 };
          const sales = { value: m.total_sales?.value ?? 0 };
          const aov = { aov: m.average_order_value?.value ?? 0 };
          const sessions = m.total_sessions?.value ?? 0;
          const atcSessions = m.total_atc_sessions?.value ?? 0;

          const cvrVal = m.conversion_rate?.value ?? 0;
          const cvr = {
            cvr: cvrVal / 100,
            cvr_percent: cvrVal,
            total_orders: orders.value,
            total_sessions: sessions
          };
          const funnel = {
            total_sessions: sessions,
            total_atc_sessions: atcSessions,
            total_orders: orders.value
          };

          const ordersDelta = {
            diff_pct: m.total_orders?.diff_pct ?? 0,
            direction: m.total_orders?.direction ?? "flat",
          };
          const salesDelta = {
            diff_pct: m.total_sales?.diff_pct ?? 0,
            direction: m.total_sales?.direction ?? "flat",
          };
          const aovDelta = {
            diff_pct: m.average_order_value?.diff_pct ?? 0,
            direction: m.average_order_value?.direction ?? "flat",
          };
          const cvrDelta = {
            diff_pct: m.conversion_rate?.diff_pct ?? 0,
            diff_pp: m.conversion_rate?.diff_pp,
            direction: m.conversion_rate?.direction ?? "flat",
          };
          const sessDelta = {
            diff_pct: m.total_sessions?.diff_pct ?? 0,
            direction: m.total_sessions?.direction ?? "flat",
          };
          const atcDelta = {
            diff_pct: m.total_atc_sessions?.diff_pct ?? 0,
            direction: m.total_atc_sessions?.direction ?? "flat",
          };

          setData((prev) => ({
            ...prev,
            orders,
            sales,
            aov,
            cvr,
            funnel,
            ordersDelta,
            salesDelta,
            aovDelta,
            cvrDelta,
            sessDelta,
            atcDelta,
          }));
          setLoading(false);
          setDeltaLoading(false);
          if (typeof onLoaded === "function") {
            onLoaded(new Date());
          }
        })
        .catch(() => {
          if (cancelled) return;
          setLoading(false);
          setDeltaLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [start, end, brandKey, refreshKey, isProductScoped, scopedProductId, onLoaded]);

  const totalSessions = data.cvr?.total_sessions || data.funnel?.total_sessions || 0;
  const totalAtcSessions = data.funnel?.total_atc_sessions || 0;
  const cvrDeltaValue = data.cvrDelta
    ? data.cvrDelta.diff_pct ?? data.cvrDelta.diff_pp
    : undefined;

  // Emit funnel data to parent for FunnelChart (avoids redundant API call)
  useEffect(() => {
    if (typeof onFunnelData !== 'function') return;
    if (!data.funnel) return;
    onFunnelData({
      stats: data.funnel,
      deltas: {
        sessions: data.sessDelta || null,
        atc: data.atcDelta || null,
        orders: data.ordersDelta || null,
      },
      loading: loading || deltaLoading,
    });
  }, [data.funnel, data.sessDelta, data.atcDelta, data.ordersDelta, loading, deltaLoading, onFunnelData]);

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Scope: {scopeLabel}
        </Typography>
        {isProductScoped && (
          <Typography variant="caption" color="text.secondary">
            Using product-level KPIs
          </Typography>
        )}
      </Stack>
      <Grid container spacing={1.5} columns={{ xs: 2, sm: 6 }}>
        <Grid size={{ xs: 1, sm: 2 }}>
          <KPIStat
            label="Total Orders"
            value={data.orders?.value ?? 0}
            loading={loading}
            deltaLoading={deltaLoading}
            formatter={(v) => nfInt.format(v)}
            delta={
              data.ordersDelta
                ? {
                  value: data.ordersDelta.diff_pct,
                  direction: data.ordersDelta.direction,
                }
                : undefined
            }
            onSelect={
              onSelectMetric ? () => onSelectMetric("orders") : undefined
            }
            selected={selectedMetric === "orders"}
          />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <KPIStat
            label="Total Sales"
            value={data.sales?.value ?? 0}
            loading={loading}
            deltaLoading={deltaLoading}
            formatter={(v) => nfMoney.format(v)}
            delta={
              data.salesDelta
                ? {
                  value: data.salesDelta.diff_pct,
                  direction: data.salesDelta.direction,
                }
                : undefined
            }
            onSelect={
              onSelectMetric ? () => onSelectMetric("sales") : undefined
            }
            selected={selectedMetric === "sales"}
          />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <KPIStat
            label="Avg Order Value"
            value={data.aov?.aov ?? 0}
            loading={loading}
            deltaLoading={deltaLoading}
            formatter={(v) => nfMoney2.format(v)}
            delta={
              data.aovDelta
                ? {
                  value: data.aovDelta.diff_pct,
                  direction: data.aovDelta.direction,
                }
                : undefined
            }
            onSelect={onSelectMetric ? () => onSelectMetric("aov") : undefined}
            selected={selectedMetric === "aov"}
          />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <KPIStat
            label="Conversion Rate"
            value={data.cvr?.cvr ?? 0}
            loading={loading}
            deltaLoading={deltaLoading}
            formatter={(v) => nfPct.format(v)}
            delta={
              typeof cvrDeltaValue === "number" && data.cvrDelta
                ? { value: cvrDeltaValue, direction: data.cvrDelta.direction }
                : undefined
            }
            onSelect={onSelectMetric ? () => onSelectMetric("cvr") : undefined}
            selected={selectedMetric === "cvr"}
          />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <KPIStat
            label="Total Sessions"
            value={totalSessions}
            loading={loading}
            deltaLoading={deltaLoading}
            formatter={(v) => nfInt.format(v)}
            delta={
              data.sessDelta
                ? {
                  value: data.sessDelta.diff_pct,
                  direction: data.sessDelta.direction,
                }
                : undefined
            }
            onSelect={
              onSelectMetric ? () => onSelectMetric("sessions") : undefined
            }
            selected={selectedMetric === "sessions"}
          />
        </Grid>
        <Grid size={{ xs: 1, sm: 2 }}>
          <KPIStat
            label="ATC Sessions"
            value={totalAtcSessions}
            loading={loading}
            deltaLoading={deltaLoading}
            formatter={(v) => nfInt.format(v)}
            delta={
              data.atcDelta
                ? {
                  value: data.atcDelta.diff_pct,
                  direction: data.atcDelta.direction,
                }
                : undefined
            }
            onSelect={onSelectMetric ? () => onSelectMetric("atc") : undefined}
            selected={selectedMetric === "atc"}
          />
        </Grid>
      </Grid>
    </>
  );
}
