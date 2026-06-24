function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTimestampExpression() {
  return {
    $ifNull: [
      "$startDate",
      {
        $ifNull: ["$startedAt", "$createdAt"],
      },
    ],
  };
}

function buildScopedMatch({ scope = {}, filters = {} }) {
  const clauses = [];
  const timestampExpr = buildTimestampExpression();

  if (!scope.includeAdmins) {
    clauses.push({ isAdmin: { $ne: true } });
  }

  if (Array.isArray(scope.allowedBrands) && scope.allowedBrands.length > 0) {
    clauses.push({ brand: { $in: scope.allowedBrands } });
  }

  if (filters.from || filters.to) {
    const timestampRange = {};
    if (filters.from) timestampRange.$gte = filters.from;
    if (filters.to) timestampRange.$lte = filters.to;
    clauses.push({
      $expr: {
        $and: Object.entries(timestampRange).map(([op, value]) => ({
          [op]: [timestampExpr, value],
        })),
      },
    });
  }

  if (filters.brand) {
    clauses.push({ brand: filters.brand });
  }

  if (filters.user) {
    clauses.push({
      $or: [
        { userId: filters.user },
        { email: filters.user.toLowerCase() },
      ],
    });
  }

  if (filters.search) {
    const pattern = String(filters.search).trim();
    if (pattern) {
      const safePattern = escapeRegex(pattern);
      clauses.push({
        $or: [
          { email: { $regex: safePattern, $options: "i" } },
          { brand: { $regex: safePattern, $options: "i" } },
          { platform: { $regex: safePattern, $options: "i" } },
        ],
      });
    }
  }

  return clauses.length > 0 ? { $and: clauses } : {};
}

function buildBaseProjection() {
  return {
    timestamp: buildTimestampExpression(),
    email: { $toLower: { $ifNull: ["$email", ""] } },
    userId: { $ifNull: ["$userId", ""] },
    brand: { $ifNull: ["$brand", ""] },
    platform: { $ifNull: ["$platform", ""] },
    isAdmin: { $ifNull: ["$isAdmin", false] },
    sessionId: { $ifNull: ["$sessionId", ""] },
  };
}

function getHourLabelParts(date) {
  return {
    year: { $year: date },
    month: { $month: date },
    day: { $dayOfMonth: date },
    hour: { $hour: date },
  };
}

function getDateLabelExpression(date) {
  return {
    $dateToString: {
      format: "%Y-%m-%d",
      date,
      timezone: "UTC",
    },
  };
}

function buildSessionAnalyticsRepository({ collection }) {
  async function getSummary({ scope, filters }) {
    const pipeline = [
      { $match: buildScopedMatch({ scope, filters }) },
      {
        $project: {
          ...buildBaseProjection(),
        },
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" },
          activeBrands: { $addToSet: "$brand" },
        },
      },
      {
        $project: {
          _id: 0,
          totalSessions: 1,
          uniqueUsers: { $size: "$uniqueUsers" },
          activeBrands: {
            $size: {
              $filter: {
                input: "$activeBrands",
                as: "brand",
                cond: { $ne: ["$$brand", ""] },
              },
            },
          },
        },
      },
    ];

    const [row] = await collection.aggregate(pipeline).toArray();
    const totalSessions = Number(row?.totalSessions || 0);
    const uniqueUsers = Number(row?.uniqueUsers || 0);
    const activeBrands = Number(row?.activeBrands || 0);

    return {
      totalSessions,
      uniqueUsers,
      sessionsPerUser:
        uniqueUsers > 0 ? Number((totalSessions / uniqueUsers).toFixed(2)) : 0,
      activeBrands,
    };
  }

  async function getTrend({ scope, filters, granularity }) {
    const timestampExpr = buildTimestampExpression();
    const isHourly = granularity === "hourly";
    const groupId = isHourly
      ? getHourLabelParts(timestampExpr)
      : { label: getDateLabelExpression(timestampExpr) };

    const pipeline = [
      { $match: buildScopedMatch({ scope, filters }) },
      {
        $project: {
          timestamp: timestampExpr,
        },
      },
      { $match: { timestamp: { $ne: null } } },
      {
        $group: {
          _id: groupId,
          sessions: { $sum: 1 },
        },
      },
      {
        $project: isHourly
          ? {
              _id: 0,
              sortKey: [
                "$_id.year",
                "$_id.month",
                "$_id.day",
                "$_id.hour",
              ],
              label: {
                $concat: [
                  {
                    $cond: [
                      { $lt: ["$_id.hour", 10] },
                      { $concat: ["0", { $toString: "$_id.hour" }] },
                      { $toString: "$_id.hour" },
                    ],
                  },
                  ":00",
                ],
              },
              sessions: 1,
            }
          : {
              _id: 0,
              sortKey: "$_id.label",
              label: "$_id.label",
              sessions: 1,
            },
      },
      { $sort: { sortKey: 1 } },
    ];

    const rows = await collection.aggregate(pipeline).toArray();
    return rows.map((row) => ({
      label: row.label,
      sessions: Number(row.sessions || 0),
    }));
  }

  async function getBrandRows({ scope, filters }) {
    const pipeline = [
      { $match: buildScopedMatch({ scope, filters }) },
      {
        $project: {
          ...buildBaseProjection(),
        },
      },
      {
        $group: {
          _id: "$brand",
          sessions: { $sum: 1 },
          users: { $addToSet: "$userId" },
        },
      },
      {
        $project: {
          _id: 0,
          brand: "$_id",
          sessions: 1,
          users: { $size: "$users" },
        },
      },
      { $sort: { sessions: -1, brand: 1 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }

  async function getUserRows({ scope, filters, page, limit, sort, direction }) {
    const sortDirection = direction === "asc" ? 1 : -1;
    const sortMap = {
      email: { email: sortDirection },
      brand: { brand: sortDirection, email: 1 },
      sessions: { sessions: sortDirection, email: 1 },
      lastActive: { lastActive: sortDirection, email: 1 },
      firstSeen: { firstSeen: sortDirection, email: 1 },
      platform: { platform: sortDirection, email: 1 },
    };
    const sortStage = sortMap[sort] || sortMap.sessions;

    const pipeline = [
      { $match: buildScopedMatch({ scope, filters }) },
      {
        $project: {
          ...buildBaseProjection(),
        },
      },
      {
        $group: {
          _id: {
            email: "$email",
            brand: "$brand",
          },
          sessions: { $sum: 1 },
          lastActive: { $max: "$timestamp" },
          firstSeen: { $min: "$timestamp" },
          platform: { $last: "$platform" },
        },
      },
      {
        $project: {
          _id: 0,
          email: "$_id.email",
          brand: "$_id.brand",
          sessions: 1,
          lastActive: 1,
          firstSeen: 1,
          platform: 1,
        },
      },
      {
        $facet: {
          rows: [
            { $sort: sortStage },
            { $skip: Math.max(0, (page - 1) * limit) },
            { $limit: limit },
          ],
          total: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await collection.aggregate(pipeline).toArray();
    return {
      rows: Array.isArray(result?.rows) ? result.rows : [],
      total: Number(result?.total?.[0]?.count || 0),
    };
  }

  async function getInsights({ scope, filters }) {
    const match = buildScopedMatch({ scope, filters });
    const project = {
      ...buildBaseProjection(),
    };

    const [mostActiveUser] = await collection
      .aggregate([
        { $match: match },
        { $project: project },
        {
          $group: {
            _id: "$email",
            sessions: { $sum: 1 },
          },
        },
        { $sort: { sessions: -1, _id: 1 } },
        { $limit: 1 },
        {
          $project: {
            _id: 0,
            email: "$_id",
            sessionCount: "$sessions",
          },
        },
      ])
      .toArray();

    const [mostActiveBrand] = await collection
      .aggregate([
        { $match: match },
        { $project: project },
        {
          $group: {
            _id: "$brand",
            sessions: { $sum: 1 },
          },
        },
        { $sort: { sessions: -1, _id: 1 } },
        { $limit: 1 },
        {
          $project: {
            _id: 0,
            brand: "$_id",
            sessionCount: "$sessions",
          },
        },
      ])
      .toArray();

    const [latestSession] = await collection
      .aggregate([
        { $match: match },
        { $project: project },
        { $sort: { timestamp: -1 } },
        { $limit: 1 },
        {
          $project: {
            _id: 0,
            email: 1,
            brand: 1,
            timestamp: 1,
          },
        },
      ])
      .toArray();

    return {
      mostActiveUser: mostActiveUser || {},
      mostActiveBrand: mostActiveBrand || {},
      latestSession: latestSession || {},
    };
  }

  async function getFilters({ scope, filters }) {
    const match = buildScopedMatch({ scope, filters });
    const [result] = await collection
      .aggregate([
        { $match: match },
        {
          $project: {
            ...buildBaseProjection(),
          },
        },
        {
          $group: {
            _id: null,
            brands: { $addToSet: "$brand" },
            users: { $addToSet: "$email" },
          },
        },
        {
          $project: {
            _id: 0,
            brands: 1,
            users: 1,
          },
        },
      ])
      .toArray();

    return {
      brands: Array.isArray(result?.brands)
        ? result.brands.filter(Boolean).sort()
        : [],
      users: Array.isArray(result?.users)
        ? result.users.filter(Boolean).sort()
        : [],
    };
  }

  async function getBrandExportCsv({ scope, filters }) {
    const rows = await getBrandRows({ scope, filters });
    const headers = ["brand", "sessions", "users"];
    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push([
        escapeCsv(row.brand),
        Number(row.sessions || 0),
        Number(row.users || 0),
      ].join(","));
    }
    return lines.join("\n");
  }

  async function getUserExportCsv({ scope, filters, sort, direction }) {
    const result = await getUserRows({
      scope,
      filters,
      page: 1,
      limit: 5000,
      sort,
      direction,
    });

    const headers = ["email", "brand", "sessions", "lastActive", "firstSeen", "platform"];
    const lines = [headers.join(",")];
    for (const row of result.rows) {
      lines.push([
        escapeCsv(row.email),
        escapeCsv(row.brand),
        Number(row.sessions || 0),
        row.lastActive ? new Date(row.lastActive).toISOString() : "",
        row.firstSeen ? new Date(row.firstSeen).toISOString() : "",
        escapeCsv(row.platform),
      ].join(","));
    }
    return lines.join("\n");
  }

  return {
    getSummary,
    getTrend,
    getBrandRows,
    getUserRows,
    getInsights,
    getFilters,
    getBrandExportCsv,
    getUserExportCsv,
  };
}

module.exports = {
  buildSessionAnalyticsRepository,
};
