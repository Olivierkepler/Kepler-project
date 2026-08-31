export function calculateScheduleImpactDays(
  difference: number,
  productionRatePerDay: number,
): number | null {
  if (
    !Number.isFinite(productionRatePerDay) ||
    productionRatePerDay <= 0
  ) {
    return null;
  }

  return difference / productionRatePerDay;
}
