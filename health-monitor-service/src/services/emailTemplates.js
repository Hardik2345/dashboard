function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function humanizeIdentifier(value) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toSentenceCase(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatTimestamp(value) {
  if (!value) return "N/A";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toISOString();
}

function formatDowntime(durationMs) {
  const total = Number(durationMs);
  if (!Number.isFinite(total) || total <= 0) return "0s";

  const seconds = Math.floor(total / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (remainingSeconds || parts.length === 0) parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

function truncate(value, maxLength) {
  const text = String(value ?? "");
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function parseMaybeJson(candidate) {
  if (!candidate) return null;
  if (typeof candidate === "object") return candidate;
  if (typeof candidate !== "string") return null;

  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

function extractFailurePayload(failure) {
  const body = parseMaybeJson(failure?.responseBody);
  if (body && typeof body === "object") return body;

  const summary = parseMaybeJson(failure?.responseSummary);
  if (summary && typeof summary === "object") return summary;

  return {};
}

function buildFailureDetails(incident, failure) {
  const payload = extractFailurePayload(failure);
  const message = toSentenceCase(
    payload.message
      || payload.functionalMessage
      || payload.error
      || failure?.responseSummary
      || incident?.lastProbeMessage
      || "",
  );

  const rows = [
    {
      label: "HTTP Status",
      value: failure?.responseCode != null ? String(failure.responseCode) : "",
    },
    {
      label: "Failure Type",
      value: payload.type ? humanizeIdentifier(payload.type) : "",
    },
    {
      label: "Subsystem",
      value: payload.failingSubsystem ? humanizeIdentifier(payload.failingSubsystem) : "",
    },
    {
      label: "Failure Stage",
      value: payload.failureStage ? humanizeIdentifier(payload.failureStage) : "",
    },
    {
      label: "Retryable",
      value:
        typeof payload.retryable === "boolean" ? (payload.retryable ? "Yes" : "No") : "",
    },
  ].filter((row) => row.value);

  if (message) {
    rows.push({
      label: "Failure Summary",
      value: truncate(message, 220),
    });
  }

  return {
    payload,
    rows,
    message,
  };
}

function getSeverityPalette(severity) {
  if (severity === "CRITICAL") {
    return {
      banner: "#c53030",
      badgeBg: "#fde8e8",
      badgeText: "#9b1c1c",
      accent: "#c53030",
    };
  }

  return {
    banner: "#dd6b20",
    badgeBg: "#feebc8",
    badgeText: "#9c4221",
    accent: "#dd6b20",
  };
}

function getRecoveryPalette() {
  return {
    banner: "#2f855a",
    badgeBg: "#c6f6d5",
    badgeText: "#276749",
    accent: "#2f855a",
  };
}

function getStatusPresentation(status) {
  if (String(status).toUpperCase() === "UP") {
    return { label: "UP", dot: "●", color: "#2f855a", bg: "#c6f6d5", text: "#276749" };
  }

  return { label: "DOWN", dot: "●", color: "#c53030", bg: "#fed7d7", text: "#9b2c2c" };
}

function buildOpenHeadline(details) {
  if (details.payload?.failingSubsystem) {
    return `${humanizeIdentifier(details.payload.failingSubsystem)} Failure`;
  }

  if (details.message) {
    const normalized = details.message
      .replace(/^Intentional test failure:\s*/i, "")
      .replace(/\.$/, "");
    return truncate(normalized, 60);
  }

  return "Health Check Failure Detected";
}

function buildOpenSubtitle(incident, failure) {
  const statusCode = failure?.responseCode != null ? `HTTP ${failure.responseCode}` : "an error";
  return `${incident.service} returned ${statusCode} during the scheduled health check.`;
}

function buildDependencyRows(dependencyPayload) {
  return Object.entries(dependencyPayload || {}).map(([name, details]) => ({
    name: humanizeIdentifier(name),
    status: details?.status || "DOWN",
    message: details?.message || "No message provided",
  }));
}

function buildRecommendedAction({ details, dependencyRows }) {
  const downDependencies = dependencyRows.filter(
    (dependency) => String(dependency.status).toUpperCase() !== "UP",
  );

  if (downDependencies.length > 0) {
    const names = downDependencies.map((dependency) => dependency.name).join(", ");
    return `Verify the failing dependencies first: ${names}. After dependency recovery, re-check the affected service path.`;
  }

  if (details.payload?.failingSubsystem) {
    return `Verify the ${humanizeIdentifier(details.payload.failingSubsystem)} workflow. Dependencies appear healthy, so review the recent logs for application exceptions or downstream call failures.`;
  }

  return "Review the failure details and recent logs, then re-run the affected health path once the underlying issue is corrected.";
}

function buildPlainOpenText({ incident, failure, enrichment, details, headline, subtitle }) {
  const dependencyRows = buildDependencyRows(enrichment?.dependencyPayload);
  const dependencyLines = dependencyRows.length
    ? dependencyRows.map(
        (dependency) =>
          `- ${dependency.name}: ${String(dependency.status).toUpperCase()} (${dependency.message})`,
      )
    : ["- N/A"];

  const detailLines = details.rows.length
    ? details.rows.map((row) => `${row.label}: ${row.value}`)
    : [`Failure Summary: ${truncate(failure?.responseSummary || "N/A", 220)}`];

  return [
    "Datum Health Monitor",
    `${headline} [${incident.severity}]`,
    subtitle,
    "",
    "Incident Information",
    `Service: ${incident.service}`,
    `Endpoint: ${incident.endpoint}`,
    `Started At: ${formatTimestamp(incident.startedAt)}`,
    `Incident ID: ${incident.incidentId}`,
    "",
    "Failure Details",
    ...detailLines,
    "",
    "Dependency Health",
    ...dependencyLines,
    "",
    "Recent Logs",
    enrichment?.logs || "N/A",
    "",
    "Recommended Action",
    buildRecommendedAction({ details, dependencyRows }),
    "",
    "Generated automatically by Datum Health Monitor.",
    "Please do not reply to this email.",
  ].join("\n");
}

function wrapEmail({ headerColor, badgeHtml, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1a202c;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f7fb;margin:0;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:680px;background-color:#f4f7fb;">
            <tr>
              <td style="padding:0 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${headerColor};border-radius:12px 12px 0 0;">
                  <tr>
                    <td style="padding:24px 28px;color:#ffffff;">
                      <div style="font-size:14px;line-height:20px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Datum Health Monitor</div>
                      <div style="padding-top:14px;">${badgeHtml}</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #d9e2ec;border-top:none;border-radius:0 0 12px 12px;">
                  <tr>
                    <td style="padding:24px 20px 28px 20px;">${bodyHtml}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderCard(title, innerHtml) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #d9e2ec;border-radius:10px;background-color:#ffffff;margin-top:16px;">
      <tr>
        <td style="padding:18px 20px 8px 20px;font-size:16px;line-height:22px;font-weight:700;color:#102a43;">${escapeHtml(title)}</td>
      </tr>
      <tr>
        <td style="padding:0 20px 20px 20px;">${innerHtml}</td>
      </tr>
    </table>`;
}

function renderKeyValueTable(rows) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      ${rows
        .map(
          (row) => `
        <tr>
          <td style="width:38%;padding:10px 0;border-bottom:1px solid #e6edf5;font-size:13px;line-height:18px;color:#486581;font-weight:700;">${escapeHtml(row.label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e6edf5;font-size:14px;line-height:20px;color:#102a43;">${escapeHtml(row.value)}</td>
        </tr>`,
        )
        .join("")}
    </table>`;
}

function renderDependencyTable(rows) {
  if (!rows.length) {
    return `<div style="font-size:14px;line-height:20px;color:#486581;">No dependency data was attached to this incident.</div>`;
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #bcccdc;font-size:12px;line-height:16px;color:#486581;font-weight:700;text-transform:uppercase;">Dependency</td>
        <td style="padding:10px 0;border-bottom:1px solid #bcccdc;font-size:12px;line-height:16px;color:#486581;font-weight:700;text-transform:uppercase;">Status</td>
        <td style="padding:10px 0;border-bottom:1px solid #bcccdc;font-size:12px;line-height:16px;color:#486581;font-weight:700;text-transform:uppercase;">Message</td>
      </tr>
      ${rows
        .map((row) => {
          const statusPresentation = getStatusPresentation(row.status);
          return `
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #e6edf5;font-size:14px;line-height:20px;color:#102a43;">${escapeHtml(row.name)}</td>
              <td style="padding:12px 0;border-bottom:1px solid #e6edf5;">
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:${statusPresentation.bg};color:${statusPresentation.text};font-size:12px;line-height:16px;font-weight:700;">${statusPresentation.dot} ${statusPresentation.label}</span>
              </td>
              <td style="padding:12px 0;border-bottom:1px solid #e6edf5;font-size:14px;line-height:20px;color:#334e68;">${escapeHtml(row.message)}</td>
            </tr>`;
        })
        .join("")}
    </table>`;
}

function renderLogsBlock(logs) {
  return `<pre style="margin:0;padding:16px;background-color:#0f172a;border-radius:8px;color:#e2e8f0;font-size:12px;line-height:18px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;white-space:pre-wrap;word-break:break-word;">${escapeHtml(logs || "N/A")}</pre>`;
}

function renderActionBox(text, accentColor) {
  return `<div style="padding:16px 18px;border-left:4px solid ${accentColor};background-color:#f8fafc;border-radius:8px;font-size:14px;line-height:21px;color:#243b53;">${escapeHtml(text)}</div>`;
}

function renderFooter() {
  return `
    <div style="padding-top:18px;font-size:12px;line-height:18px;color:#7b8794;text-align:center;">
      Generated automatically by Datum Health Monitor.<br />
      Please do not reply to this email.
    </div>`;
}

function buildOpenSubject(incident, failure, details) {
  const subjectTitle = details.payload?.failingSubsystem
    ? `${humanizeIdentifier(details.payload.failingSubsystem)} Failure`
    : buildOpenHeadline(details);
  const httpCode = failure?.responseCode != null ? ` | HTTP ${failure.responseCode}` : "";
  return `🚨 ${incident.service}${httpCode} | ${truncate(subjectTitle, 48)}`;
}

function buildResolvedSubject(incident) {
  return `✅ ${incident.service} | Incident Resolved`;
}

function buildOpenEmail({ incident, failure, enrichment }) {
  const details = buildFailureDetails(incident, failure);
  const palette = getSeverityPalette(incident.severity);
  const headline = buildOpenHeadline(details);
  const subtitle = buildOpenSubtitle(incident, failure);
  const dependencyRows = buildDependencyRows(enrichment?.dependencyPayload);
  const actionText = buildRecommendedAction({ details, dependencyRows });

  const bodyHtml = `
    <div style="font-size:28px;line-height:34px;font-weight:700;color:#102a43;">${escapeHtml(headline)}</div>
    <div style="padding-top:8px;font-size:15px;line-height:22px;color:#486581;">${escapeHtml(subtitle)}</div>
    ${renderCard(
      "Incident Information",
      renderKeyValueTable([
        { label: "Service", value: incident.service },
        { label: "Endpoint", value: incident.endpoint },
        { label: "Started At", value: formatTimestamp(incident.startedAt) },
        { label: "Incident ID", value: incident.incidentId },
      ]),
    )}
    ${renderCard(
      "Failure Details",
      details.rows.length
        ? renderKeyValueTable(details.rows)
        : `<div style="font-size:14px;line-height:20px;color:#334e68;">${escapeHtml(
            truncate(failure?.responseSummary || "No structured failure details available.", 400),
          )}</div>`,
    )}
    ${renderCard("Dependency Health", renderDependencyTable(dependencyRows))}
    ${renderCard("Recent Logs", renderLogsBlock(enrichment?.logs || "N/A"))}
    ${renderCard("Recommended Action", renderActionBox(actionText, palette.accent))}
    ${renderFooter()}
  `;

  const badgeHtml = `
    <span style="display:inline-block;background-color:${palette.badgeBg};color:${palette.badgeText};padding:6px 12px;border-radius:999px;font-size:12px;line-height:16px;font-weight:700;text-transform:uppercase;">${escapeHtml(incident.severity)}</span>
    <span style="display:inline-block;padding-left:12px;font-size:14px;line-height:20px;font-weight:600;vertical-align:middle;">Incident Open</span>`;

  return {
    subject: buildOpenSubject(incident, failure, details),
    text: buildPlainOpenText({ incident, failure, enrichment, details, headline, subtitle }),
    html: wrapEmail({
      headerColor: palette.banner,
      badgeHtml,
      bodyHtml,
    }),
  };
}

function buildPlainResolvedText(incident) {
  return [
    "Datum Health Monitor",
    "Incident Resolved",
    `${incident.service} recovered for ${incident.endpoint}.`,
    "",
    `Service: ${incident.service}`,
    `Endpoint: ${incident.endpoint}`,
    `Started At: ${formatTimestamp(incident.startedAt)}`,
    `Recovered At: ${formatTimestamp(incident.resolvedAt)}`,
    `Downtime: ${formatDowntime(incident.duration)}`,
    `Total Retries: ${incident.totalRetries ?? 0}`,
    `Incident ID: ${incident.incidentId}`,
    "",
    "Generated automatically by Datum Health Monitor.",
    "Please do not reply to this email.",
  ].join("\n");
}

function buildResolvedEmail(incident) {
  const palette = getRecoveryPalette();
  const bodyHtml = `
    <div style="font-size:28px;line-height:34px;font-weight:700;color:#102a43;">Incident Resolved</div>
    <div style="padding-top:8px;font-size:15px;line-height:22px;color:#486581;">${escapeHtml(`${incident.service} recovered for ${incident.endpoint}.`)}</div>
    ${renderCard(
      "Resolution Details",
      renderKeyValueTable([
        { label: "Service", value: incident.service },
        { label: "Endpoint", value: incident.endpoint },
        { label: "Started At", value: formatTimestamp(incident.startedAt) },
        { label: "Recovered At", value: formatTimestamp(incident.resolvedAt) },
        { label: "Downtime", value: formatDowntime(incident.duration) },
        { label: "Total Retries", value: String(incident.totalRetries ?? 0) },
        { label: "Incident ID", value: incident.incidentId },
      ]),
    )}
    ${renderCard(
      "Recommended Action",
      renderActionBox(
        "Confirm that downstream alerting, queue processing, and recent health checks remain stable before closing the operational thread.",
        palette.accent,
      ),
    )}
    ${renderFooter()}
  `;

  const badgeHtml = `
    <span style="display:inline-block;background-color:${palette.badgeBg};color:${palette.badgeText};padding:6px 12px;border-radius:999px;font-size:12px;line-height:16px;font-weight:700;text-transform:uppercase;">Recovered</span>
    <span style="display:inline-block;padding-left:12px;font-size:14px;line-height:20px;font-weight:600;vertical-align:middle;">Incident Resolved</span>`;

  return {
    subject: buildResolvedSubject(incident),
    text: buildPlainResolvedText(incident),
    html: wrapEmail({
      headerColor: palette.banner,
      badgeHtml,
      bodyHtml,
    }),
  };
}

module.exports = {
  buildOpenEmail,
  buildResolvedEmail,
  formatDowntime,
};
