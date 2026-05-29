#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const defaultRulesPath = path.join(scriptDir, "grafana-managed-alert-rules.json");

loadDotEnv(path.join(repoRoot, ".env"));

const config = {
  grafanaUrl: cleanUrl(requiredEnv("GRAFANA_STACK_URL")),
  token: requiredEnv("GRAFANA_SERVICE_ACCOUNT_TOKEN"),
  datasourceUid: process.env.GRAFANA_PROMETHEUS_DATASOURCE_UID,
  folderUid: process.env.GRAFANA_ALERT_FOLDER_UID || "production-core",
  folderTitle: process.env.GRAFANA_ALERT_FOLDER_TITLE || "Production Core",
  orgId: Number(process.env.GRAFANA_ORG_ID || 1),
  rulesPath: process.env.GRAFANA_ALERT_RULES_FILE || defaultRulesPath,
  includeWarnings: process.env.GRAFANA_INCLUDE_WARNING_ALERTS === "true",
  dryRun: process.argv.includes("--dry-run"),
};

const rulesConfig = JSON.parse(fs.readFileSync(config.rulesPath, "utf8"));
const activeRules = rulesConfig.rules.filter(
  (rule) => rule.severity === "critical" || config.includeWarnings
);

if (!activeRules.length) {
  throw new Error("No alert rules selected for provisioning.");
}

const datasourceUid = config.datasourceUid || (config.dryRun ? "prometheus" : await findPrometheusDatasourceUid());
const folderUid = config.dryRun ? config.folderUid : await ensureFolder();
const payload = {
  title: rulesConfig.groupName || "production-core",
  folderUid,
  interval: rulesConfig.intervalSeconds || 30,
  rules: activeRules.map((rule) =>
    toGrafanaRule(rule, {
      datasourceUid,
      folderUid,
      ruleGroup: rulesConfig.groupName || "production-core",
    })
  ),
};

if (config.dryRun) {
  console.log(JSON.stringify({ folderUid, payload }, null, 2));
  process.exit(0);
}

await grafanaRequest(
  `/api/v1/provisioning/folder/${encodeURIComponent(folderUid)}/rule-groups/${encodeURIComponent(payload.title)}`,
  {
    method: "PUT",
    body: JSON.stringify(payload),
  }
);

console.log(
  `Applied ${payload.rules.length} Grafana alert rules to folder "${config.folderTitle}" / group "${payload.title}".`
);

if (!config.includeWarnings) {
  console.log("Warning rules were skipped. Set GRAFANA_INCLUDE_WARNING_ALERTS=true to provision them later.");
}

function toGrafanaRule(rule, { datasourceUid, folderUid, ruleGroup }) {
  return {
    uid: rule.uid,
    orgID: config.orgId,
    folderUID: folderUid,
    ruleGroup,
    title: rule.title,
    condition: "B",
    data: [
      {
        refId: "A",
        queryType: "",
        datasourceUid,
        relativeTimeRange: { from: 600, to: 0 },
        model: {
          refId: "A",
          datasource: { type: "prometheus", uid: datasourceUid },
          editorMode: "code",
          expr: rule.expr,
          hide: false,
          instant: true,
          intervalMs: 1000,
          legendFormat: "__auto",
          maxDataPoints: 43200,
          range: false,
        },
      },
      {
        refId: "B",
        queryType: "",
        datasourceUid: "-100",
        relativeTimeRange: { from: 0, to: 0 },
        model: {
          refId: "B",
          datasource: { type: "__expr__", uid: "-100" },
          conditions: [
            {
              evaluator: { params: [0], type: "gt" },
              operator: { type: "and" },
              query: { params: ["A"] },
              reducer: { params: [], type: "last" },
              type: "query",
            },
          ],
          hide: false,
          intervalMs: 1000,
          maxDataPoints: 43200,
          type: "classic_conditions",
        },
      },
    ],
    noDataState: "NoData",
    execErrState: "Error",
    for: rule.for,
    annotations: {
      summary: rule.summary,
    },
    labels: {
      severity: rule.severity,
    },
    isPaused: false,
  };
}

async function ensureFolder() {
  const existing = await grafanaRequest(`/api/folders/${encodeURIComponent(config.folderUid)}`, {
    allow404: true,
  });

  if (existing?.uid) {
    return existing.uid;
  }

  const created = await grafanaRequest("/api/folders", {
    method: "POST",
    body: JSON.stringify({
      uid: config.folderUid,
      title: config.folderTitle,
    }),
  });

  return created.uid;
}

async function findPrometheusDatasourceUid() {
  const datasources = await grafanaRequest("/api/datasources");
  const prometheus = datasources.find((datasource) => datasource.type === "prometheus");

  if (!prometheus) {
    throw new Error(
      "Could not find a Prometheus data source. Set GRAFANA_PROMETHEUS_DATASOURCE_UID in .env."
    );
  }

  return prometheus.uid;
}

async function grafanaRequest(apiPath, options = {}) {
  const response = await fetch(`${config.grafanaUrl}${apiPath}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Disable-Provenance": "true",
    },
    body: options.body,
  });

  if (options.allow404 && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method || "GET"} ${apiPath} failed with ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = unquote(match[2].trim());
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function cleanUrl(url) {
  return url.replace(/\/+$/, "");
}
