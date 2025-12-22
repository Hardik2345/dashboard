
    dashboardSummary: async (req, res) => {
      try {
        const brandQuery = (req.query.brand || req.query.brand_key || (req.brandKey)).toString().trim();
        if (!brandQuery) return res.status(400).json({ error: "Missing brand_key" });
        
        // Ensure brand DB connection if passed via middleware or need to load
        // Actually fetchCachedMetrics only needs brandKey string.
        // But calculations need DB if cache miss.
        // Middleware 'ensureBrandDb' or 'protectedBrand' handles this.
        
        const date = (req.query.date || req.query.start || req.query.end || new Date().toISOString().slice(0,10)).toString();
        const prevDate = prevDayStr(date);
        
        console.log(`[SUMMARY] Fetching for ${brandQuery} on ${date} (prev: ${prevDate})`);

        // Parallel fetch from cache
        const [cached, cachedPrev] = await Promise.all([
          fetchCachedMetrics(brandQuery, date),
          fetchCachedMetrics(brandQuery, prevDate)
        ]);
        
        // Helper to get raw metrics (from cache or DB)
        // We define a small internal helper to standardize 'get metric'
        const getMetricsForDate = async (d, cData) => {
          if (cData) {
            return {
              total_orders: cData.total_orders,
              total_sales: cData.total_sales,
              total_sessions: cData.total_sessions,
              total_atc_sessions: cData.total_atc_sessions,
              average_order_value: cData.average_order_value,
              conversion_rate: cData.conversion_rate,
              conversion_rate_percent: cData.conversion_rate, // Assuming cache is percent
              source: 'cache'
            };
          }
          // Fallback to DB
          // We need to call existing helpers. 'req.brandDb.sequelize' is expected to be present.
          const conn = req.brandDb ? req.brandDb.sequelize : null;
          if (!conn) throw new Error("Database connection missing for fallback");
          
          const [sales, orders, sessions, atc, cvrObj, aovObj] = await Promise.all([
             rawSum('total_sales', { start: d, end: d, conn }),
             rawSum('total_orders', { start: d, end: d, conn }),
             rawSum('total_sessions', { start: d, end: d, conn }),
             rawSum('total_atc_sessions', { start: d, end: d, conn }),
             computeCVRForDay(d, conn),
             aovForRange({ start: d, end: d, conn }) // might need check
          ]);
          
          let aovVal = 0;
           if (typeof aovObj === 'object' && aovObj !== null) aovVal = Number(aovObj.aov || 0);
           else aovVal = Number(aovObj || 0);

          return {
            total_orders: orders,
            total_sales: sales,
            total_sessions: sessions,
            total_atc_sessions: atc,
            average_order_value: aovVal,
            conversion_rate: cvrObj.cvr,
            conversion_rate_percent: cvrObj.cvr_percent,
            source: 'db'
          };
        };

        const [current, previous] = await Promise.all([
          getMetricsForDate(date, cached),
          getMetricsForDate(prevDate, cachedPrev)
        ]);
        
        const calcDelta = (cur, prev) => {
           const diff = cur - prev;
           const diff_pct = prev > 0 ? (diff / prev) * 100 : (cur > 0 ? 100 : 0);
           const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
           return { diff, diff_pct, direction };
        };

        const response = {
          date,
          prev_date: prevDate,
          metrics: {
            total_orders: {
              value: current.total_orders,
              previous: previous.total_orders,
              ...calcDelta(current.total_orders, previous.total_orders)
            },
            total_sales: {
              value: current.total_sales,
              previous: previous.total_sales,
              ...calcDelta(current.total_sales, previous.total_sales)
            },
            average_order_value: {
              value: current.average_order_value,
              previous: previous.average_order_value,
              ...calcDelta(current.average_order_value, previous.average_order_value)
            },
            conversion_rate: {
              value: current.conversion_rate_percent, // Use percent for display
              previous: previous.conversion_rate_percent,
              ...calcDelta(current.conversion_rate_percent, previous.conversion_rate_percent)
            },
            total_sessions: {
              value: current.total_sessions,
              previous: previous.total_sessions,
              ...calcDelta(current.total_sessions, previous.total_sessions)
            },
            total_atc_sessions: {
              value: current.total_atc_sessions,
              previous: previous.total_atc_sessions,
              ...calcDelta(current.total_atc_sessions, previous.total_atc_sessions)
            }
          },
          sources: { current: current.source, previous: previous.source }
        };

        return res.json(response);
      } catch (e) {
        console.error('[dashboardSummary] Error:', e);
        return res.status(500).json({ error: 'Internal server error', details: e.message });
      }
    },
