import type {
  ProjectProgressSeries,
} from "../../types/projectProgress";

export type ProjectProgressSummary = {
  currentPlannedPercent: number | null;
  currentActualPercent: number | null;
  variancePercent: number | null;
};

/** Returns today's calendar date in the device's local timezone. */
export function localCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidCalendarDate(value: string): boolean {
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

/**
 * Selects the latest actual snapshot and the latest baseline effective today.
 * Baseline dates are date-only calendar values, compared to the caller's
 * local calendar date; actual captures are timestamp values compared by epoch.
 * No interpolation or zero-value defaults are applied.
 */
export function summarizeProjectProgress(
  series: ProjectProgressSeries,
  today = localCalendarDate(),
): ProjectProgressSummary {
  const baseline = series.baseline
    .filter(
      (point) =>
        isValidCalendarDate(point.effectiveDate) &&
        point.effectiveDate <= today &&
        Number.isFinite(point.plannedPercent) &&
        point.plannedPercent >= 0 &&
        point.plannedPercent <= 100,
    )
    .reduce<typeof series.baseline[number] | null>(
      (latest, point) =>
        !latest || point.effectiveDate > latest.effectiveDate
          ? point
          : latest,
      null,
    );

  const actual = series.actual
    .filter(
      (snapshot) =>
        Number.isFinite(Date.parse(snapshot.capturedAt)) &&
        Number.isFinite(snapshot.actualPercent) &&
        snapshot.actualPercent >= 0 &&
        snapshot.actualPercent <= 100,
    )
    .reduce<typeof series.actual[number] | null>(
      (latest, snapshot) =>
        !latest ||
        Date.parse(snapshot.capturedAt) > Date.parse(latest.capturedAt)
          ? snapshot
          : latest,
      null,
    );

  const currentPlannedPercent = baseline?.plannedPercent ?? null;
  const currentActualPercent = actual?.actualPercent ?? null;

  return {
    currentPlannedPercent,
    currentActualPercent,
    variancePercent:
      currentPlannedPercent === null || currentActualPercent === null
        ? null
        : currentActualPercent - currentPlannedPercent,
  };
}
