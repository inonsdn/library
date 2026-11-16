import { timingSafeEqual } from "node:crypto";
import {
  APP_ORIGIN,
  CLIENT_ID,
  cookieValue,
  unseal,
  setCookie,
  writeSession,
} from "../../server/session.js";
function matches(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") return res.status(405).end();
  const state = unseal(cookieValue(req, "folio_oauth"));
  setCookie(res, "folio_oauth", "", 0);
  if (
    !state ||
    Date.now() - state.createdAt > 600000 ||
    !matches(req.query.state, state.state)
  )
    return res.redirect(302, "/?auth_error=state");
  if (req.query.error) return res.redirect(302, "/?auth_error=cancelled");
  if (
    typeof req.query.code !== "string" ||
    !req.query.code ||
    req.query.code.length > 4096
  )
    return res.redirect(302, "/?auth_error=code");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${APP_ORIGIN}/api/auth/callback`,
        grant_type: "authorization_code",
        code_verifier: state.verifier,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token)
      return res.redirect(302, "/?auth_error=exchange");
    if (!data.refresh_token) return res.redirect(302, "/?auth_error=refresh");
    if (
      !String(data.scope || "")
        .split(" ")
        .includes("https://www.googleapis.com/auth/drive.readonly")
    )
      return res.redirect(302, "/?auth_error=scope");
    const now = Date.now();
    writeSession(res, {
      token: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now + Number(data.expires_in || 3600) * 1000,
      lastActive: now,
      ...(data.refresh_token_expires_in
        ? {
            refreshExpiresAt:
              now + Number(data.refresh_token_expires_in) * 1000,
          }
        : {}),
    });
    return res.redirect(302, "/");
  } catch {
    return res.redirect(302, "/?auth_error=exchange");
  }
}
