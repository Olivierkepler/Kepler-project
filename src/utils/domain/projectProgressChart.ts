import type { ProjectProgressSeries } from "../../types/projectProgress";

export type ProjectProgressChartPoint = {
  id: string;
  date: string;
  label: string;
  x: number;
  percent: number;
};

export type ProjectProgressChartTick = {
  date: string;
  label: string;
  x: number;
};

export type ProjectProgressChartData = {
  baseline: ProjectProgressChartPoint[];
  actual: ProjectProgressChartPoint[];
  ticks: ProjectProgressChartTick[];
  minX: number | null;
  maxX: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TICK_LABELS = 5;

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dateOrdinal(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function shortDateLabel(date: string, includeYear = false): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
}

function actualCalendarDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function actualDayFraction(timestamp: number, date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day).getTime();
  const nextStart = new Date(year, month - 1, day + 1).getTime();
  const dayLength = nextStart - start;
  return dayLength > 0 ? (timestamp - start) / dayLength : 0;
}

function makeTicks(dates: string[]): ProjectProgressChartTick[] {
  if (dates.length === 0) return [];
  const includeYear = new Set(dates.map((date) => date.slice(0, 4))).size > 1;
  const selectedIndexes = new Set<number>();
  if (dates.length <= MAX_TICK_LABELS) {
    dates.forEach((_, index) => selectedIndexes.add(index));
  } else {
    for (let tick = 0; tick < MAX_TICK_LABELS; tick += 1) {
      selectedIndexes.add(
        Math.round((tick * (dates.length - 1)) / (MAX_TICK_LABELS - 1)),
      );
    }
  }

  return [...selectedIndexes].sort((a, b) => a - b).map((index) => {
    const date = dates[index];
    return {
      date,
      label: shortDateLabel(date, includeYear),
      x: dateOrdinal(date) + 0.5,
    };
  });
}

/**
 * Prepare stored project progress records for plotting. Calendar dates use
 * local-day buckets on the x-axis; actual timestamps retain their within-day
 * chronological position so same-day snapshots are not collapsed. No points
 * are added, removed, averaged, or interpolated.
 */
export function buildProjectProgressChartData(
  series: ProjectProgressSeries,
): ProjectProgressChartData {
  const baseline = series.baseline
    .filter(
      (point) =>
        isValidDateOnly(point.effectiveDate) &&
        Number.isFinite(point.plannedPercent) &&
        point.plannedPercent >= 0 &&
        point.plannedPercent <= 100,
    )
    .map((point) => ({
      id: point.id,
      date: point.effectiveDate,
      label: shortDateLabel(point.effectiveDate),
      x: dateOrdinal(point.effectiveDate) + 0.5,
      percent: point.plannedPercent,
    }))
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));

  const actual = series.actual
    .map((snapshot) => {
      const timestamp = Date.parse(snapshot.capturedAt);
      if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(snapshot.actualPercent) ||
        snapshot.actualPercent < 0 ||
        snapshot.actualPercent > 100
      ) {
        return null;
      }
      const date = actualCalendarDate(timestamp);
      return {
        id: snapshot.id,
        date,
        label: shortDateLabel(date),
        x: dateOrdinal(date) + actualDayFraction(timestamp, date),
        percent: snapshot.actualPercent,
        timestamp,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .map(({ timestamp: _timestamp, ...point }) => point);

  const allDates = [...new Set([
    ...baseline.map((point) => point.date),
    ...actual.map((point) => point.date),
  ])].sort();
  const ordinals = allDates.map(dateOrdinal);

  return {
    baseline,
    actual,
    ticks: makeTicks(allDates),
    minX: ordinals.length ? ordinals[0] : null,
    // One day after the last calendar-date bucket keeps first/last-day points
    // inside the plotting area, including a single-date series.
    maxX: ordinals.length ? ordinals[ordinals.length - 1] + 1 : null,
  };
}
