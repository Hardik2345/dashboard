const test = require("node:test");
const assert = require("node:assert/strict");
const { mapSummaryValue } = require("../src/modules/integrations/analyticsClient");

test("maps analytics summary metric value objects", () => {
  const payload = {
    metrics: {
      total_orders: { value: 123 },
      total_sales: { value: 45678 },
      average_order_value: { value: 371.37 },
      total_sessions: { value: 9876 },
      atc_rate: { value: 8.42 },
      conversion_rate: { value: 1.25 },
    },
  };

  assert.equal(mapSummaryValue(payload, "total_orders"), 123);
  assert.equal(mapSummaryValue(payload, "gross_revenue"), 45678);
  assert.equal(mapSummaryValue(payload, "average_order_value"), 371.37);
  assert.equal(mapSummaryValue(payload, "total_sessions"), 9876);
  assert.equal(mapSummaryValue(payload, "atc_rate"), 8.42);
  assert.equal(mapSummaryValue(payload, "conversion_rate"), 1.25);
});
