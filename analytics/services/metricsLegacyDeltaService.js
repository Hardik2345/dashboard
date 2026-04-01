const { QueryTypes } = require("sequelize");
const logger = require("../utils/logger");
const {
  deltaForSum,
  deltaForAOV,
  computePercentDelta,
  avgForRange,
  aovForRange,
  cvrForRange,
  computeTotalSessions,
  computeAtcSessions,
  hasUtmFilters,
  appendUtmWhere,
  computeSessionsFromDeviceColumns,
  computeCVRForDay,
} = require("../utils/metricsUtils");
const { previousWindow, prevDayStr } = require("../utils/dateUtils");
const {
  isTodayUtc,
  getIstContext,
  secondsToTime,
  formatUtcDate,
} = require("./metricsFoundation");

function buildMetricsDeltaMethods(deps = {}) {
  const {
    log = logger,
    now = () => new Date(),
    previousWindowImpl = previousWindow,
    prevDayStrImpl = prevDayStr,
    deltaForSumImpl = deltaForSum,
    deltaForAOVImpl = deltaForAOV,
    computePercentDeltaImpl = computePercentDelta,
    avgForRangeImpl = avgForRange,
    aovForRangeImpl = aovForRange,
    cvrForRangeImpl = cvrForRange,
    computeTotalSessionsImpl = computeTotalSessions,
    computeAtcSessionsImpl = computeAtcSessions,
    hasUtmFiltersImpl = hasUtmFilters,
    appendUtmWhereImpl = appendUtmWhere,
    computeSessionsFromDeviceColumnsImpl = computeSessionsFromDeviceColumns,
    computeCVRForDayImpl = computeCVRForDay,
  } = deps;

  async function calcTotalOrdersDelta({ start, end, align, conn, filters }) {
    const date = end || start;
    if (!date && !(start && end)) {
      return {
        metric: "TOTAL_ORDERS_DELTA",
        date: null,
        current: null,
        previous: null,
        diff_pct: 0,
        direction: "flat",
      };
    }

    if (align === "hour") {
      const rangeStart = start || date;
      const rangeEnd = end || date;
      if (!rangeStart || !rangeEnd) return { error: "Invalid date range" };

      const { todayIst, secondsNow } = getIstContext(now());
      const fullDaySeconds = 24 * 3600;
      const resolveSeconds = (targetDate) =>
        targetDate === todayIst ? secondsNow : fullDaySeconds;
      const effectiveSeconds = Math.min(
        fullDaySeconds,
        Math.max(0, resolveSeconds(rangeEnd)),
      );
      const cutoffTime =
        effectiveSeconds >= fullDaySeconds
          ? "24:00:00"
          : secondsToTime(effectiveSeconds);

      let rangeFilter = `created_date >= ? AND created_date <= ? AND created_time < ?`;
      const curReplacements = [rangeStart, rangeEnd, cutoffTime];

      if (filters) {
        rangeFilter = appendUtmWhereImpl(rangeFilter, curReplacements, filters);
      }

      const prevWin = previousWindowImpl(rangeStart, rangeEnd);
      const countSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE ${rangeFilter}`;

      const prevReplacements = prevWin
        ? [prevWin.prevStart, prevWin.prevEnd, cutoffTime]
        : [];
      if (prevWin && filters) {
        appendUtmWhereImpl("", prevReplacements, filters);
      }

      const currPromise = conn.query(countSql, {
        type: QueryTypes.SELECT,
        replacements: curReplacements,
      });
      const prevPromise = prevWin
        ? conn.query(countSql, {
            type: QueryTypes.SELECT,
            replacements: prevReplacements,
          })
        : Promise.resolve([{ cnt: 0 }]);
      const [currRows, prevRows] = await Promise.all([currPromise, prevPromise]);
      const current = Number(currRows?.[0]?.cnt || 0);
      const previous = Number(prevRows?.[0]?.cnt || 0);
      const diff = current - previous;
      const diff_pct =
        previous > 0 ? (diff / previous) * 100 : current > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return start && end
        ? {
            metric: "TOTAL_ORDERS_DELTA",
            range: { start, end },
            current,
            previous,
            diff_pct,
            direction,
            align: "hour",
            cutoff_time: cutoffTime,
          }
        : {
            metric: "TOTAL_ORDERS_DELTA",
            date: rangeEnd,
            current,
            previous,
            diff_pct,
            direction,
            align: "hour",
            cutoff_time: cutoffTime,
          };
    }

    const delta = await deltaForSumImpl("total_orders", date, conn);
    return { metric: "TOTAL_ORDERS_DELTA", date, ...delta };
  }

  async function calcTotalSalesDelta({
    start,
    end,
    align,
    compare,
    conn,
    filters,
  }) {
    const date = end || start;
    if (!date && !(start && end)) {
      return {
        metric: "TOTAL_SALES_DELTA",
        date: null,
        current: null,
        previous: null,
        diff_pct: 0,
        direction: "flat",
      };
    }

    if (compare === "prev-range-avg" && start && end) {
      const currAvg = await avgForRangeImpl("total_sales", { start, end, conn });
      const prevWin = previousWindowImpl(start, end);
      const prevAvg = await avgForRangeImpl("total_sales", {
        start: prevWin.prevStart,
        end: prevWin.prevEnd,
        conn,
      });
      const diff = currAvg - prevAvg;
      const diff_pct =
        prevAvg > 0 ? (diff / prevAvg) * 100 : currAvg > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "TOTAL_SALES_DELTA",
        range: { start, end },
        current: currAvg,
        previous: prevAvg,
        diff_pct,
        direction,
        compare: "prev-range-avg",
      };
    }

    if (align === "hour") {
      const rangeStart = start || date;
      const rangeEnd = end || date;
      if (!rangeStart || !rangeEnd) return { error: "Invalid date range" };

      const { todayIst, secondsNow } = getIstContext(now());
      const fullDaySeconds = 24 * 3600;
      const resolveSeconds = (targetDate) =>
        targetDate === todayIst ? secondsNow : fullDaySeconds;
      const effectiveSeconds = Math.min(
        fullDaySeconds,
        Math.max(0, resolveSeconds(rangeEnd)),
      );
      const cutoffTime =
        effectiveSeconds >= fullDaySeconds
          ? "24:00:00"
          : secondsToTime(effectiveSeconds);
      const prevWin = previousWindowImpl(rangeStart, rangeEnd);

      let rangeFilter = `created_date >= ? AND created_date <= ? AND created_time < ?`;
      const curReplacements = [rangeStart, rangeEnd, cutoffTime];

      if (filters) {
        rangeFilter = appendUtmWhereImpl(rangeFilter, curReplacements, filters);
      }

      const prevReplacements = prevWin
        ? [prevWin.prevStart, prevWin.prevEnd, cutoffTime]
        : [];
      if (prevWin && filters) {
        appendUtmWhereImpl("", prevReplacements, filters);
      }

      const salesSql = `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE ${rangeFilter}`;
      const currentPromise = conn.query(salesSql, {
        type: QueryTypes.SELECT,
        replacements: curReplacements,
      });
      const previousPromise = prevWin
        ? conn.query(salesSql, {
            type: QueryTypes.SELECT,
            replacements: prevReplacements,
          })
        : Promise.resolve([{ total: 0 }]);
      const [currRow, prevRow] = await Promise.all([
        currentPromise,
        previousPromise,
      ]);
      const curr = Number(currRow?.[0]?.total || 0);
      const prevVal = Number(prevRow?.[0]?.total || 0);
      const diff = curr - prevVal;
      const diff_pct =
        prevVal > 0 ? (diff / prevVal) * 100 : curr > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return start && end
        ? {
            metric: "TOTAL_SALES_DELTA",
            range: { start, end },
            current: curr,
            previous: prevVal,
            diff_pct,
            direction,
            align: "hour",
            cutoff_time: cutoffTime,
          }
        : {
            metric: "TOTAL_SALES_DELTA",
            date: rangeEnd,
            current: curr,
            previous: prevVal,
            diff_pct,
            direction,
            align: "hour",
            cutoff_time: cutoffTime,
          };
    }

    const delta = await deltaForSumImpl("total_sales", date, conn);
    return { metric: "TOTAL_SALES_DELTA", date, ...delta };
  }

  async function calcTotalSessionsDelta({
    start,
    end,
    align,
    compare,
    conn,
    filters,
  }) {
    const date = end || start;
    if (!date && !(start && end)) {
      return {
        metric: "TOTAL_SESSIONS_DELTA",
        date: null,
        current: null,
        previous: null,
        diff_pct: 0,
        direction: "flat",
      };
    }

    if (hasUtmFiltersImpl(filters)) {
      const rangeStart = start || date;
      const rangeEnd = end || date;
      const curr = await computeTotalSessionsImpl({
        start: rangeStart,
        end: rangeEnd,
        conn,
        filters,
      });
      const prevWin = previousWindowImpl(rangeStart, rangeEnd);
      const prev = await computeTotalSessionsImpl({
        start: prevWin.prevStart,
        end: prevWin.prevEnd,
        conn,
        filters,
      });
      const diff = curr - prev;
      const diff_pct = prev > 0 ? (diff / prev) * 100 : curr > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "TOTAL_SESSIONS_DELTA",
        range: { start: rangeStart, end: rangeEnd },
        current: curr,
        previous: prev,
        diff_pct,
        direction,
      };
    }

    if (compare === "prev-range-avg" && start && end) {
      const currAvg = await avgForRangeImpl("total_sessions", { start, end, conn });
      const prevWin = previousWindowImpl(start, end);
      const prevAvg = await avgForRangeImpl("total_sessions", {
        start: prevWin.prevStart,
        end: prevWin.prevEnd,
        conn,
      });
      const diff = currAvg - prevAvg;
      const diff_pct =
        prevAvg > 0 ? (diff / prevAvg) * 100 : currAvg > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "TOTAL_SESSIONS_DELTA",
        range: { start, end },
        current: currAvg,
        previous: prevAvg,
        diff_pct,
        direction,
        compare: "prev-range-avg",
      };
    }

    const alignLower = (align || "").toString().toLowerCase();
    if (alignLower === "hour") {
      const { nowIst, todayIst } = getIstContext(now());
      const resolveTargetHour = (endOrDate) =>
        endOrDate === todayIst ? nowIst.getUTCHours() : 23;

      if (start && end) {
        const targetHour = resolveTargetHour(end);
        const prevWin = previousWindowImpl(start, end);
        const isCurrentRangeToday =
          isTodayUtc(start, now()) || isTodayUtc(end, now());
        const prevCompareHour = isCurrentRangeToday
          ? Math.max(0, targetHour - 1)
          : targetHour;

        if (filters?.device_type) {
          const curr = await computeSessionsFromDeviceColumnsImpl({
            start,
            end,
            conn,
            filters,
            metric: "sessions",
          });
          const prev = await computeSessionsFromDeviceColumnsImpl({
            start: prevWin.prevStart,
            end: prevWin.prevEnd,
            conn,
            filters,
            metric: "sessions",
          });
          const diff = curr - prev;
          const diff_pct = prev > 0 ? (diff / prev) * 100 : curr > 0 ? 100 : 0;
          const direction =
            diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
          return {
            metric: "TOTAL_SESSIONS_DELTA",
            range: { start, end },
            current: curr,
            previous: prev,
            diff_pct,
            direction,
            align: "hour",
            hour: targetHour,
          };
        }

        const sqlRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
        const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;
        const [currRow, prevRow, overallCurrRow] = await Promise.all([
          conn.query(sqlRange, {
            type: QueryTypes.SELECT,
            replacements: [start, end, targetHour],
          }),
          conn.query(sqlRange, {
            type: QueryTypes.SELECT,
            replacements: [prevWin.prevStart, prevWin.prevEnd, prevCompareHour],
          }),
          isCurrentRangeToday
            ? conn.query(sqlOverallSessions, {
                type: QueryTypes.SELECT,
                replacements: [start, end],
              })
            : Promise.resolve(null),
        ]);
        let curr = Number(currRow?.[0]?.total || 0);
        if (overallCurrRow) {
          curr = Number(overallCurrRow?.[0]?.total || 0);
        }
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct =
          prevVal > 0 ? (diff / prevVal) * 100 : curr > 0 ? 100 : 0;
        const direction =
          diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
        return {
          metric: "TOTAL_SESSIONS_DELTA",
          range: { start, end },
          current: curr,
          previous: prevVal,
          diff_pct,
          direction,
          align: "hour",
          hour: targetHour,
        };
      }

      const targetHour = resolveTargetHour(date);
      const prev = prevDayStrImpl(date);
      const isCurrentToday = isTodayUtc(date, now());
      const prevCompareHour = isCurrentToday
        ? Math.max(0, targetHour - 1)
        : targetHour;
      const sql = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date = ? AND hour <= ?`;
      const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date = ?`;
      const [currRow, prevRow, overallCurrRow] = await Promise.all([
        conn.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [date, targetHour],
        }),
        conn.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [prev, prevCompareHour],
        }),
        isCurrentToday
          ? conn.query(sqlOverallSessions, {
              type: QueryTypes.SELECT,
              replacements: [date],
            })
          : Promise.resolve(null),
      ]);
      let curr = Number(currRow?.[0]?.total || 0);
      if (overallCurrRow) {
        curr = Number(overallCurrRow?.[0]?.total || 0);
      }
      const prevVal = Number(prevRow?.[0]?.total || 0);
      const diff = curr - prevVal;
      const diff_pct =
        prevVal > 0 ? (diff / prevVal) * 100 : curr > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "TOTAL_SESSIONS_DELTA",
        date,
        current: curr,
        previous: prevVal,
        diff_pct,
        direction,
        align: "hour",
        hour: targetHour,
      };
    }

    const delta = await deltaForSumImpl("total_sessions", date, conn);
    return { metric: "TOTAL_SESSIONS_DELTA", date, ...delta };
  }

  async function calcAtcSessionsDelta({
    start,
    end,
    align,
    compare,
    conn,
    filters,
  }) {
    const date = end || start;
    if (!date && !(start && end)) {
      return {
        metric: "ATC_SESSIONS_DELTA",
        date: null,
        current: null,
        previous: null,
        diff_pct: 0,
        direction: "flat",
      };
    }

    if (hasUtmFiltersImpl(filters)) {
      const rangeStart = start || date;
      const rangeEnd = end || date;
      const curr = await computeAtcSessionsImpl({
        start: rangeStart,
        end: rangeEnd,
        conn,
        filters,
      });
      const prevWin = previousWindowImpl(rangeStart, rangeEnd);
      const prev = await computeAtcSessionsImpl({
        start: prevWin.prevStart,
        end: prevWin.prevEnd,
        conn,
        filters,
      });
      const diff = curr - prev;
      const diff_pct = prev > 0 ? (diff / prev) * 100 : curr > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "ATC_SESSIONS_DELTA",
        range: { start: rangeStart, end: rangeEnd },
        current: curr,
        previous: prev,
        diff_pct,
        direction,
      };
    }

    if (compare === "prev-range-avg" && start && end) {
      const currAvg = await avgForRangeImpl("total_atc_sessions", {
        start,
        end,
        conn,
      });
      const prevWin = previousWindowImpl(start, end);
      const prevAvg = await avgForRangeImpl("total_atc_sessions", {
        start: prevWin.prevStart,
        end: prevWin.prevEnd,
        conn,
      });
      const diff = currAvg - prevAvg;
      const diff_pct =
        prevAvg > 0 ? (diff / prevAvg) * 100 : currAvg > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "ATC_SESSIONS_DELTA",
        range: { start, end },
        current: currAvg,
        previous: prevAvg,
        diff_pct,
        direction,
        compare: "prev-range-avg",
      };
    }

    if ((align || "").toString().toLowerCase() === "hour") {
      const { nowIst, todayIst } = getIstContext(now());
      const resolveTargetHour = (endOrDate) =>
        endOrDate === todayIst ? nowIst.getUTCHours() : 23;

      if (start && end) {
        const targetHour = resolveTargetHour(end);
        const prevWin = previousWindowImpl(start, end);
        const isCurrentRangeToday =
          isTodayUtc(start, now()) || isTodayUtc(end, now());
        const prevCompareHour = isCurrentRangeToday
          ? Math.max(0, targetHour - 1)
          : targetHour;

        if (filters?.device_type) {
          const curr = await computeSessionsFromDeviceColumnsImpl({
            start,
            end,
            conn,
            filters,
            metric: "atc",
          });
          const prev = await computeSessionsFromDeviceColumnsImpl({
            start: prevWin.prevStart,
            end: prevWin.prevEnd,
            conn,
            filters,
            metric: "atc",
          });
          const diff = curr - prev;
          const diff_pct = prev > 0 ? (diff / prev) * 100 : curr > 0 ? 100 : 0;
          const direction =
            diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
          return {
            metric: "ATC_SESSIONS_DELTA",
            range: { start, end },
            current: curr,
            previous: prev,
            diff_pct,
            direction,
            align: "hour",
            hour: targetHour,
          };
        }

        const sqlRange = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
        const sqlOverallAtc = `SELECT COALESCE(SUM(total_atc_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;
        const [currRow, prevRow, overallCurrRow] = await Promise.all([
          conn.query(sqlRange, {
            type: QueryTypes.SELECT,
            replacements: [start, end, targetHour],
          }),
          conn.query(sqlRange, {
            type: QueryTypes.SELECT,
            replacements: [prevWin.prevStart, prevWin.prevEnd, prevCompareHour],
          }),
          isCurrentRangeToday
            ? conn.query(sqlOverallAtc, {
                type: QueryTypes.SELECT,
                replacements: [start, end],
              })
            : Promise.resolve(null),
        ]);
        let curr = Number(currRow?.[0]?.total || 0);
        if (overallCurrRow) {
          curr = Number(overallCurrRow?.[0]?.total || 0);
        }
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct =
          prevVal > 0 ? (diff / prevVal) * 100 : curr > 0 ? 100 : 0;
        const direction =
          diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
        return {
          metric: "ATC_SESSIONS_DELTA",
          range: { start, end },
          current: curr,
          previous: prevVal,
          diff_pct,
          direction,
          align: "hour",
          hour: targetHour,
        };
      }

      const targetHour = resolveTargetHour(date);
      const prev = prevDayStrImpl(date);
      const isCurrentToday = isTodayUtc(date, now());
      const prevCompareHour = isCurrentToday
        ? Math.max(0, targetHour - 1)
        : targetHour;
      const sql = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary_shopify WHERE date = ? AND hour <= ?`;
      const sqlOverallAtc = `SELECT COALESCE(SUM(total_atc_sessions),0) AS total FROM overall_summary WHERE date = ?`;
      const [currRow, prevRow, overallCurrRow] = await Promise.all([
        conn.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [date, targetHour],
        }),
        conn.query(sql, {
          type: QueryTypes.SELECT,
          replacements: [prev, prevCompareHour],
        }),
        isCurrentToday
          ? conn.query(sqlOverallAtc, {
              type: QueryTypes.SELECT,
              replacements: [date],
            })
          : Promise.resolve(null),
      ]);
      let curr = Number(currRow?.[0]?.total || 0);
      if (overallCurrRow) {
        curr = Number(overallCurrRow?.[0]?.total || 0);
      }
      const prevVal = Number(prevRow?.[0]?.total || 0);
      const diff = curr - prevVal;
      const diff_pct =
        prevVal > 0 ? (diff / prevVal) * 100 : curr > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "ATC_SESSIONS_DELTA",
        date,
        current: curr,
        previous: prevVal,
        diff_pct,
        direction,
        align: "hour",
        hour: targetHour,
      };
    }

    const delta = await deltaForSumImpl("total_atc_sessions", date, conn);
    return { metric: "ATC_SESSIONS_DELTA", date, ...delta };
  }

  async function calcAovDelta({
    start,
    end,
    align,
    compare,
    conn,
    debug,
    filters,
  }) {
    const date = end || start;
    log.debug(`[AOV DELTA] calcAovDelta called with range ${start} to ${end}`);
    if (!date && !(start && end)) {
      return {
        metric: "AOV_DELTA",
        date: null,
        current: null,
        previous: null,
        diff_pct: 0,
        direction: "flat",
      };
    }

    if (
      (compare || "").toString().toLowerCase() === "prev-range-avg" &&
      start &&
      end
    ) {
      const curr = await aovForRangeImpl({ start, end, conn, filters });
      const prevWin = previousWindowImpl(start, end);
      const prev = await aovForRangeImpl({
        start: prevWin.prevStart,
        end: prevWin.prevEnd,
        conn,
        filters,
      });
      const diff = curr - prev;
      const diff_pct = prev > 0 ? (diff / prev) * 100 : curr > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      return {
        metric: "AOV_DELTA",
        range: { start, end },
        current: curr,
        previous: prev,
        diff_pct,
        direction,
        compare: "prev-range-avg",
      };
    }

    if ((align || "").toString().toLowerCase() === "hour") {
      const { nowIst, todayIst, secondsNow } = getIstContext(now());
      const resolveTargetHour = (endOrDate) =>
        endOrDate === todayIst ? nowIst.getUTCHours() : 23;
      const fullDaySeconds = 24 * 3600;
      const resolveSeconds = (targetDate) =>
        targetDate === todayIst ? secondsNow : fullDaySeconds;
      if (start && end) {
        const targetHour = resolveTargetHour(end);
        const effectiveSeconds = Math.min(
          fullDaySeconds,
          Math.max(0, resolveSeconds(end)),
        );
        const cutoffTime =
          effectiveSeconds >= fullDaySeconds
            ? "24:00:00"
            : secondsToTime(effectiveSeconds);
        const prevWin = previousWindowImpl(start, end);

        let whereExtra = "";
        const curReplacements = [start, end, cutoffTime];
        if (filters) {
          whereExtra = appendUtmWhereImpl(whereExtra, curReplacements, filters);
        }
        const prevReplacements = [prevWin.prevStart, prevWin.prevEnd, cutoffTime];
        if (filters) {
          appendUtmWhereImpl("", prevReplacements, filters);
        }

        const salesSqlWithFilter =
          `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` +
          whereExtra;
        const ordersSqlWithFilter =
          `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` +
          whereExtra;

        const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] =
          await Promise.all([
            conn.query(salesSqlWithFilter, {
              type: QueryTypes.SELECT,
              replacements: curReplacements,
            }),
            conn.query(salesSqlWithFilter, {
              type: QueryTypes.SELECT,
              replacements: prevReplacements,
            }),
            conn.query(ordersSqlWithFilter, {
              type: QueryTypes.SELECT,
              replacements: curReplacements,
            }),
            conn.query(ordersSqlWithFilter, {
              type: QueryTypes.SELECT,
              replacements: prevReplacements,
            }),
          ]);

        const curSales = Number(salesCurRows?.[0]?.total || 0);
        const prevSales = Number(salesPrevRows?.[0]?.total || 0);
        const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
        const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

        const curAov = curOrders > 0 ? curSales / curOrders : 0;
        const prevAov = prevOrders > 0 ? prevSales / prevOrders : 0;
        const diff = curAov - prevAov;
        const diff_pct =
          prevAov > 0 ? (diff / prevAov) * 100 : curAov > 0 ? 100 : 0;
        const direction =
          diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
        const response = {
          metric: "AOV_DELTA",
          range: { start, end },
          current: curAov,
          previous: prevAov,
          diff_pct,
          direction,
          align: "hour",
          hour: targetHour,
          cutoff_time: cutoffTime,
        };
        if (debug) {
          response.sales = { current: curSales, previous: prevSales };
          response.orders = { current: curOrders, previous: prevOrders };
        }
        return response;
      }

      const targetHour = resolveTargetHour(date);
      const effectiveSeconds = Math.min(
        fullDaySeconds,
        Math.max(0, resolveSeconds(date)),
      );
      const cutoffTime =
        effectiveSeconds >= fullDaySeconds
          ? "24:00:00"
          : secondsToTime(effectiveSeconds);
      const prev = prevDayStrImpl(date);

      let whereExtra = "";
      const curReplacements = [date, date, cutoffTime];
      if (filters) {
        whereExtra = appendUtmWhereImpl(whereExtra, curReplacements, filters);
      }
      const prevReplacements = [prev, prev, cutoffTime];
      if (filters) {
        appendUtmWhereImpl("", prevReplacements, filters);
      }

      const salesSqlWithFilter =
        `SELECT COALESCE(SUM(total_price),0) AS total FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` +
        whereExtra;
      const ordersSqlWithFilter =
        `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_date >= ? AND created_date <= ? AND created_time < ?` +
        whereExtra;

      const [salesCurRows, salesPrevRows, ordersCurRows, ordersPrevRows] =
        await Promise.all([
          conn.query(salesSqlWithFilter, {
            type: QueryTypes.SELECT,
            replacements: curReplacements,
          }),
          conn.query(salesSqlWithFilter, {
            type: QueryTypes.SELECT,
            replacements: prevReplacements,
          }),
          conn.query(ordersSqlWithFilter, {
            type: QueryTypes.SELECT,
            replacements: curReplacements,
          }),
          conn.query(ordersSqlWithFilter, {
            type: QueryTypes.SELECT,
            replacements: prevReplacements,
          }),
        ]);

      const curSales = Number(salesCurRows?.[0]?.total || 0);
      const prevSales = Number(salesPrevRows?.[0]?.total || 0);
      const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
      const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

      const curAov = curOrders > 0 ? curSales / curOrders : 0;
      const prevAov = prevOrders > 0 ? prevSales / prevOrders : 0;
      const diff = curAov - prevAov;
      const diff_pct =
        prevAov > 0 ? (diff / prevAov) * 100 : curAov > 0 ? 100 : 0;
      const direction =
        diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
      const response = {
        metric: "AOV_DELTA",
        date,
        current: curAov,
        previous: prevAov,
        diff_pct,
        direction,
        align: "hour",
        hour: targetHour,
        cutoff_time: cutoffTime,
      };
      if (debug) {
        response.sales = { current: curSales, previous: prevSales };
        response.orders = { current: curOrders, previous: prevOrders };
      }
      return response;
    }

    const delta = await deltaForAOVImpl(date, conn);
    return { metric: "AOV_DELTA", date, ...delta };
  }

  async function calcCvrDelta({ start, end, align, compare, conn, filters }) {
    const target = end || start;
    if (!target && !(start && end)) {
      return {
        metric: "CVR_DELTA",
        date: null,
        current: null,
        previous: null,
        diff_pp: 0,
        diff_pct: 0,
        direction: "flat",
      };
    }

    const alignLower = (align || "").toString().toLowerCase();
    const compareLower = (compare || "").toString().toLowerCase();

    if (hasUtmFiltersImpl(filters)) {
      let curr;
      let prev;
      if (start && end) {
        curr = await cvrForRangeImpl({ start, end, conn, filters });
        const prevWin = previousWindowImpl(start, end);
        prev = await cvrForRangeImpl({
          start: prevWin.prevStart,
          end: prevWin.prevEnd,
          conn,
          filters,
        });
        const delta = computePercentDeltaImpl(
          curr.cvr_percent || 0,
          prev.cvr_percent || 0,
        );
        if (curr.total_sessions === 0) {
          return {
            metric: "CVR_DELTA",
            range: { start, end },
            current: curr,
            previous: prev,
            diff_pp: 0,
            diff_pct: 0,
            direction: "flat",
          };
        }
        return {
          metric: "CVR_DELTA",
          range: { start, end },
          current: curr,
          previous: prev,
          diff_pp: delta.diff_pp,
          diff_pct: delta.diff_pct,
          direction: delta.direction,
        };
      }

      const prevStr = prevDayStrImpl(target);
      [curr, prev] = await Promise.all([
        computeCVRForDayImpl(target, conn, filters),
        computeCVRForDayImpl(prevStr, conn, filters),
      ]);
      if (curr.total_sessions === 0) {
        return {
          metric: "CVR_DELTA",
          date: target,
          current: curr,
          previous: prev,
          diff_pp: 0,
          diff_pct: 0,
          direction: "flat",
        };
      }
      const delta = computePercentDeltaImpl(
        curr.cvr_percent || 0,
        prev.cvr_percent || 0,
      );
      return {
        metric: "CVR_DELTA",
        date: target,
        current: curr,
        previous: prev,
        diff_pp: delta.diff_pp,
        diff_pct: delta.diff_pct,
        direction: delta.direction,
      };
    }

    if (compareLower === "prev-range-avg" && start && end) {
      const curr = await cvrForRangeImpl({ start, end, conn, filters });
      if (curr.total_sessions === 0) {
        return {
          metric: "CVR_DELTA",
          range: { start, end },
          current: curr,
          previous: { cvr_percent: 0 },
          diff_pp: 0,
          diff_pct: 0,
          direction: "flat",
          compare: "prev-range-avg",
        };
      }

      const prevWin = previousWindowImpl(start, end);
      const prev = await cvrForRangeImpl({
        start: prevWin.prevStart,
        end: prevWin.prevEnd,
        conn,
        filters,
      });
      const delta = computePercentDeltaImpl(
        curr.cvr_percent || 0,
        prev.cvr_percent || 0,
      );
      return {
        metric: "CVR_DELTA",
        range: { start, end },
        current: curr,
        previous: prev,
        diff_pp: delta.diff_pp,
        diff_pct: delta.diff_pct,
        direction: delta.direction,
        compare: "prev-range-avg",
      };
    }

    const base = new Date(`${target}T00:00:00Z`);
    const prev = new Date(base.getTime() - 24 * 3600_000);
    const prevStr = formatUtcDate(prev);

    if (alignLower === "hour") {
      const { nowIst, todayIst, secondsNow } = getIstContext(now());
      const resolveTargetHour = (endOrDate) =>
        endOrDate === todayIst ? nowIst.getUTCHours() : 23;
      const fullDaySeconds = 24 * 3600;
      const resolveSeconds = (targetDate) =>
        targetDate === todayIst ? secondsNow : fullDaySeconds;

      if (start && end) {
        const rangeStart = start;
        const rangeEnd = end;
        const targetHour = resolveTargetHour(end);
        const effectiveSeconds = Math.min(
          fullDaySeconds,
          Math.max(0, resolveSeconds(rangeEnd)),
        );
        const cutoffTime =
          effectiveSeconds >= fullDaySeconds
            ? "24:00:00"
            : secondsToTime(effectiveSeconds);
        const isCurrentRangeToday =
          isTodayUtc(rangeStart, now()) || isTodayUtc(rangeEnd, now());
        const prevCompareHour = isCurrentRangeToday
          ? Math.max(0, targetHour - 1)
          : targetHour;
        const prevCutoffSeconds = isCurrentRangeToday
          ? Math.min(fullDaySeconds, (prevCompareHour + 1) * 3600)
          : effectiveSeconds;
        const prevCutoffTime =
          prevCutoffSeconds >= fullDaySeconds
            ? "24:00:00"
            : secondsToTime(prevCutoffSeconds);

        const sqlSessRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date >= ? AND date <= ? AND hour <= ?`;
        const orderRangeSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
        const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?`;

        const prevWin = previousWindowImpl(rangeStart, rangeEnd);
        const [
          sessCurRows,
          sessPrevRows,
          ordCurRows,
          ordPrevRows,
          overallCurrSess,
        ] = await Promise.all([
          conn.query(sqlSessRange, {
            type: QueryTypes.SELECT,
            replacements: [rangeStart, rangeEnd, targetHour],
          }),
          conn.query(sqlSessRange, {
            type: QueryTypes.SELECT,
            replacements: [prevWin.prevStart, prevWin.prevEnd, prevCompareHour],
          }),
          conn.query(orderRangeSql, {
            type: QueryTypes.SELECT,
            replacements: [rangeStart, rangeEnd, cutoffTime],
          }),
          conn.query(orderRangeSql, {
            type: QueryTypes.SELECT,
            replacements: [prevWin.prevStart, prevWin.prevEnd, prevCutoffTime],
          }),
          isCurrentRangeToday
            ? conn.query(sqlOverallSessions, {
                type: QueryTypes.SELECT,
                replacements: [rangeStart, rangeEnd],
              })
            : Promise.resolve(null),
        ]);

        let curSessions = Number(sessCurRows?.[0]?.total || 0);
        if (overallCurrSess) {
          curSessions = Number(overallCurrSess?.[0]?.total || 0);
        }
        const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
        const curOrders = Number(ordCurRows?.[0]?.cnt || 0);
        const prevOrders = Number(ordPrevRows?.[0]?.cnt || 0);

        const curCVR = curSessions > 0 ? curOrders / curSessions : 0;
        const prevCVR = prevSessions > 0 ? prevOrders / prevSessions : 0;
        const delta = computePercentDeltaImpl(curCVR * 100, prevCVR * 100);
        return {
          metric: "CVR_DELTA",
          range: { start, end },
          current: {
            total_orders: curOrders,
            total_sessions: curSessions,
            cvr: curCVR,
            cvr_percent: curCVR * 100,
          },
          previous: {
            total_orders: prevOrders,
            total_sessions: prevSessions,
            cvr: prevCVR,
            cvr_percent: prevCVR * 100,
          },
          diff_pp: delta.diff_pp,
          diff_pct: delta.diff_pct,
          direction: delta.direction,
          align: "hour",
          hour: targetHour,
          cutoff_time: cutoffTime,
        };
      }

      const targetHour = resolveTargetHour(target);
      const effectiveSeconds = Math.min(
        fullDaySeconds,
        Math.max(0, resolveSeconds(target)),
      );
      const cutoffTime =
        effectiveSeconds >= fullDaySeconds
          ? "24:00:00"
          : secondsToTime(effectiveSeconds);
      const isCurrentToday = isTodayUtc(target, now());
      const prevCompareHour = isCurrentToday
        ? Math.max(0, targetHour - 1)
        : targetHour;
      const prevCutoffSeconds = isCurrentToday
        ? Math.min(fullDaySeconds, (prevCompareHour + 1) * 3600)
        : effectiveSeconds;
      const prevCutoffTime =
        prevCutoffSeconds >= fullDaySeconds
          ? "24:00:00"
          : secondsToTime(prevCutoffSeconds);

      const sqlSess = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary_shopify WHERE date = ? AND hour <= ?`;
      const orderSql = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_dt >= ? AND created_dt <= ? AND created_time < ?`;
      const sqlOverallSessions = `SELECT COALESCE(SUM(total_sessions),0) AS total FROM overall_summary WHERE date = ?`;

      const [
        sessCurRows,
        sessPrevRows,
        ordersCurRows,
        ordersPrevRows,
        overallCurrSess,
      ] = await Promise.all([
        conn.query(sqlSess, {
          type: QueryTypes.SELECT,
          replacements: [target, targetHour],
        }),
        conn.query(sqlSess, {
          type: QueryTypes.SELECT,
          replacements: [prevStr, prevCompareHour],
        }),
        conn.query(orderSql, {
          type: QueryTypes.SELECT,
          replacements: [target, target, cutoffTime],
        }),
        conn.query(orderSql, {
          type: QueryTypes.SELECT,
          replacements: [prevStr, prevStr, prevCutoffTime],
        }),
        isCurrentToday
          ? conn.query(sqlOverallSessions, {
              type: QueryTypes.SELECT,
              replacements: [target],
            })
          : Promise.resolve(null),
      ]);

      let curSessions = Number(sessCurRows?.[0]?.total || 0);
      if (overallCurrSess) {
        curSessions = Number(overallCurrSess?.[0]?.total || 0);
      }
      const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
      const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
      const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

      const curCVR = curSessions > 0 ? curOrders / curSessions : 0;
      const prevCVR = prevSessions > 0 ? prevOrders / prevSessions : 0;
      const delta = computePercentDeltaImpl(curCVR * 100, prevCVR * 100);
      return {
        metric: "CVR_DELTA",
        date: target,
        current: {
          total_orders: curOrders,
          total_sessions: curSessions,
          cvr: curCVR,
          cvr_percent: curCVR * 100,
        },
        previous: {
          total_orders: prevOrders,
          total_sessions: prevSessions,
          cvr: prevCVR,
          cvr_percent: prevCVR * 100,
        },
        diff_pp: delta.diff_pp,
        diff_pct: delta.diff_pct,
        direction: delta.direction,
        align: "hour",
        hour: targetHour,
        cutoff_time: cutoffTime,
      };
    }

    const [current, previous] = await Promise.all([
      computeCVRForDayImpl(target, conn, filters),
      computeCVRForDayImpl(prevStr, conn, filters),
    ]);

    if (current.total_sessions === 0) {
      return {
        metric: "CVR_DELTA",
        date: target,
        current,
        previous,
        diff_pp: 0,
        diff_pct: 0,
        direction: "flat",
      };
    }

    const delta = computePercentDeltaImpl(
      current.cvr_percent || 0,
      previous.cvr_percent || 0,
    );
    return {
      metric: "CVR_DELTA",
      date: target,
      current,
      previous,
      diff_pp: delta.diff_pp,
      diff_pct: delta.diff_pct,
      direction: delta.direction,
    };
  }

  return {
    calcTotalOrdersDelta,
    calcTotalSalesDelta,
    calcTotalSessionsDelta,
    calcAtcSessionsDelta,
    calcAovDelta,
    calcCvrDelta,
  };
}

function buildMetricsLegacyDeltaService(deps = {}) {
  return buildMetricsDeltaMethods(deps);
}

module.exports = {
  buildMetricsDeltaMethods,
  buildMetricsLegacyDeltaService,
  isTodayUtc,
  getIstContext,
  secondsToTime,
  formatUtcDate,
};
