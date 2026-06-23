class TodoistApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "TodoistApiError";
    this.status = status;
    this.body = body;
    this.permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
}

class TodoistClient {
  constructor({ apiToken, apiBaseUrl, fetchImpl = fetch }) {
    this.apiToken = apiToken;
    this.apiBaseUrl = String(apiBaseUrl || "https://api.todoist.com/api/v1").replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  async request(path, options = {}) {
    const res = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }

    if (!res.ok) {
      throw new TodoistApiError(`Todoist API ${res.status}`, res.status, body);
    }
    return body;
  }

  createTask(payload) {
    return this.request("/tasks", { method: "POST", body: payload });
  }

  updateTask(taskId, payload) {
    return this.request(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: payload,
    });
  }

  createComment(taskId, content) {
    return this.request("/comments", {
      method: "POST",
      body: { task_id: taskId, content },
    });
  }

  sync(syncToken = "*") {
    return this.request("/sync", {
      method: "POST",
      body: {
        sync_token: syncToken || "*",
        resource_types: ["items", "notes", "collaborators"],
      },
    });
  }

  createProject(name) {
    return this.request("/projects", { method: "POST", body: { name } });
  }

  getProject(projectId) {
    return this.request(`/projects/${encodeURIComponent(projectId)}`);
  }

  // Todoist API v1 list endpoints return a paginated object
  // ({ results: [...], next_cursor }), not a bare array. Walk the cursor and
  // return a flat array so callers can iterate/`.find` safely.
  async listAll(path) {
    const sep = path.includes("?") ? "&" : "?";
    const all = [];
    let cursor = null;
    do {
      const query = cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : "";
      const body = await this.request(`${path}${query}`);
      if (Array.isArray(body)) return body; // tolerate legacy array responses
      if (Array.isArray(body?.results)) all.push(...body.results);
      cursor = body?.next_cursor || null;
    } while (cursor);
    return all;
  }

  listProjects() {
    return this.listAll("/projects");
  }

  listSections(projectId) {
    return this.listAll(`/sections?project_id=${encodeURIComponent(projectId)}`);
  }

  createSection(name, projectId) {
    return this.request("/sections", { method: "POST", body: { name, project_id: projectId } });
  }
}

module.exports = {
  TodoistApiError,
  TodoistClient,
};
