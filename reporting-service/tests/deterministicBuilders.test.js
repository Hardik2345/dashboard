const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDeterministicInsights } = require("../src/modules/generation/insightBuilder");
const { buildDeterministicFocusItems } = require("../src/modules/generation/focusBuilder");

test("deterministic insights rank significant KPI movements", () => {
  const insights = buildDeterministicInsights(
    [
      {
        key: "gross_revenue",
        label: "Gross Revenue",
        formatted_value: "₹56,789",
        formatted_previous_value: "₹50,524",
        delta_percent: 12.4,
        direction: "up",
        business_polarity: "positive",
        importance_weight: 95,
        min_delta_percent_for_insight: 5,
      },
      {
        key: "total_sessions",
        label: "Total Sessions",
        formatted_value: "38,765",
        formatted_previous_value: "42,552",
        delta_percent: -8.9,
        direction: "down",
        business_polarity: "negative",
        importance_weight: 80,
        min_delta_percent_for_insight: 5,
      },
    ],
    1,
  );
  assert.equal(insights.length, 1);
  assert.equal(insights[0].related_kpi_keys[0], "gross_revenue");
});

test("deterministic focus items group repeated task tags", () => {
  const focus = buildDeterministicFocusItems(
    [
      {
        _id: "1",
        title: "Improve mobile readability",
        impact_level: "high",
        tags: ["mobile"],
        category_name: "UX",
        category_icon: "smartphone",
        category_color: "#0ea5e9",
      },
      { _id: "2", title: "Tighten mobile typography", impact_level: "medium", tags: ["mobile"], category_name: "UX" },
      { _id: "3", title: "Refine chart labels", impact_level: "low", tags: ["analytics"], category_name: "Analytics" },
    ],
    1,
  );
  assert.equal(focus.length, 1);
  assert.deepEqual(focus[0].source_task_ids, ["1", "2"]);
  assert.equal(focus[0].icon, "smartphone");
  assert.equal(focus[0].color, "#0ea5e9");
});
