import { createHmac, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

export type OidcIdentity = {
  email: string;
  audience: string;
  issuer: string;
};

export type OidcVerifyResult =
  | { ok: true; identity: OidcIdentity }
  | { ok: false; reason: string };

export type OidcVerifier = (
  authorizationHeader: string | undefined,
) => Promise<OidcVerifyResult>;

const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

function extractBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) {
    return undefined;
  }

  const token = match[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}

/**
 * Verifies Cloud Tasks → Cloud Run OIDC tokens.
 * Checks signature (via google-auth-library), audience, issuer, and SA email.
 */
export function createProductionOidcVerifier(args: {
  expectedAudience: string;
  expectedServiceAccountEmail: string;
  additionalAllowedServiceAccountEmails?: string[];
  oauthClient?: OAuth2Client;
}): OidcVerifier {
  const client = args.oauthClient ?? new OAuth2Client();
  const expectedAudience = args.expectedAudience.replace(/\/$/, "");
  const expectedEmails = new Set([args.expectedServiceAccountEmail, ...(args.additionalAllowedServiceAccountEmails ?? [])].map((email) => email.trim().toLowerCase()).filter(Boolean));

  return async (authorizationHeader) => {
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
      return { ok: false, reason: "missing_bearer_token" };
    }

    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: expectedAudience,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        return { ok: false, reason: "empty_token_payload" };
      }

      const issuer = payload.iss ?? "";
      if (!GOOGLE_ISSUERS.has(issuer)) {
        return { ok: false, reason: "invalid_issuer" };
      }

      const email = (payload.email ?? "").trim().toLowerCase();
      if (!email) {
        return { ok: false, reason: "missing_email" };
      }

      if (!expectedEmails.has(email)) {
        return { ok: false, reason: "unexpected_service_identity" };
      }

      if (payload.email_verified === false) {
        return { ok: false, reason: "email_not_verified" };
      }

      const audienceClaim = payload.aud;
      const audiences = Array.isArray(audienceClaim)
        ? audienceClaim
        : [audienceClaim];
      const normalizedAudiences = audiences
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.replace(/\/$/, ""));

      if (!normalizedAudiences.includes(expectedAudience)) {
        return { ok: false, reason: "unexpected_audience" };
      }

      return {
        ok: true,
        identity: {
          email,
          audience: expectedAudience,
          issuer,
        },
      };
    } catch {
      return { ok: false, reason: "token_verification_failed" };
    }
  };
}

/**
 * Local-test OIDC: HMAC-signed tokens. Never used as a production bypass.
 * Production mode always uses Google signature verification.
 */
export function createLocalTestOidcVerifier(args: {
  expectedAudience: string;
  expectedServiceAccountEmail: string;
  additionalAllowedServiceAccountEmails?: string[];
  secret: string;
}): OidcVerifier {
  const expectedAudience = args.expectedAudience.replace(/\/$/, "");
  const expectedEmails = new Set([args.expectedServiceAccountEmail, ...(args.additionalAllowedServiceAccountEmails ?? [])].map((email) => email.trim().toLowerCase()).filter(Boolean));
  const secret = args.secret;

  return async (authorizationHeader) => {
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
      return { ok: false, reason: "missing_bearer_token" };
    }

    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "localtest") {
      return { ok: false, reason: "invalid_local_token_format" };
    }

    const [, bodyB64, sig] = parts;
    if (!bodyB64 || !sig) {
      return { ok: false, reason: "invalid_local_token_format" };
    }

    let body: { email?: string; aud?: string; iss?: string };
    try {
      body = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8")) as {
        email?: string;
        aud?: string;
        iss?: string;
      };
    } catch {
      return { ok: false, reason: "invalid_local_token_payload" };
    }

    const expectedSig = createHmac("sha256", secret)
      .update(`localtest.${bodyB64}`)
      .digest("base64url");

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return { ok: false, reason: "invalid_local_token_signature" };
    }

    const email = (body.email ?? "").trim().toLowerCase();
    const aud = (body.aud ?? "").replace(/\/$/, "");
    const issuer = body.iss ?? "";

    if (!expectedEmails.has(email)) {
      return { ok: false, reason: "unexpected_service_identity" };
    }

    if (aud !== expectedAudience) {
      return { ok: false, reason: "unexpected_audience" };
    }

    if (!GOOGLE_ISSUERS.has(issuer)) {
      return { ok: false, reason: "invalid_issuer" };
    }

    return {
      ok: true,
      identity: {
        email,
        audience: expectedAudience,
        issuer,
      },
    };
  };
}

export function mintLocalTestOidcToken(args: {
  email: string;
  audience: string;
  secret: string;
  issuer?: string;
}): string {
  const body = Buffer.from(
    JSON.stringify({
      email: args.email,
      aud: args.audience.replace(/\/$/, ""),
      iss: args.issuer ?? "https://accounts.google.com",
    }),
    "utf8",
  ).toString("base64url");

  const sig = createHmac("sha256", args.secret)
    .update(`localtest.${body}`)
    .digest("base64url");

  return `localtest.${body}.${sig}`;
}

export function createOidcVerifierFromEnv(args: {
  oidcMode: "production" | "local_test";
  expectedAudience: string;
  expectedServiceAccountEmail: string;
  additionalAllowedServiceAccountEmails?: string[];
  localOidcSecret: string | null;
}): OidcVerifier {
  if (args.oidcMode === "local_test") {
    if (!args.localOidcSecret) {
      throw new Error("localOidcSecret required for local_test OIDC mode");
    }
    return createLocalTestOidcVerifier({
      expectedAudience: args.expectedAudience,
      expectedServiceAccountEmail: args.expectedServiceAccountEmail,
      additionalAllowedServiceAccountEmails: args.additionalAllowedServiceAccountEmails,
      secret: args.localOidcSecret,
    });
  }

  return createProductionOidcVerifier({
    expectedAudience: args.expectedAudience,
    expectedServiceAccountEmail: args.expectedServiceAccountEmail,
    additionalAllowedServiceAccountEmails: args.additionalAllowedServiceAccountEmails,
  });
}
