const DASHBOARD_PAGE_NAME = "dashboard";
const DASHBOARD_LAYOUT_VERSION = 2;
const {
  DEFAULT_DESKTOP_KPI_LAYOUT,
  normalizeDesktopKpiLayout,
} = require("./dashboardKpiLayout");

const DEFAULT_DESKTOP_LAYOUT = Object.freeze([
  "kpi_cards",
  "kpi_trend",
  "payment_split",
  "payment_trend",
  "traffic_split",
]);

const DEFAULT_MOBILE_LAYOUT = Object.freeze([
  "kpi_cards",
  "kpi_trend",
  "top_pages",
  "payment_split",
  "payment_trend",
  "traffic_split",
]);

function uniqWidgetIds(input = []) {
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(input) ? input : []) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function normalizeViewportLayout(input, defaults) {
  const normalized = uniqWidgetIds(input);
  for (const widgetId of defaults) {
    if (!normalized.includes(widgetId)) {
      normalized.push(widgetId);
    }
  }
  return normalized;
}

function normalizeStoredLayout(layoutJson = {}) {
  const source = layoutJson && typeof layoutJson === "object" ? layoutJson : {};
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    desktop: normalizeViewportLayout(
      source.desktop,
      DEFAULT_DESKTOP_LAYOUT,
    ),
    mobile: normalizeViewportLayout(source.mobile, DEFAULT_MOBILE_LAYOUT),
    kpiCardsDesktop: normalizeDesktopKpiLayout(
      source.kpiCardsDesktop || source.kpi_cards_desktop || DEFAULT_DESKTOP_KPI_LAYOUT,
    ),
  };
}

function hasPermission(user, permission) {
  if (user?.isAuthor) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes("all") || permissions.includes(permission);
}

function getEditableWidgetIds(user) {
  const canSeePayments =
    hasPermission(user, "payment_split_order") ||
    hasPermission(user, "payment_split_sales");
  const canSeeTraffic = hasPermission(user, "traffic_split");
  const canSeeTopPages = hasPermission(user, "web_vitals");

  return {
    desktop: DEFAULT_DESKTOP_LAYOUT.filter((id) => {
      if (id === "payment_split" || id === "payment_trend") {
        return canSeePayments;
      }
      if (id === "traffic_split") return canSeeTraffic;
      return true;
    }),
    mobile: DEFAULT_MOBILE_LAYOUT.filter((id) => {
      if (id === "top_pages") return canSeeTopPages;
      if (id === "payment_split" || id === "payment_trend") {
        return canSeePayments;
      }
      if (id === "traffic_split") return canSeeTraffic;
      return true;
    }),
  };
}

function mergeVisibleOrder(existingLayout, submittedVisibleOrder, editableIds) {
  const editableSet = new Set(editableIds);
  const normalizedExisting = uniqWidgetIds(existingLayout);
  const currentEditable = normalizedExisting.filter((id) => editableSet.has(id));
  const submittedEditable = uniqWidgetIds(submittedVisibleOrder).filter((id) =>
    editableSet.has(id),
  );

  const nextEditable = [
    ...submittedEditable,
    ...currentEditable.filter((id) => !submittedEditable.includes(id)),
  ];

  let editableIndex = 0;
  const merged = normalizedExisting.map((id) => {
    if (!editableSet.has(id)) return id;
    const nextId = nextEditable[editableIndex];
    editableIndex += 1;
    return nextId;
  });

  for (const widgetId of nextEditable) {
    if (!merged.includes(widgetId)) {
      merged.push(widgetId);
    }
  }

  return merged;
}

function buildDashboardLayoutService({ model }) {
  return {
    async getLayoutForUser(userId) {
      const query = {
        userId: String(userId),
        pageName: DASHBOARD_PAGE_NAME,
      };
      const row = await model.findOne(query);
      const connection = model?.db || model?.collection?.conn;

      if (!row) {
        if (typeof model?.collection?.name === "string") {
          // Temporary trace for Mongo layout lookup visibility.
          console.log("[dashboard-layout] mongo get miss", {
            dbName: connection?.name,
            collection: model.collection.name,
            query,
          });
        }
        return normalizeStoredLayout();
      }

      if (typeof model?.collection?.name === "string") {
        console.log("[dashboard-layout] mongo get hit", {
          dbName: connection?.name,
          collection: model.collection.name,
          query,
        });
      }
      return normalizeStoredLayout(row.layoutJson);
    },

    async saveLayoutForUser(userId, user, payload = {}) {
      const query = {
        userId: String(userId),
        pageName: DASHBOARD_PAGE_NAME,
      };
      const existingRow = await model.findOne(query);
      const existingLayout = normalizeStoredLayout(existingRow?.layoutJson);
      const editable = getEditableWidgetIds(user);

      const nextLayout = {
        version: DASHBOARD_LAYOUT_VERSION,
        desktop: mergeVisibleOrder(
          existingLayout.desktop,
          payload.desktop,
          editable.desktop,
        ),
        mobile: mergeVisibleOrder(
          existingLayout.mobile,
          payload.mobile,
          editable.mobile,
        ),
        kpiCardsDesktop: normalizeDesktopKpiLayout(
          payload.kpiCardsDesktop || payload.kpi_cards_desktop || existingLayout.kpiCardsDesktop,
        ),
      };

      const normalizedNext = normalizeStoredLayout(nextLayout);

      const writeResult = await model.findOneAndUpdate(
        query,
        {
          $set: {
            layoutJson: normalizedNext,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
      const connection = model?.db || model?.collection?.conn;

      if (typeof model?.collection?.name === "string") {
        console.log("[dashboard-layout] mongo save", {
          dbName: connection?.name,
          collection: model.collection.name,
          query,
          hadExistingLayout: Boolean(existingRow),
          savedDesktopCount: normalizedNext.desktop.length,
          savedMobileCount: normalizedNext.mobile.length,
          documentId: writeResult?._id?.toString?.() || null,
        });
      }

      return normalizedNext;
    },
  };
}

module.exports = {
  DASHBOARD_PAGE_NAME,
  DASHBOARD_LAYOUT_VERSION,
  DEFAULT_DESKTOP_LAYOUT,
  DEFAULT_MOBILE_LAYOUT,
  uniqWidgetIds,
  normalizeViewportLayout,
  normalizeStoredLayout,
  getEditableWidgetIds,
  mergeVisibleOrder,
  buildDashboardLayoutService,
};
