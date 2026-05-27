function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderKpiCard(kpi) {
  const color = kpi.business_polarity === "negative" ? "#dc2626" : kpi.business_polarity === "positive" ? "#16a34a" : "#6b7280";
  return `
    <td style="width:33.33%;padding:10px;">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;min-height:130px;">
        <div style="font-size:14px;color:#4b5563;font-weight:600;">${escapeHtml(kpi.label)}</div>
        <div style="font-size:30px;line-height:1.4;font-weight:700;color:#111827;">${escapeHtml(kpi.formatted_value)}</div>
        <div style="font-size:15px;color:${color};font-weight:700;">${escapeHtml(Math.abs(kpi.delta_percent).toFixed(1))}% ${escapeHtml(kpi.direction)}</div>
      </div>
    </td>`;
}

function rows(items, render, perRow) {
  const output = [];
  for (let i = 0; i < items.length; i += perRow) {
    output.push(`<tr>${items.slice(i, i + perRow).map(render).join("")}</tr>`);
  }
  return output.join("");
}

const FOCUS_ICON_LABELS = {
  cursor: "↖",
  smartphone: "▯",
  sparkles: "✦",
  "file-text": "□",
  "bar-chart": "▥",
  "shopping-cart": "▱",
  target: "◎",
  users: "◉",
};

function renderFocusItem(item) {
  const color = /^#[0-9a-f]{6}$/i.test(item.color || "") ? item.color : "#84cc16";
  const iconLabel = FOCUS_ICON_LABELS[item.icon] || FOCUS_ICON_LABELS.cursor;
  return `<td style="width:20%;padding:8px;text-align:center;border-left:1px solid #e5e7eb;">
    <div style="width:38px;height:38px;border-radius:19px;background:${color}22;color:${color};line-height:38px;text-align:center;font-size:20px;font-weight:700;margin:0 auto 8px;">${escapeHtml(iconLabel)}</div>
    <div style="font-size:14px;font-weight:600;">${escapeHtml(item.title)}</div>
  </td>`;
}

function renderDigestEmail({ definition, run }) {
  const kpis = run.snapshot?.kpis || [];
  const insights = run.snapshot?.datum_insights || [];
  const focusItems = run.snapshot?.focus_items || [];
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px;">
      <tr><td align="center">
        <table role="presentation" width="760" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#050505;color:#ffffff;padding:28px 36px;">
              <div style="font-size:28px;font-weight:800;">${escapeHtml(run.tenant_id)}</div>
              <div style="font-size:14px;color:#d1d5db;margin-top:8px;">${escapeHtml(run.period.label)}</div>
            </td>
          </tr>
          <tr><td style="padding:36px;">
            <h1 style="margin:0;font-size:40px;line-height:1.1;">${escapeHtml(definition.name || "Digest")}</h1>
            <p style="margin:10px 0 26px;color:#6b7280;font-size:17px;">Your store performance at a glance.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows(kpis, renderKpiCard, 3)}</table>
            <div style="margin-top:28px;background:#f7fbef;border-radius:8px;padding:24px;">
              <h2 style="margin:0 0 14px;font-size:22px;">DATUM Insights</h2>
              ${insights.map((item) => `<div style="border-top:1px solid #e5e7eb;padding:14px 0;"><strong>${escapeHtml(item.title)}</strong><div style="font-size:14px;color:#374151;margin-top:5px;">${escapeHtml(item.summary)}</div></div>`).join("") || "<p>No significant KPI movements for this period.</p>"}
            </div>
            <div style="margin-top:28px;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
              <h2 style="margin:0 0 18px;font-size:20px;">What we focused on</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                ${focusItems.map(renderFocusItem).join("") || "<td>No logged focus items for this period.</td>"}
              </tr></table>
            </div>
          </td></tr>
          <tr><td style="padding:22px 36px;background:#f9fafb;color:#6b7280;font-size:14px;">Built for operators. Reply to this email with questions or feedback.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderApprovalPage(run, token) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;margin:0;background:#f3f4f6;">
    <div style="max-width:860px;margin:24px auto;background:#fff;padding:24px;border-radius:8px;">
      <h1>Review Report</h1>
      <p>Status: ${escapeHtml(run.status)} / Approval: ${escapeHtml(run.approval?.status)}</p>
      <form method="post" action="/report-approval/${escapeHtml(token)}/approve" style="display:inline;"><button style="padding:10px 16px;background:#16a34a;color:#fff;border:0;border-radius:6px;">Approve and Send</button></form>
      <form method="post" action="/report-approval/${escapeHtml(token)}/reject" style="display:inline;margin-left:8px;"><button style="padding:10px 16px;background:#dc2626;color:#fff;border:0;border-radius:6px;">Reject</button></form>
      <hr />${run.snapshot?.html || ""}
    </div>
  </body></html>`;
}

module.exports = { renderDigestEmail, renderApprovalPage };
