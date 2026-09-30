export type ActivityTimelineCategory =
  | "all"
  | "assignments"
  | "measurements"
  | "evidence"
  | "variances"
  | "agent"
  | "project"
  | "other";

export type ActivityTimelineRecord = {
  id: string;
  occurredAt: string;
  category: Exclude<ActivityTimelineCategory, "all">;
  searchableText: string;
};

export type ActivityTimelineGroup<T extends ActivityTimelineRecord> = {
  key: string;
  title: string;
  items: T[];
};

export function activityCategoryForEventType(type: string): Exclude<ActivityTimelineCategory, "all"> {
  if (type.startsWith("assignment_") || type.startsWith("team_assignment_")) return "assignments";
  if (type.startsWith("measurement_")) return "measurements";
  if (type === "evidence_created") return "evidence";
  if (type === "delta_created") return "variances";
  if (type.startsWith("agent_")) return "agent";
  if (type.startsWith("invitation_") || type === "member_removed" || type.startsWith("feed_post_")) return "project";
  return "other";
}

export function matchesActivitySearch<T extends ActivityTimelineRecord>(
  record: T,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || record.searchableText.toLocaleLowerCase().includes(normalized);
}

export function filterActivityTimeline<T extends ActivityTimelineRecord>(input: {
  records: readonly T[];
  category: ActivityTimelineCategory;
  query: string;
}): T[] {
  return input.records.filter((record) =>
    (input.category === "all" || record.category === input.category) &&
    matchesActivitySearch(record, input.query),
  );
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayOffset(date: Date, now: Date): number {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - day) / 86_400_000);
}

function dateGroupTitle(date: Date, now: Date): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
}

export function groupActivityTimeline<T extends ActivityTimelineRecord>(
  records: readonly T[],
  now = new Date(),
): ActivityTimelineGroup<T>[] {
  const sorted = [...records].sort((a, b) => {
    const aTime = Date.parse(a.occurredAt);
    const bTime = Date.parse(b.occurredAt);
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && aTime !== bTime) return bTime - aTime;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const groups: ActivityTimelineGroup<T>[] = [];
  const byKey = new Map<string, ActivityTimelineGroup<T>>();

  for (const record of sorted) {
    const parsed = new Date(record.occurredAt);
    const valid = Number.isFinite(parsed.getTime());
    const key = valid ? localDateKey(parsed) : "invalid-date";
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        title: valid ? dateGroupTitle(parsed, now) : "Date unavailable",
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(record);
  }

  return groups;
}
