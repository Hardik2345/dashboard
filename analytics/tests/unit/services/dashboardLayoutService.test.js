/* eslint-env jest */

const {
  DEFAULT_DESKTOP_LAYOUT,
  DEFAULT_MOBILE_LAYOUT,
  normalizeStoredLayout,
  mergeVisibleOrder,
  getEditableWidgetIds,
  buildDashboardLayoutService,
} = require("../../../services/dashboardLayoutService");

describe("dashboardLayoutService", () => {
  test("normalizes stored layouts while preserving unknown widgets and appending defaults", () => {
    const normalized = normalizeStoredLayout({
      version: 99,
      desktop: ["legacy_widget", "kpi_cards", "legacy_widget", "traffic_split"],
      mobile: ["traffic_split", "top_pages"],
    });

    expect(normalized.version).toBe(1);
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
    const upsert = jest.fn().mockResolvedValue([{}, true]);
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({
        layout_json: {
          version: 1,
          desktop: ["legacy_hidden", ...DEFAULT_DESKTOP_LAYOUT],
          mobile: ["legacy_hidden", ...DEFAULT_MOBILE_LAYOUT],
        },
      });

    const service = buildDashboardLayoutService({
      model: { findOne, upsert },
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
      "kpi_cards",
      "kpi_trend",
      "top_pages",
      "traffic_split",
    ]);
    expect(upsert).toHaveBeenCalledWith({
      user_id: "user-1",
      page_name: "dashboard",
      layout_json: result,
    });
  });
});
