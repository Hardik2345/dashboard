function impactScore(level) {
  if (level === "high") return 100;
  if (level === "low") return 30;
  return 60;
}

function buildGroupKey(task) {
  const tags = Array.isArray(task.tags) ? task.tags.slice().sort().join("|") : "";
  return `${task.category_id || "uncategorized"}:${tags || String(task.title || "").toLowerCase().slice(0, 32)}`;
}

function scoreTask(task, repetitionCount) {
  const detailQuality = task.description ? 100 : 60;
  const repetitionBonus = repetitionCount > 1 ? 100 : 0;
  return impactScore(task.impact_level) * 0.45 + 60 * 0.2 + 100 * 0.15 + detailQuality * 0.1 + repetitionBonus * 0.1;
}

function buildDeterministicFocusItems(tasks, maxItems = 5) {
  const groups = new Map();
  for (const task of tasks || []) {
    const key = buildGroupKey(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }

  return Array.from(groups.values())
    .map((items) => {
      const representative = items.slice().sort((a, b) => scoreTask(b, items.length) - scoreTask(a, items.length))[0];
      return {
        title: representative.title,
        category: representative.category_name || "General",
        icon: representative.category_icon || "cursor",
        color: representative.category_color || "#84cc16",
        source_task_ids: items.map((item) => String(item._id || item.id)),
        confidence: items.length > 1 || representative.impact_level === "high" ? "high" : "medium",
        source: "deterministic",
        score: scoreTask(representative, items.length),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map(({ score, ...item }) => item);
}

module.exports = { scoreTask, buildDeterministicFocusItems };
