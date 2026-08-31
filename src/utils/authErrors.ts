/**
 * Map Firebase Auth error codes to friendly user-facing messages.
 * Never log or return passwords.
 */

function readAuthCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function formatAuthErrorMessage(
  error: unknown,
  context: "signIn" | "signUp",
): string {
  const code = readAuthCode(error);

  switch (code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Sign in instead.";
    case "auth/weak-password":
      return "Choose a stronger password. Firebase requires at least 6 characters.";
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return context === "signIn"
        ? "Unable to sign in. Check your email and password."
        : "Unable to create your account. Check your email and password.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/operation-not-allowed":
      return "Email/password accounts are not enabled for this app.";
    default:
      return context === "signIn"
        ? "Unable to sign in. Please try again."
        : "Unable to create your account. Please try again.";
  }
}

export function isEmailAlreadyInUse(error: unknown): boolean {
  return readAuthCode(error) === "auth/email-already-in-use";
}
