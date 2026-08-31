export function formatFeedRelativeTime(
  iso: string,
): string {
  const timestamp =
    new Date(iso).getTime();

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const diffMs =
    Date.now() - timestamp;

  const minutes = Math.floor(
    diffMs / 60_000,
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(
    hours / 24,
  );

  if (days < 7) {
    return `${days}d`;
  }

  return new Date(iso).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  );
}

export function feedPostWasEdited(
  createdAt: string,
  updatedAt: string,
): boolean {
  if (!createdAt || !updatedAt) {
    return false;
  }

  return updatedAt.localeCompare(createdAt) > 0;
}

export function formatFeedEditedLabel(
  createdAt: string,
  updatedAt: string,
): string | null {
  if (!feedPostWasEdited(createdAt, updatedAt)) {
    return null;
  }

  const relative = formatFeedRelativeTime(updatedAt);
  return relative ? `Edited · ${relative}` : "Edited";
}
