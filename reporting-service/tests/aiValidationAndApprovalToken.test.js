const test = require("node:test");
const assert = require("node:assert/strict");
const { validateDatumInsights, validateFocusItems } = require("../src/modules/ai/responseSchemas");
const { generateApprovalToken, hashApprovalToken } = require("../src/modules/approval/approvalToken.service");

test("datum AI validation rejects unknown KPI keys", () => {
  const result = validateDatumInsights(
    {
      insights: [
        {
          title: "Revenue up",
          summary: "Revenue increased.",
          sentiment: "positive",
          related_kpi_keys: ["unknown"],
          confidence: "high",
        },
      ],
    },
    ["gross_revenue"],
    3,
  );
  assert.equal(result, null);
});

test("focus AI validation rejects unknown task IDs", () => {
  const result = validateFocusItems(
    {
      focus_items: [
        {
          title: "Mobile improvements",
          category: "UX",
          source_task_ids: ["missing"],
          confidence: "medium",
        },
      ],
    },
    ["task-1"],
    5,
  );
  assert.equal(result, null);
});

test("approval tokens are random and hashed consistently", () => {
  const first = generateApprovalToken();
  const second = generateApprovalToken();
  assert.notEqual(first, second);
  assert.equal(hashApprovalToken(first), hashApprovalToken(first));
  assert.notEqual(hashApprovalToken(first), first);
});
