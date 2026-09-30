import type { Measurement } from "../../types/measurement";
import type { PlanWorkPackageGroup } from "./planWorkPackageGroups";

/**
 * Filters already-authorized, already-filtered package groups by visible text.
 * Matching a package keeps its eligible items; matching an item keeps its
 * parent group so the item is never presented without its package context.
 */
export function searchPlanWorkPackageGroups(
  groups: readonly PlanWorkPackageGroup[],
  searchText: string,
  measurements: readonly Measurement[],
): PlanWorkPackageGroup[] {
  const query = searchText.trim().toLocaleLowerCase();
  if (!query) return [...groups];

  return groups.flatMap((group) => {
    if (group.title.toLocaleLowerCase().includes(query)) {
      return [group];
    }

    const matchingItems = group.items.filter((item) =>
      item.label.toLocaleLowerCase().includes(query),
    );
    if (matchingItems.length === 0) return [];

    const measuredCount = matchingItems.filter((item) =>
      measurements.some((measurement) => measurement.planItemId === item.id),
    ).length;

    return [{
      ...group,
      items: matchingItems,
      measuredCount,
      pendingCount: matchingItems.length - measuredCount,
    }];
  });
}
