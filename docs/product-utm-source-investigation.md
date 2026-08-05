# Product × UTM Source Investigation

## 1. Background

### Why this pipeline was built

Datum already supported product-level filtering and UTM-level filtering independently, but those two scopes could not previously be applied together with a consistent attribution model. The Product × UTM Source pipeline was built to answer a narrower and more explicit question:

> For a selected purchased product, how did orders, revenue, sessions, and add-to-cart activity break down by UTM source?

This is not the same question as "which landing page converted" or "which PDP got the last attributed session in Shopify Analytics." The pipeline was designed around purchased-product attribution.

### Architecture

The implementation combines two upstream data sources:

1. ShopifyQL session-side data
   - Provides session and cart-addition activity by landing page / product mapping / UTM dimensions.
2. `shopify_orders`
   - Provides purchased-product order rows and revenue rows.
3. Python merge layer
   - Merges session-side product attribution with order-side purchased-product attribution into Product × UTM aggregates.

The resulting warehouse tables are:

- `product_utm_daily`
- `product_utm_hourly`

Datum reads those tables only for the combined `product_id + utm_source` state.

### Final attribution model

The final model is:

`Purchased product × UTM source`

That means:

- the product dimension comes from the purchased product recorded in order rows
- the UTM source dimension comes from the order/session attribution pipeline
- the displayed numbers answer "how many purchased units/orders/revenue belonged to this product under this source attribution?"

### What Datum displays

For the combined Product × UTM Source state, Datum displays supported metrics derived from `product_utm_daily` / `product_utm_hourly`:

- Orders
- Revenue
- Sessions
- ATC Sessions
- AOV
- Conversion Rate
- ATC Rate
- Cancellation count / rate
- Refund count / rate
- Payment split counts

Unsupported metrics in the combined state are intentionally shown as unavailable:

- CI events
- Checkout rate derived from CI
- RTO metrics
- Any metric not present in `product_utm_*`

### Architecture diagram

```text
ShopifyQL Sessions
  -> landing page / product mapping
  -> UTM dimensions

shopify_orders
  -> purchased product rows
  -> revenue rows
  -> UTM attribution fields

Python merge
  -> Product × UTM daily/hourly datasets

Warehouse tables
  -> product_utm_daily
  -> product_utm_hourly

Datum backend
  -> combined product_id + utm_source branch

Datum frontend
  -> KPI cards
  -> trend graphs
  -> filter option sync
```

---

## 2. Initial Problem

During sanity checking, a discrepancy appeared for the following case:

- Brand: `BBB`
- Product: `old-money-long-lasting-perfume-for-men`
- UTM Source: `facebook`
- Date: `2026-07-29`

Observed behavior:

- Datum showed: `4 orders`
- Shopify Analytics appeared to show: `0 orders`

At face value, this looked like a serious aggregation defect. The first suspicion was that either:

- the Product × UTM pipeline was merging rows incorrectly
- Datum was still querying an older aggregation table
- product mapping was resolving to the wrong product
- Shopify orders were being double-counted or attributed to the wrong product

This investigation was started to determine whether the implementation was actually wrong, or whether the discrepancy was caused by comparing unlike attribution models.

---

## 3. Investigation Timeline

This section documents the investigation in the order it was performed. Some steps were proven directly from the repository. Others came from manual DB / Shopify / infrastructure checks during the investigation and are marked accordingly.

### ShopifyQL verification

**Hypothesis**

The ShopifyQL side of the pipeline was wrong, causing sessions or landing-page attribution to be assigned to the wrong product.

**Reason**

If the session-side source product mapping was wrong, then the merged Product × UTM dataset would also be wrong.

**Evidence**

Manual investigation verified:

- the ShopifyQL query itself
- sessions returned for the selected date window
- landing-page-to-product mapping behavior

This was not proven from repository code alone; it was part of the manual data sanity-check exercise.

**Result**

Working correctly.

---

### Datum query verification

**Hypothesis**

Datum was not actually reading `product_utm_daily` / `product_utm_hourly` and was accidentally still using older UTM or product aggregation tables.

**Reason**

If the frontend or backend were still routing combined Product × UTM requests to legacy sources, the dashboard could show values that did not match the new pipeline.

**Evidence**

Repository audit showed the following:

- Frontend includes both `product_id` and `utm_source` in dashboard requests in [client/dashboard/src/App.jsx](</E:/tech it/dashboard/client/dashboard/src/App.jsx:907>).
- KPI cards, when both product and source are active, call `/metrics/summary` and use that response for supported metrics in [client/dashboard/src/components/KPIs.jsx](</E:/tech it/dashboard/client/dashboard/src/components/KPIs.jsx:1409>).
- Request filters are normalized in [analytics/shared/utils/filters.js](</E:/tech it/dashboard/analytics/shared/utils/filters.js:154>).
- Combined-branch detection is implemented in [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:27>).
- The combined branch explicitly resolves to:
  - `product_utm_daily`
  - `product_utm_hourly`
  in [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:65>).
- Summary totals, summary pair queries, and trend rows all use the combined aggregate helpers:
  - [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:421>)
  - [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:452>)
  - [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:547>)

**Result**

Confirmed: Datum reads the correct Product × UTM tables for the combined `product_id + utm_source` state.

---

### Database verification

**Hypothesis**

The warehouse output itself was wrong even if Datum was querying the correct tables.

**Reason**

If `product_utm_daily` or `product_utm_hourly` contained incorrect aggregates, the dashboard could still be wrong despite correct query routing.

**Evidence**

Manual DB verification checked:

- daily table contents
- hourly table contents
- merge output consistency

The exact repository-independent ad hoc SQL used during that manual verification was not fully preserved in source control, but the following manual inspection queries were captured:

```sql
SELECT * FROM BBB.product_utm_daily;
```

```sql
SELECT * FROM BBB.product_utm_hourly ORDER BY date DESC;
```

These checks were used to confirm that rows existed at the expected grain and with the expected dimensions.

**Result**

Daily and hourly merged outputs were considered correct.

---

### Product mapping verification

**Hypothesis**

The discrepancy was caused by incorrect landing-page-to-product mapping.

**Reason**

If a session landed on one PDP but the mapping assigned it to another product, then source attribution could drift.

**Evidence**

Manual investigation verified:

- `landing_page_path`
- normalized path behavior
- `product_id` mapping
- product hit ratios

On the Datum side, product option rendering also showed that the UI label is derived from `landing_page_path`, while the real filter value is `product_id` in [client/dashboard/src/App.jsx](</E:/tech it/dashboard/client/dashboard/src/App.jsx:1884>).

**Result**

Product mapping was not the issue.

---

### Timezone verification

**Hypothesis**

The discrepancy was caused by local-date boundary mistakes, especially on the current day.

**Reason**

If one side used a different local date window, the same order could appear on different days.

**Evidence**

Manual investigation verified local date windows and confirmed that the relevant orders belonged to the expected day.

Repository audit also showed that Datum applies timezone-aware cutoff logic for today in [analytics/services/metricsFoundation.js](</E:/tech it/dashboard/analytics/services/metricsFoundation.js:31>) and completed-hour logic in [analytics/services/metricsFoundation.js](</E:/tech it/dashboard/analytics/services/metricsFoundation.js:66>).

**Result**

Not the issue.

---

### UTM verification

**Hypothesis**

UTM source extraction from orders was wrong, causing `facebook` orders to be assigned elsewhere.

**Reason**

If the source field were normalized inconsistently, Datum could display orders under `facebook` that Shopify did not show there.

**Evidence**

Manual investigation verified UTM extraction from `shopify_orders`.

Repository audit also confirmed that in the combined aggregate path Datum filters by exact source value, not fuzzy matching:

- `appendUtmWhere(..., false)` is used for aggregate Product × UTM tables in [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:431>)
- exact equality / `IN` behavior is defined in [analytics/shared/utils/filters.js](</E:/tech it/dashboard/analytics/shared/utils/filters.js:81>)

For a single selected source like `facebook`, the clause resolves to:

```sql
AND utm_source = ?
```

There is no `LIKE`, alias mapping, or legacy "direct/null" rewrite on the Product × UTM aggregate path.

**Result**

UTM extraction and exact source filtering were correct.

---

### Product ID verification

**Hypothesis**

Only the first line item of an order was storing `product_id`, causing purchased-product attribution to be incomplete or wrong.

**Reason**

If `shopify_orders` stored only one product per order, then Product × UTM attribution by purchased product would be unreliable.

**Evidence**

Manual investigation verified:

- one row per line item
- each row has its own `product_id`
- each row has its own `variant_id`

This was an important eliminated hypothesis because it would have invalidated purchased-product attribution entirely if false.

**Result**

Working correctly.

---

### Multiple line item verification

**Hypothesis**

Orders containing multiple products were being collapsed incorrectly, leading to cross-product contamination.

**Reason**

If one multi-line-item order leaked one product's attribution into another, Product × UTM counts would be wrong.

**Evidence**

Manual investigation checked multi-product orders and verified that product IDs were stored independently per line item.

Repository audit is consistent with this model because the product-specific sales logic in legacy product queries sums line-item revenue when `product_id` is present:

- [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:275>)
- [analytics/services/metricsSnapshotService.js](</E:/tech it/dashboard/analytics/services/metricsSnapshotService.js:1167>)
- [analytics/services/metricsSnapshotService.js](</E:/tech it/dashboard/analytics/services/metricsSnapshotService.js:1389>)

**Result**

Multiple line-item handling was correct.

---

### SQL verification

**Hypothesis**

Raw contributing `shopify_orders` rows did not actually support the aggregate values shown in Datum.

**Reason**

Even if the model and joins looked correct, the only decisive proof was whether aggregate values matched the raw order rows.

**Evidence**

Manual SQL verification was performed against the contributing `shopify_orders` rows for the disputed Product × UTM examples.

The exact ad hoc SQL used during that manual row verification was not preserved in the repository, so it cannot be reproduced verbatim from source alone. However, repository audit confirms the query shapes Datum would use in the combined path:

Combined summary totals:

```sql
SELECT
  COALESCE(SUM(orders), 0) AS total_orders,
  COALESCE(SUM(sales), 0) AS total_sales,
  COALESCE(SUM(sessions), 0) AS total_sessions,
  COALESCE(SUM(atc_sessions), 0) AS total_atc_sessions,
  COALESCE(SUM(cancelled_orders), 0) AS cancelled_orders,
  COALESCE(SUM(refunded_orders), 0) AS refunded_orders
FROM product_utm_daily
WHERE date >= ? AND date <= ?
  AND utm_source = ?
  AND product_id = ?
```

This query shape comes directly from [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:421>).

Combined hourly trend rows:

```sql
SELECT
  DATE_FORMAT(date, '%Y-%m-%d') AS date,
  hour,
  COALESCE(SUM(sales), 0) AS sales,
  COALESCE(SUM(orders), 0) AS orders,
  COALESCE(SUM(sessions), 0) AS sessions,
  COALESCE(SUM(atc_sessions), 0) AS atc
FROM product_utm_hourly
WHERE date >= ? AND date <= ?
  AND hour <= ?
  AND utm_source = ?
  AND product_id = ?
GROUP BY date, hour
ORDER BY date ASC, hour ASC
```

This query shape comes directly from [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:564>).

Manual validation concluded that the aggregated values matched the underlying raw rows.

**Result**

Aggregation was correct.

---

### Performance investigation

**Hypothesis**

The implementation might be logically correct but operationally unsafe because of heavy scans on Aurora.

**Reason**

The early implementation path caused expensive scans and needed infrastructure-level validation before it could be treated as production-safe.

**Evidence**

Manual infrastructure investigation covered:

- Aurora full scans
- IOPS pressure
- `DiskQueueDepth`
- query optimization
- migration to index-range-scan-friendly behavior
- ~99.9% reduction after optimization

These findings came from operational investigation and monitoring, not from repository code alone.

**Result**

Performance issue was addressed separately and was not the source of the attribution discrepancy.

---

## 4. Actual Root Cause

This was not a pipeline defect. The root cause was that two different attribution models were being compared as if they were the same.

### Model A: Datum

Datum uses:

`Purchased Product Attribution`

For the Product × UTM implementation, Datum answers:

> Which purchased product ultimately received the order and revenue under the given UTM source?

Example:

- Customer lands on `Build Your Own Box`
- Later purchases `Old Money`
- Datum counts the order under `Old Money`

That is correct for Datum's model because the product dimension is the purchased product.

### Model B: Shopify Analytics report used during comparison

The Shopify report used during sanity checking appeared to behave like a page-attributed or landing-page-attributed report rather than a purchased-product-attributed report.

That means the comparison was effectively:

- Shopify: "which page / attributed product received the session-based attribution?"
- Datum: "which purchased product received the order?"

Those are not equivalent when:

- purchased product != landing page product
- session attribution remains attached to one PDP or flow
- order attribution is later interpreted through the purchased product lens

### Why this creates natural differences

A user can:

1. enter through one PDP or bundle page
2. continue browsing
3. purchase a different product

In that case:

- a page-attributed analytics report may continue to associate the conversion with the originally attributed page/product
- Datum will correctly attribute the order to the actually purchased product

This explains cases like:

- Datum: `Old Money × facebook = 4 orders`
- Shopify view used during sanity check: `Old Money × facebook = 0 orders`

The discrepancy is expected if Shopify is reporting against page attribution while Datum is reporting against purchased-product attribution.

The important conclusion is that the observed mismatch does not imply that Datum's implementation is internally inconsistent.

---

## 5. Evidence

This section includes the real SQL evidence available from the investigation. Where the exact ad hoc query text was not preserved, that is stated explicitly.

### Manual inspection queries captured during investigation

```sql
SELECT * FROM BBB.product_utm_daily;
```

```sql
SELECT * FROM BBB.product_utm_hourly ORDER BY date DESC;
```

### Exact Datum query templates proven from repository code

Combined source resolution:

```js
if (isCombinedProductUtmSourceFilter(filters)) {
  return {
    table: granularity === "hourly" ? "product_utm_hourly" : "product_utm_daily",
    dateColumn: "date",
    hourColumn: "hour",
    filters: {
      product_id: filters.product_id,
      utm_source: filters.utm_source,
    },
  };
}
```

Source: [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:65>)

Combined summary totals:

```sql
SELECT
  COALESCE(SUM(orders), 0) AS total_orders,
  COALESCE(SUM(sales), 0) AS total_sales,
  COALESCE(SUM(sessions), 0) AS total_sessions,
  COALESCE(SUM(atc_sessions), 0) AS total_atc_sessions,
  COALESCE(SUM(cancelled_orders), 0) AS cancelled_orders,
  COALESCE(SUM(refunded_orders), 0) AS refunded_orders
FROM product_utm_daily
WHERE date >= ? AND date <= ?
  AND utm_source = ?
  AND product_id = ?
```

Source: [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:421>)

Combined hourly trend:

```sql
SELECT
  DATE_FORMAT(date, '%Y-%m-%d') AS date,
  hour,
  COALESCE(SUM(sales), 0) AS sales,
  COALESCE(SUM(orders), 0) AS orders,
  COALESCE(SUM(sessions), 0) AS sessions,
  COALESCE(SUM(atc_sessions), 0) AS atc
FROM product_utm_hourly
WHERE date >= ? AND date <= ?
  AND hour <= ?
  AND utm_source = ?
  AND product_id = ?
GROUP BY date, hour
ORDER BY date ASC, hour ASC
```

Source: [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:564>)

Source-option lookup for a selected product:

```sql
SELECT DISTINCT utm_source
FROM product_utm_daily
WHERE date >= ? AND date <= ?
  AND product_id = ?
ORDER BY utm_source
```

Source: [analytics/services/metricsAggregateService.js](</E:/tech it/dashboard/analytics/services/metricsAggregateService.js:797>)

Product-option lookup for a selected source:

```sql
SELECT
  p.product_id,
  lp.landing_page_path,
  SUM(p.sessions) AS total_sessions,
  SUM(p.atc_sessions) AS total_atc_sessions
FROM product_utm_daily p
LEFT JOIN (
  SELECT product_id, MIN(landing_page_path) AS landing_page_path
  FROM mv_product_sessions_by_path_daily
  WHERE date >= ? AND date <= ?
  GROUP BY product_id
) lp ON lp.product_id = p.product_id
WHERE p.product_id IS NOT NULL
  AND p.product_id <> ''
  AND p.date >= ? AND p.date <= ?
  AND utm_source = ?
GROUP BY p.product_id, lp.landing_page_path
ORDER BY total_sessions DESC
LIMIT 50
```

Source: [analytics/services/metricsPageService.js](</E:/tech it/dashboard/analytics/services/metricsPageService.js:96>)

### Evidence not preserved as exact SQL text

The following were manually verified during investigation, but the precise ad hoc query text was not preserved in the repository:

- raw `shopify_orders` row verification for the disputed product/source/date examples
- line-item-level product ID checks
- multi-line-item order checks
- Shopify Analytics-side validation queries / report filters

Those findings should still be considered part of the investigation history, but they cannot be reproduced verbatim from repository state alone.

---

## 6. What Was NOT Wrong

The following hypotheses were eliminated:

- Not timezone handling
- Not landing-page normalization
- Not product mapping
- Not UTM extraction
- Not `product_id` storage
- Not line-item handling
- Not multi-line-item orders
- Not merge logic
- Not duplicate rows introduced by Datum's combined aggregate queries
- Not Datum querying legacy UTM tables in the combined state
- Not exact-source filtering
- Not an SQL aggregation bug in the combined Product × UTM path
- Not a current-day local-date misalignment issue

Additional implementation details confirmed during repository audit:

- Combined Product × UTM requests do not filter by unexpected legacy dimensions such as `landing_page_path`, `product_handle`, `full_url_path`, `utm_medium`, or `utm_campaign`.
- Combined Product × UTM queries use `product_id` and `utm_source` only, plus date/hour.
- Unsupported combined metrics are intentionally marked unavailable rather than backfilled from broader sources.

---

## 7. Final Conclusion

The Product × UTM Source implementation is internally consistent.

Validated flow:

```text
Shopify Sessions
  -> Landing Page
  -> Product Mapping
  -> Product × UTM Source session-side attribution

Raw Orders
  -> Purchased Product × UTM Source order-side attribution

Python merge
  -> product_utm_daily / product_utm_hourly

Datum backend
  -> combined product_id + utm_source query branch

Datum frontend
  -> KPI / trend rendering
```

Every stage that was investigated was found to be consistent with the intended model.

The observed discrepancy with Shopify Analytics does not indicate a broken Datum pipeline. It originates from comparing two different attribution models:

- Datum: purchased-product attribution
- Shopify report used during sanity checking: apparently page-attributed / landing-page-attributed

That distinction is sufficient to produce legitimate differences when:

- the landing page product is different from the purchased product
- a customer enters through one product flow and buys another

### Important implementation note

One technical nuance was identified during repository audit:

- for current-day KPI behavior, Datum uses completed-hour logic for delta comparisons
- current KPI totals and delta KPI calculations can therefore come from different granularities on the same day

This is a query-shaping nuance, not the root cause of the Shopify mismatch documented here.

### Final position

The implementation should be considered correct for Datum's intended Product × UTM attribution model.

Future engineers should not reopen this investigation unless one of the following changes:

- the attribution model itself changes
- Shopify comparison is performed against a purchased-product-attributed report
- new evidence shows raw `shopify_orders` rows no longer match `product_utm_*`

Absent those conditions, the previously observed mismatch should be interpreted as an attribution-model difference, not as a pipeline defect.
