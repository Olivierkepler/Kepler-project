export function calculateDifference(
  plannedValue: number,
  actualValue: number,
): number {
  return actualValue - plannedValue;
}

export function calculatePercentDifference(
  plannedValue: number,
  actualValue: number,
): number | null {
  if (plannedValue === 0) {
    return null;
  }

  return ((actualValue - plannedValue) / plannedValue) * 100;
}
