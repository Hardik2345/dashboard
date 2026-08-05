function normalizeTodoistTaskUrl(taskLike = {}) {
  const webUrl = String(taskLike.web_url || "").trim();
  if (webUrl) return webUrl;

  const rawUrl = String(taskLike.url || "").trim();
  if (/^https:\/\/app\.todoist\.com\//i.test(rawUrl)) {
    return rawUrl;
  }

  const taskId = String(taskLike.todoist_task_id || taskLike.task_id || taskLike.id || "").trim();
  if (taskId) {
    return `https://app.todoist.com/app/task/${encodeURIComponent(taskId)}`;
  }

  return "";
}

module.exports = {
  normalizeTodoistTaskUrl,
};
