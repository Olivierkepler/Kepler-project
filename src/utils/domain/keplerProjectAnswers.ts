import type { ProjectActivityItem } from "./projectActivity";
import type { ProjectProgressSummary } from "./projectProgressSummary";
import type { ProjectTodoItem } from "./projectTodos";
import type { RankedProjectVariance } from "./projectVarianceRanking";

export type KeplerPromptKind = "attention" | "progress" | "variance" | "activity";
export type KeplerDestination = "todo" | "workProgress" | "delta" | "project";

export type KeplerDeterministicResponse = {
  id: string;
  projectId: string;
  promptKind: KeplerPromptKind;
  prompt: string;
  title: string;
  summary: string;
  bullets: string[];
  ctaLabel: string;
  destination: KeplerDestination;
};

export const KEPLER_PROMPTS: ReadonlyArray<{
  kind: KeplerPromptKind;
  label: string;
}> = [
  { kind: "attention", label: "What needs my attention?" },
  { kind: "progress", label: "Review project progress" },
  { kind: "variance", label: "Explain the largest variance" },
  { kind: "activity", label: "Summarize recent activity" },
];

function response(
  projectId: string,
  kind: KeplerPromptKind,
  title: string,
  summary: string,
  bullets: string[],
  ctaLabel: string,
  destination: KeplerDestination,
): KeplerDeterministicResponse {
  const prompt = KEPLER_PROMPTS.find((item) => item.kind === kind)!.label;
  return {
    id: `${kind}:${projectId}`,
    projectId,
    promptKind: kind,
    prompt,
    title,
    summary,
    bullets,
    ctaLabel,
    destination,
  };
}

export function buildAttentionAnswer(
  projectId: string,
  todos: readonly ProjectTodoItem[],
): KeplerDeterministicResponse {
  const counts = {
    needs_correction: 0,
    ready_for_review: 0,
    awaiting_measurement: 0,
    needs_assignment: 0,
  };
  for (const item of todos) counts[item.kind] += 1;
  const labels: Record<keyof typeof counts, string> = {
    needs_correction: "Need correction",
    ready_for_review: "Ready for review",
    awaiting_measurement: "Need field measurement",
    needs_assignment: "Need assignment",
  };
  const bullets = (Object.keys(counts) as Array<keyof typeof counts>)
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${labels[kind]}`);
  return response(
    projectId,
    "attention",
    "Project To Do",
    todos.length === 0
      ? "No project items currently need attention."
      : `${todos.length} ${todos.length === 1 ? "item" : "items"} currently need attention.`,
    bullets,
    "Open To Do",
    "todo",
  );
}

function percent(value: number): string {
  return `${Number(value.toFixed(1))}%`;
}

export function buildProgressAnswer(
  projectId: string,
  summary: ProjectProgressSummary | null,
): KeplerDeterministicResponse {
  const bullets: string[] = [];
  let text = "Progress tracking is not available for this project.";
  if (summary) {
    const { currentActualPercent: actual, currentPlannedPercent: planned, variancePercent: variance } = summary;
    if (actual !== null) bullets.push(`Actual: ${percent(actual)}`);
    if (planned !== null) bullets.push(`Planned: ${percent(planned)}`);
    if (variance !== null) {
      const difference = Number(Math.abs(variance).toFixed(1));
      const direction = variance < 0 ? "below" : variance > 0 ? "above" : "matches";
      text = variance === 0
        ? "Actual progress matches planned progress."
        : `Actual progress is ${difference} percentage ${difference === 1 ? "point" : "points"} ${direction} planned.`;
      if (variance !== 0) bullets.push(`Variance: ${variance > 0 ? "+" : "-"}${difference} pts`);
    } else if (actual === null && planned === null) {
      text = "No current planned or actual progress values are available.";
    } else {
      text = "A current planned or actual progress value is unavailable.";
    }
  }
  return response(projectId, "progress", "Project progress", text, bullets, "Open Progress", "workProgress");
}

export function buildLargestVarianceAnswer(
  projectId: string,
  variances: readonly RankedProjectVariance[],
  planItemLabels: ReadonlyMap<string, string>,
  available = true,
): KeplerDeterministicResponse {
  const largest = [...variances].sort((a, b) =>
    Math.abs(b.percentDifference) - Math.abs(a.percentDifference) ||
    a.planItemId.localeCompare(b.planItemId),
  )[0];
  if (!available) {
    return response(projectId, "variance", "Largest recorded variance", "Variance data is not available for this project.", [], "Open Progress", "workProgress");
  }
  if (!largest) {
    return response(projectId, "variance", "Largest recorded variance", "No recorded variances are available for this project.", [], "Open Progress", "workProgress");
  }
  const signed = largest.difference > 0 ? "+" : "";
  return response(
    projectId,
    "variance",
    "Largest recorded variance",
    planItemLabels.get(largest.planItemId)?.trim() || "Plan item",
    [
      `Recorded difference: ${signed}${Number(largest.difference.toFixed(2))} ${largest.unit}`,
      `Variance: ${largest.percentDifference > 0 ? "+" : ""}${Number(largest.percentDifference.toFixed(1))}%`,
    ],
    "Open Progress",
    "workProgress",
  );
}

export type KeplerActivityFact = Pick<ProjectActivityItem, "id" | "occurredAt"> & { label: string };

export function buildRecentActivityAnswer(
  projectId: string,
  items: readonly KeplerActivityFact[],
  limit = 4,
): KeplerDeterministicResponse {
  const recent = [...items]
    .filter((item) => Number.isFinite(Date.parse(item.occurredAt)))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
  return response(
    projectId,
    "activity",
    "Recent activity",
    recent.length ? `${recent.length} recent ${recent.length === 1 ? "update" : "updates"}.` : "No recent project activity is available.",
    recent.map((item) => item.label),
    "Open Activity",
    "project",
  );
}
