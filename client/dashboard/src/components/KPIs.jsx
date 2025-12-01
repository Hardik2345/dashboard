import { useEffect, useState } from "react";
import Grid from "@mui/material/Grid2";
import KPIStat from "./KPIStat.jsx";
import {
  getTotalOrders,
  getTotalOrdersDelta,
  getTotalSales,
  getAOV,
  getCVR,
  getCVRDelta,
  getFunnelStats,
  getTotalSalesDelta,
  getTotalSessionsDelta,
  getAtcSessionsDelta,
  getAOVDelta,
} from "../lib/api.js";
import WebVitals from "./WebVitals.jsx";

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
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const start = query?.start;
  const end = query?.end;
  const brandKey = query?.brand_key;
  const refreshKey = query?.refreshKey;

  useEffect(() => {
    let cancelled = false;
    if (!start || !end) {
      setData({});
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    const base = brandKey
      ? { start, end, brand_key: brandKey }
      : { start, end };
    Promise.all([
      getTotalOrders(base),
      getTotalOrdersDelta({ ...base, align: "hour" }),
      getTotalSales(base),
      getAOV(base),
      getCVR(base),
      getCVRDelta({ ...base, align: "hour" }),
      getFunnelStats(base),
      getTotalSalesDelta({ ...base, align: "hour" }),
      getTotalSessionsDelta({ ...base, align: "hour" }),
      getAtcSessionsDelta({ ...base, align: "hour" }),
      getAOVDelta({ ...base, align: "hour" }),
    ])
      .then(
        ([
          orders,
          ordersDelta,
          sales,
          aov,
          cvr,
          cvrDelta,
          funnel,
          salesDelta,
          sessDelta,
          atcDelta,
          aovDelta,
        ]) => {
          if (cancelled) return;
          setData({
            orders,
            ordersDelta,
            sales,
            aov,
            cvr,
            cvrDelta,
            funnel,
            salesDelta,
            sessDelta,
            atcDelta,
            aovDelta,
          });
          setLoading(false);
          if (typeof onLoaded === "function") {
            onLoaded(new Date());
          }
        }
      )
      .catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [start, end, brandKey, refreshKey, onLoaded]);

  const totalSessions = data.cvr?.total_sessions || 0;
  const totalAtcSessions = data.funnel?.total_atc_sessions || 0;
  const cvrDeltaValue = data.cvrDelta
    ? data.cvrDelta.diff_pct ?? data.cvrDelta.diff_pp
    : undefined;

  return (
    <>
      <Grid container spacing={1.5} columns={{ xs: 2, sm: 6 }}>
        <Grid size={{ xs: 1, sm: 2 }}>
          <KPIStat
            label="Total Orders"
            value={data.orders?.value ?? 0}
            loading={loading}
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

      <WebVitals />
    </>
  );
}
