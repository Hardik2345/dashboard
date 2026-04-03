import dayjs from "dayjs";

export function isRangeOver30DaysInclusive(start, end) {
  if (!start || !end) return false;
  const s = dayjs(start);
  const e = dayjs(end);
  if (!s.isValid() || !e.isValid()) return false;
  return e.startOf("day").diff(s.startOf("day"), "day") + 1 > 30;
}
