// Request-level security: who may talk to the server, and how pages are locked down.

import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_HOST = (process.env.PUBLIC_HOST || "agent.vezevicius.lt").toLowerCase();

// ---------- 1. CSRF and DNS rebinding protection ----------
// Only these hostnames may be used to reach the server. A malicious site using
// DNS rebinding arrives with its own hostname in the Host header and is refused.
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, PUBLIC_HOST]);
const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  `https://${PUBLIC_HOST}`,
]);

// Returns an error message if the request must be rejected, otherwise null.
export function checkRequestOrigin(req) {
  const host = String(req.headers.host || "").toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return `Host '${host}' is not allowed.`;

  // Browsers mark requests from other websites. Refuse those outright.
  if (req.headers["sec-fetch-site"] === "cross-site") return "Cross-site requests are not allowed.";

  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin.toLowerCase())) return `Origin '${origin}' is not allowed.`;

  // State-changing requests must be JSON. A web page cannot send JSON to
  // another site without the browser asking permission first (CORS preflight),
  // which this server never grants, so cross-site form/fetch tricks fail.
  if (req.method === "POST" || req.method === "PUT") {
    const type = String(req.headers["content-type"] || "").toLowerCase();
    if (!type.startsWith("application/json")) return "Content-Type must be application/json.";
  }
  return null;
}

// ---------- 5. Security headers ----------
export function newNonce() {
  return crypto.randomBytes(16).toString("base64");
}

export function securityHeaders(nonce) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
  if (nonce) {
    // Scripts: only our own files plus inline scripts carrying this request's nonce.
    // Even if a reply ever slipped a <script> past the sanitizer, it would not run.
    headers["Content-Security-Policy"] = [
      "default-src 'none'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }
  return headers;
}

// ---------- 2. Cloudflare Access JWT verification ----------
// Cloudflare Access signs every request it lets through with a JWT in the
// Cf-Access-Jwt-Assertion header. Verifying it proves the email is genuine,
// instead of trusting a plain header that anything could set.
const TEAM_DOMAIN = (process.env.CF_ACCESS_TEAM_DOMAIN || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const AUDIENCE = process.env.CF_ACCESS_AUD || "";
const CERTS_URL =
  process.env.CF_ACCESS_CERTS_URL || (TEAM_DOMAIN && `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);

export const jwtEnabled = Boolean(TEAM_DOMAIN && AUDIENCE);
const jwks = jwtEnabled ? createRemoteJWKSet(new URL(CERTS_URL)) : null;

// Returns the verified email, or throws if the token is missing or invalid.
export async function verifyAccessJwt(req) {
  const token = req.headers["cf-access-jwt-assertion"];
  if (!token) throw new Error("missing Cloudflare Access token");
  const { payload } = await jwtVerify(String(token), jwks, {
    issuer: `https://${TEAM_DOMAIN}`,
    audience: AUDIENCE,
  });
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) throw new Error("token has no email");
  return email;
}