function scoreKpi(kpi) {
  const severityBonus = kpi.business_polarity === "negative" ? 20 : kpi.business_polarity === "positive" ? 10 : 0;
  const anomalyBonus = 0;
  return Math.abs(kpi.delta_percent || 0) * 0.45 + (kpi.importance_weight || 50) * 0.35 + severityBonus * 0.15 + anomalyBonus * 0.05;
}

function buildDeterministicInsights(kpis, maxItems = 3) {
  return (kpis || [])
    .filter((kpi) => Math.abs(kpi.delta_percent || 0) >= (kpi.min_delta_percent_for_insight || 5))
    .map((kpi) => ({ kpi, score: scoreKpi(kpi) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(({ kpi }) => {
      const verb = kpi.direction === "down" ? "declined" : kpi.direction === "up" ? "is up" : "remained stable";
      const title = kpi.direction === "flat" ? `${kpi.label} remained stable` : `${kpi.label} ${verb} ${Math.abs(kpi.delta_percent).toFixed(1)}%`;
      const summary =
        kpi.direction === "flat"
          ? `${kpi.label} was broadly unchanged compared with the previous period.`
          : `${kpi.label} moved from ${kpi.formatted_previous_value} to ${kpi.formatted_value} compared with the previous period.`;
      return {
        title,
        summary,
        sentiment: kpi.business_polarity,
        related_kpi_keys: [kpi.key],
        confidence: "high",
        source: "deterministic",
      };
    });
}

module.exports = { scoreKpi, buildDeterministicInsights };
