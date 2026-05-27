function buildDatumInsightsPrompt(payload, maxItems) {
  return [
    {
      role: "system",
      content:
        "You generate concise business insights for a tenant dashboard report. Use only the JSON input provided. Do not invent causes, events, campaigns, user behavior, recommendations, or metric values. Return valid JSON only.",
    },
    {
      role: "user",
      content: `Create up to ${maxItems} report insights from the provided KPI candidates. Rank by business impact, negative movement requiring attention, and large positive movement worth highlighting. Input JSON: ${JSON.stringify(payload)}. Return JSON shape: {"insights":[{"title":"string","summary":"string","sentiment":"positive|negative|neutral","related_kpi_keys":["string"],"confidence":"high|medium|low"}]}`,
    },
  ];
}

module.exports = { buildDatumInsightsPrompt };
