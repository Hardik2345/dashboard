# Frontend Performance RCA for Datum

## Executive Summary
Datum's frontend slowness is primarily caused by a large initial dashboard payload, an oversized application shell, and request fan-out inside multiple dashboard widgets. The current production build ships roughly **2.01 MB raw / 501 KB gzip** of initial JS+CSS before any route-specific chunks are needed, with the entry bundle and core vendor chunks all preloaded from `index.html`. On top of that, the main shell still concentrates most dashboard orchestration in a **3,935-line `App.jsx`** containing **35 `useEffect`s, 42 `useMemo`s, 33 `useCallback`s, and 29 lazy imports**, so filter or auth state changes can invalidate a wide portion of the tree.

The heaviest runtime issues visible from source are:
- dashboard widgets still owning independent fetch lifecycles
- payment/trend widgets issuing per-hour or per-day request loops
- a very large global CSS payload from always-loaded UI systems
- overlapping UI/chart ecosystems increasing both bundle and render cost
- broad top-level state ownership in `App.jsx` with limited selector memoization

## Overall Performance Score
- **Current health:** 4/10
- **Primary risk profile:** Initial load cost + dashboard interaction fan-out
- **Most likely user-visible symptoms:** delayed first interaction, sluggish filter updates, chart/table stutter, dashboard-wide rerenders on small state changes

## Measured Baseline

### Production build
- Build command: `npm run build`
- Build result: **success**
- Build duration: **2m 36s**
- Modules transformed: **15,909**

### Initial payload loaded by `dist/index.html`
The entry HTML preloads these assets immediately:
- `index-77QaJE27.js`
- `vendor-react-I3DihAD2.js`
- `vendor-misc-DremAneR.js`
- `vendor-mui-OmRLen8i.js`
- `vendor-radix-BHtJSFkD.js`
- `vendor-motion-VJBsqJ5E.js`
- `vendor-polaris-8s9hESaS.js`
- `index-DZCCBItG.css`

Initial payload totals:
- **Initial JS raw:** 1,494,801 bytes
- **Initial JS gzip:** 437,031 bytes
- **Initial CSS raw:** 513,148 bytes
- **Initial CSS gzip:** 63,933 bytes
- **Initial total raw:** **2,007,949 bytes**
- **Initial total gzip:** **500,964 bytes**

### Largest emitted assets
| Asset | Raw | Gzip | Notes |
|---|---:|---:|---|
| `index-77QaJE27.js` | 578.28 KB | 172.03 KB | Main application shell |
| `index-DZCCBItG.css` | 513.15 KB | 64.65 KB | Global CSS, includes Polaris and shared styling |
| `vendor-mui-OmRLen8i.js` | 417.54 KB | 124.86 KB | MUI + Emotion |
| `vendor-recharts-BSnav6S4.js` | 349.59 KB | 98.85 KB | Recharts ecosystem |
| `vendor-chartjs-btEfEP-7.js` | 162.81 KB | 56.66 KB | Chart.js + `react-chartjs-2` + datalabels |
| `vendor-polaris-8s9hESaS.js` | 127.01 KB | 18.15 KB | Polaris runtime |
| `vendor-motion-VJBsqJ5E.js` | 122.32 KB | 40.35 KB | framer-motion |
| `vendor-radix-BHtJSFkD.js` | 115.44 KB | 36.11 KB | Radix UI primitives |
| `vendor-misc-DremAneR.js` | 90.14 KB | 30.57 KB | dayjs, axios, lucide, clsx, tailwind-merge, CVA |

## Critical Bottlenecks

### 1. Oversized initial dashboard shell and eager preload set
- **Affected area:** app startup, `/dashboard`, all first-route visits
- **Evidence:**
  - `dist/index.html` preloads six vendor chunks plus the main bundle and CSS.
  - Initial payload is **~2.01 MB raw / 501 KB gzip**.
  - `index-77QaJE27.js` alone is **578 KB raw / 172 KB gzip**.
  - `App.jsx` is **3,935 lines**.
- **Root cause:** The application shell still owns routing, authentication, dashboard orchestration, permissions, filter logic, layout editing, mobile/desktop branching, and widget composition. Existing lazy imports reduce some route payloads, but the shell still requires a large shared bundle and all core UI ecosystems up front.
- **Impact:** High startup parse/compile/execute cost and slower time-to-interaction, especially on lower-end devices.
- **Recommended fix:** Split the shell into route-level containers and push dashboard-specific orchestration out of `App.jsx`. Reduce what is required before the first authenticated screen can mount.
- **Complexity:** High
- **Expected gain:** Large reduction in first-load scripting cost and rerender scope.

### 2. Dashboard widgets still perform independent fetch orchestration
- **Affected area:** dashboard filters, KPI region, charts, traffic/payment widgets
- **Evidence:**
  - `KPIs.jsx` still calls `getDashboardSummary()` and `getProductKpis()`.
  - `TrafficSourceSplit.jsx` calls `getTrafficSourceSplit()`.
  - `ModeOfPayment.jsx` calls both `getOrderSplit()` and `getPaymentSalesSplit()`.
  - `PaymentSplitTrend.jsx` and `HourlySalesCompare.jsx` both own substantial fetch loops.
  - `App.jsx` still separately fetches `getSummaryFilterOptions()` and other dashboard-adjacent data.
- **Root cause:** Data orchestration is only partially centralized. Several high-cost widgets still fetch and transform their own data on mount and on filter changes.
- **Impact:** More network requests, more JSON parsing, duplicated loading logic, more React state updates, and more dashboard-wide recomputation after every filter interaction.
- **Recommended fix:** Finish consolidating default dashboard widgets onto a single shared dashboard data layer with prepared props.
- **Complexity:** Medium to High
- **Expected gain:** Major reduction in request count and update churn.

### 3. Extreme request fan-out in payment trend widgets
- **Affected area:** `PaymentSplitTrend`, `HourlySalesCompare`, payment-related dashboard interactions
- **Evidence:**
  - `PaymentSplitTrend.jsx` issues per-hour `Promise.all` loops over `hours.map(...)` and per-day loops over `currentDates.map(...)` / `comparisonDates.map(...)`.
  - `HourlySalesCompare.jsx` contains the same pattern for hourly and daily payment composites.
  - Worst-case hourly compare flow in either component:
    - 1 timezone bootstrap request
    - current range: 24 hours × 2 endpoints = 48 requests
    - comparison range: 24 hours × 2 endpoints = 48 requests
    - **total = 97 requests**
  - A 7-day daily compare flow becomes:
    - current range: 7 × 2 = 14 requests
    - comparison range: 7 × 2 = 14 requests
    - **total = 28 requests**
- **Root cause:** The frontend derives time-series buckets by repeatedly querying cumulative endpoints instead of consuming aggregated series responses.
- **Impact:** This is the clearest high-latency CPU/network amplifier in the codebase. It inflates network waterfalls, JSON parsing time, and chart preparation work.
- **Recommended fix:** Replace per-hour/per-day request loops with aggregate backend endpoints that return series in one response.
- **Complexity:** High, backend-dependent
- **Expected gain:** Very large improvement for filter response time and chart readiness.

### 4. Global CSS payload is too large
- **Affected area:** all routes, especially first paint and style calculation
- **Evidence:**
  - `index-DZCCBItG.css` is **513.15 KB raw / 64.65 KB gzip**.
  - `main.jsx` globally imports:
    - `@shopify/polaris/build/esm/styles.css`
    - `react-toastify/dist/ReactToastify.css`
    - `index.css`
- **Root cause:** Large framework-level CSS is always loaded, even when many routes do not need the full Polaris surface.
- **Impact:** Increased CSS download, parse, and style recalculation cost across the app.
- **Recommended fix:** Reduce always-on CSS by isolating Polaris usage, reviewing custom overrides, and only shipping route-needed CSS where practical.
- **Complexity:** Medium
- **Expected gain:** Moderate to large startup improvement.

## High-Impact Bottlenecks

### 5. Too many overlapping UI and chart ecosystems
- **Affected area:** bundle size, runtime complexity, styling/runtime overlap
- **Evidence:**
  - UI libraries in active use: **MUI + Emotion**, **Polaris**, **Radix**, **styled-components**
  - Chart libraries in active use: **Recharts** and **Chart.js / react-chartjs-2**
  - Bundle evidence:
    - `vendor-mui`: **417.54 KB raw**
    - `vendor-polaris`: **127.01 KB raw**
    - `vendor-radix`: **115.44 KB raw**
    - `vendor-recharts`: **349.59 KB raw**
    - `vendor-chartjs`: **162.81 KB raw**
- **Root cause:** The app carries multiple component systems and two chart ecosystems simultaneously, which increases both bundle size and cognitive/runtime overhead.
- **Impact:** High bundle weight and more styling/runtime duplication than needed for a single app shell.
- **Recommended fix:** Standardize over time on fewer UI/chart systems; prioritize chart unification first because both chart stacks are heavy.
- **Complexity:** High
- **Expected gain:** Large bundle reduction over multiple phases.

### 6. `App.jsx` still has broad state ownership and broad subscriptions
- **Affected area:** dashboard rerender scope, route transitions, filter interactions
- **Evidence:**
  - `App.jsx` subscribes directly to `auth`, `brand`, `filters`, and `productConversion` slices.
  - `App.jsx` contains:
    - **35 `useEffect`s**
    - **42 `useMemo`s**
    - **33 `useCallback`s**
  - `App.jsx` builds desktop and mobile widget registries directly and passes many freshly-derived query/selection props downward.
- **Root cause:** The shell remains a large state coordinator. Many downstream components receive derived objects from a parent that reruns often.
- **Impact:** Small state updates can still invalidate a large portion of the tree, especially on the dashboard where many props are assembled centrally.
- **Recommended fix:** Move ownership closer to feature containers and provide widgets with stable prepared data instead of many query fragments and callbacks.
- **Complexity:** High
- **Expected gain:** Large improvement in responsiveness and maintainability.

### 7. No selector memoization layer
- **Affected area:** Redux subscription efficiency
- **Evidence:**
  - `rg` found `useAppSelector(...)` usage but **no `createSelector` / `reselect` usage**.
  - `App.jsx` destructures broad slices directly from store state.
  - `ProductConversionTable.jsx` subscribes to the full `productConversion` slice.
- **Root cause:** Derived state is largely recomputed in components rather than memoized selectors.
- **Impact:** Increases rerender risk when slices change, especially where components consume large objects or many slice fields together.
- **Recommended fix:** Introduce memoized selectors for dashboard queries, permissions, active filters, and large table derivations.
- **Complexity:** Medium
- **Expected gain:** Moderate rerender reduction, especially in App-shell and dashboard filter surfaces.

### 8. Route isolation is incomplete despite `lazy()`
- **Affected area:** route-level performance and bundle coupling
- **Evidence:**
  - `App.jsx` contains **29 `lazy()` imports**, but all route decisions and most feature orchestration still live there.
  - `src/routes` is effectively absent as a real route-container layer.
  - The initial HTML still preloads most shared shell dependencies regardless of the first route.
- **Root cause:** Code-splitting exists at component boundaries, but not enough state/orchestration has moved out of the application shell.
- **Impact:** Some large route chunks are deferred, but the app still pays a high shared-shell cost on every entry.
- **Recommended fix:** Move to route-level containers with isolated state ownership and smaller shared shell responsibilities.
- **Complexity:** High
- **Expected gain:** Moderate to large startup and navigation improvement.

## Medium-Impact Findings

### 9. Chart components perform extra client-side work and animation
- **Affected area:** chart responsiveness and hover smoothness
- **Evidence:**
  - `TrafficSourceSplit.jsx`:
    - uses `requestAnimationFrame` count-up animations
    - builds Chart.js datasets/options in component
    - uses a custom external tooltip that writes `innerHTML`, reads `getBoundingClientRect()`, and repositions DOM on hover
  - `PaymentSplitTrend.jsx` and `HourlySalesCompare.jsx` both normalize and rebuild series after multi-request fetches.
- **Root cause:** Data shaping, animation, and tooltip layout all happen on the client per interaction.
- **Impact:** Moderate CPU and paint cost, especially during hover and filter changes.
- **Recommended fix:** Reduce chart animation cost, memoize data transforms more aggressively, and simplify custom tooltips.
- **Complexity:** Medium
- **Expected gain:** Noticeable interaction smoothness improvement.

### 10. Tables have non-trivial interactive overhead and limited containment
- **Affected area:** funnel/product/inventory routes
- **Evidence:**
  - `ProductConversionTable.jsx`:
    - subscribes to whole slice state
    - manages debounced fetches
    - uses document-level `mousemove`/`mouseup` for column resizing
    - reads `clientWidth` and writes widths for popover/select sizing
  - `InventoryTable.jsx` uses similar resize listeners.
  - No virtualization layer is present.
- **Root cause:** Rich table interactions are implemented inside large route components with custom width management and broad state coupling.
- **Impact:** Moderate cost on table-heavy routes and some extra event pressure even outside the primary dashboard.
- **Recommended fix:** Add virtualization where row counts justify it and isolate resizing/filter logic from the main table render path.
- **Complexity:** Medium
- **Expected gain:** Moderate, especially on product/inventory pages.

### 11. Global listeners and DOM-side work exist in the shell
- **Affected area:** app-wide interaction overhead
- **Evidence:**
  - `App.jsx` adds a global `scroll` listener for sticky panel border state.
  - `useSessionHeartbeat` adds `focus`, `blur`, `visibilitychange`, and `beforeunload` listeners.
  - Merchant requests and notifications add additional global listeners.
- **Root cause:** Global listeners are not the top bottleneck, but they add noise to an already heavy shell.
- **Impact:** Low to moderate individually; additive when combined with the heavy shell.
- **Recommended fix:** Keep global listeners minimal and isolate them to feature mounts where possible.
- **Complexity:** Low
- **Expected gain:** Small but worthwhile cleanup.

### 12. Dependency compatibility risk in the current UI stack
- **Affected area:** runtime predictability and future upgrades
- **Evidence:**
  - `npm ls` reports **invalid peer dependency expectations** because `@shopify/polaris@13.9.5` expects React 18 while the app is on **React 19.1.1**.
- **Root cause:** The app is running a UI dependency outside its declared peer range.
- **Impact:** Not proven to be the main current slowdown, but it increases upgrade and runtime risk.
- **Recommended fix:** Validate Polaris compatibility with React 19 or pin to a supported combination.
- **Complexity:** Medium
- **Expected gain:** Stability more than raw speed.

## Route and Feature Notes

### Dashboard route
Current desktop default widget registry still mounts or orchestrates:
- KPI cards (`KPIs`)
- KPI trend (`HourlySalesCompare`)
- traffic split (`TrafficSourceSplit`)
- payment split (`ModeOfPayment`)
- payment trend (`PaymentSplitTrend`)
- optional web performance/vitals panels

These widgets are not uniformly presentational. Several still own fetches and transforms, so a dashboard filter change triggers both parent-level recomputation and widget-local network work.

### Initial auth/login route
- `main.jsx` imports the full app shell and global CSS even for unauthenticated entry.
- Login is not isolated into a lightweight route bundle.

## Missing or limited evidence
This RCA includes hard evidence from production build output and source inspection. In this execution environment, I did **not** capture browser DevTools waterfalls, React DevTools Profiler screenshots, or real-user Web Vitals from a running browser session. Those measurements should be added in a follow-up profiling pass, but the current findings are already sufficient to prioritize the first optimization phases because the biggest bottlenecks are explicit in the build graph and source.

## Prioritized Optimization Roadmap

### Critical
1. Finish centralizing dashboard data fetching and remove widget-owned request loops.
2. Replace payment trend fan-out with aggregate backend endpoints.
3. Decompose `App.jsx` into route-level containers and shrink the shared shell.
4. Reduce initial payload by removing always-preloaded dependencies from the shell path where possible.

### High-impact
1. Introduce memoized selectors and move derived dashboard state out of render paths.
2. Unify chart usage over time; carrying both Recharts and Chart.js is expensive.
3. Revisit UI system overlap: Polaris + MUI + Radix + styled-components is too much for a single app shell.

### Medium-impact
1. Reduce chart animation and custom tooltip DOM work.
2. Add virtualization or stronger containment to heavy tables.
3. Trim global listener usage and route-localize feature event handlers.

### Nice-to-have
1. Audit icon imports for more granular usage.
2. Revisit Firebase/PWA loading strategy if push is not needed on every route.
3. Refresh browserslist data and validate package compatibility posture.

## Recommended next phase
The highest-ROI next step is architectural, not micro-optimization:
- centralize default dashboard widget data completely
- collapse fan-out queries into aggregate endpoints
- split the application shell into route containers

Those three changes address the dominant network, rerender, and startup costs identified here.
