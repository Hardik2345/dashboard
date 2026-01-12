export function validateFilter(newFilter, currentFilters) {
    // 1. Simulate the state after adding/replacing the filter
    const simulation = [...currentFilters];
    const existingIdx = simulation.findIndex(
        f => f.field === newFilter.field && f.operator === newFilter.operator
    );

    if (existingIdx !== -1) {
        simulation.splice(existingIdx, 1, newFilter);
    } else {
        simulation.push(newFilter);
    }

    // 2. Parse ranges for all involved fields through intersection
    // Initial ranges: [0, Infinity] for all metrics
    const ranges = {
        orders: { min: 0, max: Infinity },
        sessions: { min: 0, max: Infinity },
        atc: { min: 0, max: Infinity },
        sales: { min: 0, max: Infinity },
        cvr: { min: 0, max: 100 }, // CVR is 0-100%
    };

    for (const f of simulation) {
        if (!ranges[f.field]) continue; // Skip non-metric fields if any
        const val = Number(f.value);

        if (f.operator === 'gt') {
            // > X implies range (X, Infinity]. We use strict inequality logic.
            // Ideally min should be > X. For integer checks we might say min = X + 1?
            // Let's stick to continuous logic: min = max(min, val)
            // But strictly, > 40 means min is effectively 40 (exclusive).
            // If we have > 40 and < 40: min=40 (excl), max=40 (excl) -> Empty.
            ranges[f.field].min = Math.max(ranges[f.field].min, val);
            // Mark strictness if needed, but simple float comparison is usually enough for "impossible" checks
        } else if (f.operator === 'lt') {
            ranges[f.field].max = Math.min(ranges[f.field].max, val);
        }
    }

    // 3. Check for direct range contradictions (Min >= Max)
    // Strictly, if operator is exclusive (> / <), Min == Max is also invalid (e.g. >40 and <40).
    for (const key in ranges) {
        if (ranges[key].min >= ranges[key].max) {
            return { valid: false, message: `Invalid Range: '${key}' cannot be both > ${ranges[key].min} and < ${ranges[key].max}.` };
        }
    }

    // 4. Check cross-field logical constraints

    // Constraint A: Orders <= Sessions
    if (ranges.orders.min >= ranges.sessions.max) {
        return { valid: false, message: `Invalid Logic: Orders cannot exceed Sessions.` };
    }

    // Constraint B: ATC <= Sessions
    if (ranges.atc.min >= ranges.sessions.max) {
        return { valid: false, message: `Invalid Logic: ATC Sessions cannot exceed Sessions.` };
    }

    // Constraint C: CVR Consistency
    // Formula: CVR = (Orders / Sessions) * 100
    // Derived constraints on CVR based on O and S ranges:

    const safeMinSessions = Math.max(1, ranges.sessions.min);

    // Max CVR Check
    if (ranges.orders.max !== Infinity && ranges.sessions.min !== 0) {
        const theoreticalMaxCVR = (100 * ranges.orders.max) / safeMinSessions;
        if (ranges.cvr.min > theoreticalMaxCVR) {
            return { valid: false, message: `Invalid Logic: CVR cannot be > ${ranges.cvr.min}% given current Order & Session filters.` };
        }
    }

    // Min CVR Check
    if (ranges.sessions.max !== Infinity && ranges.orders.min > 0) {
        const theoreticalMinCVR = (100 * ranges.orders.min) / ranges.sessions.max;
        if (ranges.cvr.max < theoreticalMinCVR) {
            return { valid: false, message: `Invalid Logic: CVR cannot be < ${ranges.cvr.max}% given current Order & Session filters.` };
        }
    }

    return { valid: true };
}
