/* eslint-env jest */

const {
  DEFAULT_DESKTOP_LAYOUT,
  DEFAULT_MOBILE_LAYOUT,
  normalizeStoredLayout,
  mergeVisibleOrder,
  getEditableWidgetIds,
  buildDashboardLayoutService,
} = require("../../../services/dashboardLayoutService");
const {
  DEFAULT_DESKTOP_KPI_ORDER,
} = require("../../../services/dashboardKpiLayout");

describe("dashboardLayoutService", () => {
  test("normalizes stored layouts while preserving unknown widgets and appending defaults", () => {
    const normalized = normalizeStoredLayout({
      version: 99,
      desktop: ["legacy_widget", "kpi_cards", "legacy_widget", "traffic_split"],
      mobile: ["traffic_split", "top_pages"],
    });

    expect(normalized.version).toBe(2);
    expect(normalized.desktop).toEqual([
      "legacy_widget",
      "kpi_cards",
      "traffic_split",
      "kpi_trend",
      "payment_split",
      "payment_trend",
    ]);
    expect(normalized.mobile).toEqual([
      "traffic_split",
      "top_pages",
      "kpi_cards",
      "kpi_trend",
      "payment_split",
      "payment_trend",
    ]);
    expect(normalized.kpiCardsDesktop.order).toEqual(DEFAULT_DESKTOP_KPI_ORDER);
    expect(normalized.kpiCardsDesktop.pinned).toEqual([]);
  });

  test("normalizes nested desktop KPI layout and caps pinned ids", () => {
    const normalized = normalizeStoredLayout({
      desktop: DEFAULT_DESKTOP_LAYOUT,
      mobile: DEFAULT_MOBILE_LAYOUT,
      kpiCardsDesktop: {
        order: ["orders", "revenue", "orders", "custom_metric"],
        pinned: ["revenue", "missing_metric", "orders", "aov", "sessions"],
      },
    });

    expect(normalized.kpiCardsDesktop.order).toEqual([
      "orders",
      "revenue",
      "custom_metric",
      ...DEFAULT_DESKTOP_KPI_ORDER.filter(
        (id) => !["orders", "revenue"].includes(id),
      ),
    ]);
    expect(normalized.kpiCardsDesktop.pinned).toEqual([
      "revenue",
      "orders",
      "aov",
    ]);
  });

  test("mergeVisibleOrder reorders only editable slots and preserves hidden widgets in place", () => {
    const merged = mergeVisibleOrder(
      ["kpi_cards", "legacy_hidden", "traffic_split", "payment_split"],
      ["payment_split", "kpi_cards"],
      ["kpi_cards", "payment_split"],
    );

    expect(merged).toEqual([
      "payment_split",
      "legacy_hidden",
      "traffic_split",
      "kpi_cards",
    ]);
  });

  test("getEditableWidgetIds respects current widget permissions", () => {
    const editable = getEditableWidgetIds({
      isAuthor: false,
      permissions: ["web_vitals", "payment_split_order"],
    });

    expect(editable.desktop).toEqual([
      "kpi_cards",
      "kpi_trend",
      "payment_split",
      "payment_trend",
    ]);
    expect(editable.mobile).toEqual([
      "kpi_cards",
      "kpi_trend",
      "top_pages",
      "payment_split",
      "payment_trend",
    ]);
  });

  test("saveLayoutForUser creates normalized persisted layout and preserves hidden widgets", async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({});
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({
        layoutJson: {
          version: 1,
          desktop: ["legacy_hidden", ...DEFAULT_DESKTOP_LAYOUT],
          mobile: ["legacy_hidden", ...DEFAULT_MOBILE_LAYOUT],
        },
      });

    const service = buildDashboardLayoutService({
      model: { findOne, findOneAndUpdate },
    });

    const result = await service.saveLayoutForUser(
      "user-1",
      { isAuthor: false, permissions: ["payment_split_order"] },
      {
        desktop: ["payment_split", "kpi_trend", "kpi_cards", "payment_trend"],
        mobile: ["payment_trend", "payment_split", "kpi_cards", "kpi_trend"],
      },
    );

    expect(result.desktop).toEqual([
      "legacy_hidden",
      "payment_split",
      "kpi_trend",
      "kpi_cards",
      "payment_trend",
      "traffic_split",
    ]);
    expect(result.mobile).toEqual([
      "legacy_hidden",
      "payment_trend",
      "payment_split",
      "top_pages",
      "kpi_cards",
      "kpi_trend",
      "traffic_split",
    ]);
    expect(result.kpiCardsDesktop.order).toEqual(DEFAULT_DESKTOP_KPI_ORDER);
    expect(result.kpiCardsDesktop.pinned).toEqual([]);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        userId: "user-1",
        pageName: "dashboard",
      },
      {
        $set: {
          layoutJson: result,
          updatedAt: expect.any(Date),
        },
        $setOnInsert: {
          createdAt: expect.any(Date),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  });

  test("saveLayoutForUser persists submitted nested KPI layout", async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({});
    const findOne = jest.fn().mockResolvedValueOnce({
      layoutJson: {
        version: 2,
        desktop: DEFAULT_DESKTOP_LAYOUT,
        mobile: DEFAULT_MOBILE_LAYOUT,
        kpiCardsDesktop: {
          order: DEFAULT_DESKTOP_KPI_ORDER,
          pinned: ["orders"],
        },
      },
    });

    const service = buildDashboardLayoutService({
      model: { findOne, findOneAndUpdate },
    });

    const result = await service.saveLayoutForUser(
      "user-2",
      { isAuthor: true, permissions: ["all"] },
      {
        desktop: DEFAULT_DESKTOP_LAYOUT,
        mobile: DEFAULT_MOBILE_LAYOUT,
        kpiCardsDesktop: {
          order: ["revenue", "orders", ...DEFAULT_DESKTOP_KPI_ORDER.slice(2)],
          pinned: ["revenue", "orders"],
        },
      },
    );

    expect(result.kpiCardsDesktop.pinned).toEqual(["revenue", "orders"]);
    expect(result.kpiCardsDesktop.order.slice(0, 2)).toEqual([
      "revenue",
      "orders",
    ]);
  });
});
