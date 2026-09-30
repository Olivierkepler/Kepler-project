import express from "express";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";

import { parseWebAllowedOrigins } from "../config/webOrigins.js";
import { keplerWebCors } from "../middleware/cors.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(
  baseUrl: string,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: init.headers,
  });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

function headerIncludes(value: string | null, expected: string): boolean {
  if (!value) {
    return false;
  }
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes(expected.toLowerCase());
}

async function main(): Promise<void> {
  // A. parseWebAllowedOrigins trimming / empty / exact
  const parsed = parseWebAllowedOrigins(
    " http://localhost:3001 , ,https://app.example.com ",
  );
  assert(parsed.size === 2, "parse drops empty entries");
  assert(
    parsed.has("http://localhost:3001"),
    "parse trims and keeps localhost origin",
  );
  assert(
    parsed.has("https://app.example.com"),
    "parse keeps exact https origin",
  );
  assert(
    parseWebAllowedOrigins("").size === 0,
    "empty string yields empty set",
  );
  assert(
    parseWebAllowedOrigins(undefined).size === 0,
    "undefined yields empty set",
  );
  assert(
    parseWebAllowedOrigins(" * ").has("*") === true &&
      parseWebAllowedOrigins(" * ").size === 1,
    "parser does not expand wildcards (stores literal if present)",
  );
  // Confirm no wildcard semantics in allowlist usage — exact match only
  assert(
    !parseWebAllowedOrigins("https://allowed.example").has(
      "https://other.example",
    ),
    "exact match only",
  );

  process.env.WEB_ALLOWED_ORIGINS =
    "http://localhost:3001,https://kepler.example";

  // B. minimal express app: cors first, then fake auth on /api
  const app = express();
  app.use(keplerWebCors);
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  app.use("/api", (req, res, next) => {
    const auth = req.header("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  });
  app.get("/api/test", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/api/secure", (_req, res) => {
    res.status(200).json({ secure: true });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const allowedOrigin = "http://localhost:3001";
    const disallowedOrigin = "http://evil.example";

    // C. OPTIONS allowed origin → 204 + ACAO + Allow-Headers Authorization
    {
      const res = await request(baseUrl, "/api/test", {
        method: "OPTIONS",
        headers: { Origin: allowedOrigin },
      });
      assert(res.status === 204, `C: expected 204, got ${res.status}`);
      assert(
        res.headers.get("access-control-allow-origin") === allowedOrigin,
        "C: ACAO must match allowed origin",
      );
      assert(
        headerIncludes(
          res.headers.get("access-control-allow-headers"),
          "Authorization",
        ),
        "C: Allow-Headers must include Authorization",
      );
      assert(
        res.headers.get("access-control-allow-credentials") === null,
        "C: must not set Allow-Credentials",
      );
    }

    // D. GET /api/test allowed Origin → 200 + ACAO
    {
      const res = await request(baseUrl, "/api/test", {
        headers: {
          Origin: allowedOrigin,
          Authorization: "Bearer test-token",
        },
      });
      assert(res.status === 200, `D: expected 200, got ${res.status}`);
      assert(
        res.headers.get("access-control-allow-origin") === allowedOrigin,
        "D: ACAO must match",
      );
    }

    // E. GET /api/test disallowed Origin → 200 but no ACAO (or not disallowed)
    {
      const res = await request(baseUrl, "/api/test", {
        headers: {
          Origin: disallowedOrigin,
          Authorization: "Bearer test-token",
        },
      });
      assert(res.status === 200, `E: expected 200, got ${res.status}`);
      const acao = res.headers.get("access-control-allow-origin");
      assert(
        acao === null || acao !== disallowedOrigin,
        "E: must not reflect disallowed origin",
      );
      assert(acao !== "*", "E: must not use wildcard");
    }

    // F. GET /api/test no Origin → 200
    {
      const res = await request(baseUrl, "/api/test", {
        headers: { Authorization: "Bearer test-token" },
      });
      assert(res.status === 200, `F: expected 200, got ${res.status}`);
    }

    // G. GET /api/secure without Bearer, allowed Origin → 401 + ACAO
    {
      const res = await request(baseUrl, "/api/secure", {
        headers: { Origin: allowedOrigin },
      });
      assert(res.status === 401, `G: expected 401, got ${res.status}`);
      assert(
        res.headers.get("access-control-allow-origin") === allowedOrigin,
        "G: 401 must still include ACAO for allowed origin",
      );
    }

    // H. OPTIONS /api/secure allowed origin → 204 (not 401)
    {
      const res = await request(baseUrl, "/api/secure", {
        method: "OPTIONS",
        headers: { Origin: allowedOrigin },
      });
      assert(res.status === 204, `H: expected 204, got ${res.status}`);
      assert(
        res.headers.get("access-control-allow-origin") === allowedOrigin,
        "H: preflight ACAO must match",
      );
    }

    // I. GET /health → 200
    {
      const res = await request(baseUrl, "/health");
      assert(res.status === 200, `I: expected 200, got ${res.status}`);
    }

    console.log("phaseCorsWebOriginsTest: ok");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
