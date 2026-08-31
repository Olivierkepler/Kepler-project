import { API_BASE_URL } from "../../config/api";

export type HealthResponse = {
  service: string;
  status: "ok";
  version: string;
};

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.service === "string" &&
    record.status === "ok" &&
    typeof record.version === "string"
  );
}

/**
 * Calls GET /health on the configured BUILDSIGMA API.
 * Does not touch local Measurement/Delta stores.
 */
export async function getApiHealth(): Promise<HealthResponse> {
  if (!API_BASE_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not configured. Set it to your BUILDSIGMA API base URL.",
    );
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/health`);
  } catch {
    throw new Error("Unable to reach the BUILDSIGMA API.");
  }

  if (!response.ok) {
    throw new Error(
      `BUILDSIGMA API health check failed with status ${response.status}.`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error("BUILDSIGMA API returned invalid JSON.");
  }

  if (!isHealthResponse(payload)) {
    throw new Error("BUILDSIGMA API returned an unexpected health payload.");
  }

  return payload;
}
