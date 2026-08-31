import { API_BASE_URL } from "../../config/api";
import { auth } from "../../config/firebase";

function getBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not configured. Set it to your BUILDSIGMA API base URL.",
    );
  }

  return API_BASE_URL.replace(/\/$/, "");
}

/**
 * Authenticated fetch for Cloud Run /api/* routes.
 * Uses the current Firebase user's ID token (refreshed by the SDK).
 */
export async function authenticatedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Not authenticated");
  }

  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return fetch(`${getBaseUrl()}${normalizedPath}`, {
    ...init,
    headers,
  });
}
