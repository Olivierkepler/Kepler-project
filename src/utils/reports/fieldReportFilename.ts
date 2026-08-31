import type { FieldReport } from "../domain/fieldReport";
import { formatLocalDateInput } from "../domain/fieldReport";

export function sanitizeReportFilenameSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inclusiveEndDateFromRange(endAt: string): string {
  return formatLocalDateInput(new Date(Date.parse(endAt) - 1));
}

export function buildFieldReportPdfFilename(report: FieldReport): string {
  const projectSegment =
    sanitizeReportFilenameSegment(report.projectName) || "Field-Report";
  const startDate = formatLocalDateInput(new Date(report.startAt));
  const endDate = inclusiveEndDateFromRange(report.endAt);

  if (startDate === endDate) {
    return `${projectSegment}-Field-Report-${startDate}.pdf`;
  }

  return `${projectSegment}-Field-Report-${startDate}-to-${endDate}.pdf`;
}
