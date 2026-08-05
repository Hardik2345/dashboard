/* eslint-env jest */

const {
  buildUtmWhereClause,
} = require("../../../utils/metricsUtils");

describe("metricsUtils buildUtmWhereClause", () => {
  test("builds parameterized predicates for single and multi value filters", () => {
    const result = buildUtmWhereClause(
      {
        utm_source: "google",
        sales_channel: ["app-a", "app-b"],
      },
      { prefixWithAnd: true },
    );

    expect(result).toEqual({
      clause:
        " AND utm_source = ? AND order_app_name IN (?, ?)",
      params: ["google", "app-a", "app-b"],
    });
  });

  test("maps direct utm source to null-aware snapshot predicates", () => {
    const result = buildUtmWhereClause(
      {
        utm_source: ["direct", "meta"],
      },
      { mapDirectToNull: true },
    );

    expect(result).toEqual({
      clause: "(utm_source IN (?) OR utm_source IS NULL)",
      params: ["meta"],
    });
  });

  test("uses overridden device column and returns empty predicates for no filters", () => {
    expect(buildUtmWhereClause(null)).toEqual({ clause: "", params: [] });
    expect(
      buildUtmWhereClause(
        { device_type: ["Desktop", "Mobile"] },
        { deviceColumn: "so.user_agent", prefixWithAnd: true },
      ),
    ).toEqual({
      clause:
        " AND (so.user_agent LIKE '%Windows%' OR (so.user_agent LIKE '%Android%' OR so.user_agent LIKE '%iPhone%'))",
      params: [],
    });
  });
});
