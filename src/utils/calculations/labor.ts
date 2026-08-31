export function calculateLaborImpactHours(
  difference: number,
  laborHoursPerUnit: number,
): number | null {
  if (
    !Number.isFinite(laborHoursPerUnit) ||
    laborHoursPerUnit < 0
  ) {
    return null;
  }

  return difference * laborHoursPerUnit;
}
