import { randomBytes, createHash } from "node:crypto";
import {
  APP_ORIGIN,
  CLIENT_ID,
  authConfigured,
  seal,
  setCookie,
} from "../../server/session.js";
export default function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).end();
  if (!authConfigured())
    return res
      .status(503)
      .end(
        "Google refresh-token sign-in is not configured. Add GOOGLE_CLIENT_SECRET and SESSION_ENCRYPTION_KEY in Vercel.",
      );
  if (req.headers.host !== new URL(APP_ORIGIN).host)
    return res.redirect(302, `${APP_ORIGIN}/api/auth/start`);
  const state = randomBytes(24).toString("base64url"),
    verifier = randomBytes(32).toString("base64url");
  setCookie(
    res,
    "folio_oauth",
    seal({ state, verifier, createdAt: Date.now() }),
    600,
  );
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${APP_ORIGIN}/api/auth/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return res.redirect(
    302,
    `https://accounts.google.com/o/oauth2/v2/auth?${query}`,
  );
}
