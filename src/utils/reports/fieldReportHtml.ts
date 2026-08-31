import type {
  FieldReport,
  FieldReportDeltaRow,
  FieldReportEvidenceContext,
} from "../domain/fieldReport";
import { escapeHtml } from "../html";

export type FieldReportImageSources = ReadonlyMap<string, string | null>;

const PHOTO_UNAVAILABLE = "Photo unavailable on this device.";

function formatSignedCurrency(value: number): string {
  if (value === 0) {
    return "$0.00";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatSignedHours(value: number): string {
  if (value === 0) {
    return "0.00 hr";
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)} hr`;
}

function formatSignedDays(value: number): string {
  const absolute = Math.abs(value).toFixed(2);
  const unitLabel = Math.abs(value) === 1 ? "day" : "days";

  if (value === 0) {
    return `0.00 ${unitLabel}`;
  }

  const sign = value > 0 ? "+" : "-";
  return `${sign}${absolute} ${unitLabel}`;
}

function formatSignedValue(value: number, unit: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit}`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function evidenceContextLabel(context: FieldReportEvidenceContext): string {
  switch (context) {
    case "measurement":
      return "Measurement evidence";
    case "delta":
      return "Delta evidence";
    default:
      return "Project evidence";
  }
}

function dispositionStatusLabel(status: FieldReportDeltaRow["status"]): string {
  return status.toUpperCase();
}

function dispositionTimestampLabel(delta: FieldReportDeltaRow): string | null {
  if (!delta.disposedAt || delta.status === "open") {
    return null;
  }

  const prefix =
    delta.status === "accepted"
      ? "Accepted"
      : delta.status === "rejected"
        ? "Rejected"
        : delta.status === "resolved"
          ? "Resolved"
          : null;

  if (!prefix) {
    return null;
  }

  return `${prefix} ${formatDateTime(delta.disposedAt)}`;
}

function renderPhoto(
  evidenceId: string,
  imageSources: FieldReportImageSources,
): string {
  const dataUri = imageSources.get(evidenceId);

  if (!dataUri) {
    return `<p class="photo-placeholder">${escapeHtml(PHOTO_UNAVAILABLE)}</p>`;
  }

  return `<img class="evidence-photo" src="${dataUri}" alt="" />`;
}

function renderDeltaCard(delta: FieldReportDeltaRow): string {
  const dispositionLine = dispositionTimestampLabel(delta);
  const periodNote = delta.dispositionOccurredInPeriod
    ? " · updated in this period"
    : "";

  return `
    <div class="card item-card delta-card">
      <div class="item-title">${escapeHtml(delta.label)}</div>
      <div class="item-line">Planned ${delta.plannedValue.toFixed(2)} ${escapeHtml(delta.unit)}</div>
      <div class="item-line">Field ${delta.actualValue.toFixed(2)} ${escapeHtml(delta.unit)}</div>
      <div class="item-line">Difference ${escapeHtml(formatSignedValue(delta.difference, delta.unit))}</div>
      <div class="item-line">Percent ${escapeHtml(formatSignedPercent(delta.percentDifference))}</div>
      <div class="item-line">Recorded cost impact ${escapeHtml(formatSignedCurrency(delta.costImpact))}</div>
      <div class="item-line">Recorded labor impact ${escapeHtml(formatSignedHours(delta.laborImpactHours))}</div>
      <div class="item-line">Recorded schedule variance ${escapeHtml(formatSignedDays(delta.scheduleImpactDays))}</div>
      <div class="item-meta">Current disposition: ${escapeHtml(dispositionStatusLabel(delta.status))}${escapeHtml(periodNote)}</div>
      ${
        dispositionLine
          ? `<div class="item-meta">${escapeHtml(dispositionLine)}</div>`
          : ""
      }
      <div class="item-meta">Documented ${escapeHtml(formatDateTime(delta.createdAt))}</div>
    </div>
  `;
}

export function buildFieldReportHtml(
  report: FieldReport,
  imageSources: FieldReportImageSources = new Map(),
): string {
  const locationBlock =
    report.projectLocation.trim().length > 0
      ? `<div class="meta-line">${escapeHtml(report.projectLocation)}</div>`
      : "";

  const emptyBanner = !report.hasPeriodActivity
    ? `<p class="empty-banner">No documented field activity for this reporting period.</p>`
    : "";

  const projectIntelligence = report.projectIntelligence;
  const recentVariancesSection =
    projectIntelligence.recentVariances.length === 0
      ? `<p class="empty-text">No field variances recorded yet.</p>`
      : projectIntelligence.recentVariances
          .map(
            (item) => `
          <div class="card item-card">
            <div class="item-title">${escapeHtml(item.label)}</div>
            <div class="item-line">Recorded field quantity ${item.recordedFieldQuantity.toFixed(2)} ${escapeHtml(item.unit)}</div>
            <div class="item-line">Difference ${escapeHtml(formatSignedValue(item.difference, item.unit))}</div>
            <div class="item-meta">Status: ${escapeHtml(dispositionStatusLabel(item.status))}${item.dispositionReason.trim().length > 0 ? ` · ${escapeHtml(item.dispositionReason)}` : ""}</div>
          </div>
        `,
          )
          .join("");

  const measurementsSection =
    report.measurements.length === 0
      ? `<p class="empty-text">No measurements recorded during this period.</p>`
      : report.measurements
          .map(
            (item) => `
          <div class="card item-card">
            <div class="item-title">${escapeHtml(item.label)}</div>
            <div class="item-line">${item.value.toFixed(2)} ${escapeHtml(item.unit)}</div>
            <div class="item-meta">Recorded ${escapeHtml(formatDateTime(item.createdAt))}</div>
          </div>
        `,
          )
          .join("");

  const deltasSection =
    report.deltasDocumented.length === 0
      ? `<p class="empty-text">No deltas documented during this period.</p>`
      : report.deltasDocumented.map(renderDeltaCard).join("");

  const openSection =
    report.openFieldDifferences.length === 0
      ? `<p class="empty-text">No open field differences from this period.</p>`
      : report.openFieldDifferences
          .map(
            (item) => `
          <div class="card item-card">
            <div class="item-title">${escapeHtml(item.label)}</div>
            <div class="item-line">${escapeHtml(formatSignedValue(item.difference, item.unit))}</div>
            <div class="item-line">Recorded cost impact ${escapeHtml(formatSignedCurrency(item.costImpact))}</div>
          </div>
        `,
          )
          .join("");

  const evidenceSection =
    report.evidence.length === 0
      ? `<p class="empty-text">No evidence added during this period.</p>`
      : report.evidence
          .map((item) => {
            const noteBlock =
              item.note.trim().length > 0
                ? `<div class="item-line">${escapeHtml(item.note)}</div>`
                : "";
            const photoBlock =
              item.type === "photo"
                ? renderPhoto(item.id, imageSources)
                : "";

            return `
          <div class="card item-card evidence-card">
            <div class="evidence-meta">
              <div class="item-eyebrow">${item.type === "photo" ? "PHOTO" : "NOTE"} · ${escapeHtml(evidenceContextLabel(item.context))}</div>
              <div class="item-title">${escapeHtml(item.relatedLabel)}</div>
              ${noteBlock}
            </div>
            ${photoBlock}
            <div class="item-meta">${escapeHtml(formatDateTime(item.createdAt))}</div>
          </div>
        `;
          })
          .join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      @page {
        size: Letter;
        margin: 48px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #1a1a1a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.45;
      }

      .eyebrow {
        color: #f4a623;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.4px;
        text-transform: uppercase;
      }

      .title {
        font-size: 24px;
        font-weight: 800;
        margin-top: 8px;
      }

      .meta-line {
        color: #4b5563;
        margin-top: 6px;
      }

      .empty-banner,
      .empty-text {
        color: #6b7280;
      }

      .section-title {
        margin-top: 24px;
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1.2px;
        color: #111827;
        break-after: avoid;
        page-break-after: avoid;
      }

      .section-hint {
        margin: 0 0 10px;
        color: #6b7280;
        font-size: 11px;
        break-after: avoid;
        page-break-after: avoid;
      }

      .card {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: #ffffff;
      }

      .summary-card {
        padding: 4px 14px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #e5e7eb;
      }

      .row:last-child {
        border-bottom: 0;
      }

      .row-label {
        color: #4b5563;
        font-weight: 700;
      }

      .row-value {
        font-weight: 800;
        text-align: right;
      }

      .row-secondary {
        color: #6b7280;
        font-size: 11px;
        margin-top: 4px;
      }

      .item-card {
        padding: 14px;
        margin-bottom: 10px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .delta-card {
        break-inside: auto;
        page-break-inside: auto;
      }

      .item-card.evidence-card {
        break-inside: auto;
        page-break-inside: auto;
      }

      .evidence-meta {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .item-eyebrow {
        color: #f4a623;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.8px;
        margin-bottom: 6px;
      }

      .item-title {
        font-size: 15px;
        font-weight: 800;
      }

      .item-line {
        margin-top: 6px;
        color: #374151;
      }

      .item-meta {
        margin-top: 6px;
        color: #6b7280;
        font-size: 12px;
      }

      .evidence-photo {
        display: block;
        width: 100%;
        max-height: 280px;
        object-fit: contain;
        margin-top: 10px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        break-inside: auto;
        page-break-inside: auto;
      }

      .photo-placeholder {
        margin-top: 10px;
        padding: 16px;
        border: 1px dashed #d1d5db;
        border-radius: 8px;
        color: #6b7280;
        text-align: center;
        break-inside: auto;
        page-break-inside: auto;
      }

      .footer {
        margin-top: 28px;
        padding-top: 16px;
        border-top: 1px solid #e5e7eb;
        color: #6b7280;
        font-size: 11px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="eyebrow">BUILDSIGMA</div>
    <div class="title">FIELD REPORT</div>
    <div class="title">${escapeHtml(report.projectName)}</div>
    ${locationBlock}
    <div class="meta-line">Reporting period: ${escapeHtml(report.periodLabel)}</div>
    <div class="meta-line">Generated: ${escapeHtml(formatDateTime(report.generatedAt))}</div>
    ${emptyBanner}

    <div class="section-title">PROJECT FIELD INTELLIGENCE</div>
    <p class="section-hint">Read-only aggregation from authoritative Delta records across the project.</p>
    <div class="card summary-card">
      <div class="row">
        <div class="row-label">Total variances</div>
        <div class="row-value">${projectIntelligence.totalVariances}</div>
      </div>
      <div class="row">
        <div class="row-label">Open</div>
        <div class="row-value">${projectIntelligence.disposition.open}</div>
      </div>
      <div class="row">
        <div class="row-label">Accepted</div>
        <div class="row-value">${projectIntelligence.disposition.accepted}</div>
      </div>
      <div class="row">
        <div class="row-label">Rejected</div>
        <div class="row-value">${projectIntelligence.disposition.rejected}</div>
      </div>
      <div class="row">
        <div class="row-label">Resolved</div>
        <div class="row-value">${projectIntelligence.disposition.resolved}</div>
      </div>
      <div class="row">
        <div class="row-label">Documented cost impact</div>
        <div class="row-value">${escapeHtml(formatSignedCurrency(projectIntelligence.documentedImpact.costImpact))}</div>
      </div>
      <div class="row">
        <div class="row-label">Documented labor impact</div>
        <div class="row-value">${escapeHtml(formatSignedHours(projectIntelligence.documentedImpact.laborImpactHours))}</div>
      </div>
      <div class="row">
        <div>
          <div class="row-label">Largest recorded schedule variance</div>
          <div class="row-secondary">${projectIntelligence.documentedImpact.deltasWithScheduleImpact} delta${projectIntelligence.documentedImpact.deltasWithScheduleImpact === 1 ? "" : "s"} with schedule impact</div>
        </div>
        <div class="row-value">${escapeHtml(formatSignedDays(projectIntelligence.documentedImpact.largestRecordedVarianceDays))}</div>
      </div>
    </div>

    <div class="section-title">RECENT VARIANCES</div>
    ${recentVariancesSection}

    <div class="section-title">ACTIVITY SUMMARY</div>
    <div class="card summary-card">
      <div class="row">
        <div class="row-label">Measurements recorded</div>
        <div class="row-value">${report.activity.measurements}</div>
      </div>
      <div class="row">
        <div class="row-label">Deltas documented</div>
        <div class="row-value">${report.activity.deltas}</div>
      </div>
      <div class="row">
        <div class="row-label">Evidence added</div>
        <div class="row-value">${report.activity.evidence}</div>
      </div>
    </div>

    <div class="section-title">MEASUREMENTS RECORDED</div>
    ${measurementsSection}

    <div class="section-title">DELTAS DOCUMENTED</div>
    <p class="section-hint">Documented during this reporting period. Disposition shown is current.</p>
    ${deltasSection}

    <div class="section-title">OPEN FIELD DIFFERENCES</div>
    <p class="section-hint">Deltas documented in this period that are currently open.</p>
    ${openSection}

    <div class="section-title">DOCUMENTED IMPACT</div>
    <p class="section-hint">Recorded snapshot impacts for deltas documented in this period.</p>
    <div class="card summary-card">
      <div class="row">
        <div class="row-label">Recorded cost impact</div>
        <div class="row-value">${escapeHtml(formatSignedCurrency(report.documentedImpact.costImpact))}</div>
      </div>
      <div class="row">
        <div class="row-label">Recorded labor impact</div>
        <div class="row-value">${escapeHtml(formatSignedHours(report.documentedImpact.laborImpactHours))}</div>
      </div>
      <div class="row">
        <div>
          <div class="row-label">Largest recorded schedule variance</div>
          <div class="row-secondary">${report.documentedImpact.deltasWithScheduleImpact} delta${report.documentedImpact.deltasWithScheduleImpact === 1 ? "" : "s"} with schedule impact</div>
        </div>
        <div class="row-value">${escapeHtml(formatSignedDays(report.documentedImpact.largestRecordedVarianceDays))}</div>
      </div>
    </div>

    <div class="section-title">FIELD EVIDENCE</div>
    ${evidenceSection}

    <div class="section-title">CURRENT DELTA STATUS</div>
    <p class="section-hint">Current project disposition counts (not limited to this reporting period).</p>
    <div class="card summary-card">
      <div class="row">
        <div class="row-label">Open</div>
        <div class="row-value">${report.currentDisposition.open}</div>
      </div>
      <div class="row">
        <div class="row-label">Accepted</div>
        <div class="row-value">${report.currentDisposition.accepted}</div>
      </div>
      <div class="row">
        <div class="row-label">Rejected</div>
        <div class="row-value">${report.currentDisposition.rejected}</div>
      </div>
      <div class="row">
        <div class="row-label">Resolved</div>
        <div class="row-value">${report.currentDisposition.resolved}</div>
      </div>
    </div>

    <div class="footer">Generated by BUILDSIGMA</div>
  </body>
</html>`;
}

export { PHOTO_UNAVAILABLE };
