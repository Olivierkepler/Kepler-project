import type { FieldReport } from "../utils/domain/fieldReport";

export type SavedFieldReport = {
  schemaVersion: 1;
  id: string;
  projectId: string;
  savedAt: string;
  snapshot: FieldReport;
};
