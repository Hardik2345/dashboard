function buildFocusSummaryPrompt(payload, maxItems) {
  return [
    {
      role: "system",
      content:
        "You summarize authored work logs for a tenant report. Use only the provided task list. Do not invent tasks, categories, outcomes, or metrics. Every output item must include source_task_ids from the input. Return valid JSON only.",
    },
    {
      role: "user",
      content: `Select up to ${maxItems} significant focus areas from the task logs. Rank by high impact, repeated similar work, specificity, and recency. Input JSON: ${JSON.stringify(payload)}. Return JSON shape: {"focus_items":[{"title":"string","category":"string","source_task_ids":["string"],"confidence":"high|medium|low"}]}`,
    },
  ];
}

module.exports = { buildFocusSummaryPrompt };
