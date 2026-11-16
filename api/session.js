import {
  COOKIE,
  accessSession,
  authConfigured,
  clearSession,
  publicSession,
  sameOrigin,
  sessionError,
  setCookie,
} from "../server/session.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "GET") {
    try {
      return res
        .status(200)
        .json(publicSession(await accessSession(req, res, { touch: true })));
    } catch (e) {
      if (e.status === 401) {
        clearSession(res);
        return res
          .status(200)
          .json({ connected: false, configured: authConfigured() });
      }
      return sessionError(res, e);
    }
  }
  if (!["POST", "DELETE"].includes(req.method)) return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).end();
  if (req.method === "DELETE") {
    clearSession(res);
    return res.status(200).json({ ok: true });
  }
  if (req.body?.action === "touch") {
    try {
      return res
        .status(200)
        .json(publicSession(await accessSession(req, res, { touch: true })));
    } catch (e) {
      return sessionError(res, e);
    }
  }
  // Compatibility for a browser running the previous release until it reloads.
  const { token, expiresIn } = req.body || {};
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 3000 ||
    !Number.isFinite(Number(expiresIn)) ||
    Number(expiresIn) <= 0
  )
    return res.status(400).end();
  const lifetime = Math.min(3600, Math.floor(Number(expiresIn)));
  const value = Buffer.from(
    JSON.stringify({ token, expiresAt: Date.now() + lifetime * 1000 }),
  ).toString("base64url");
  setCookie(res, COOKIE, value, lifetime);
  return res.status(200).json({ ok: true });
}
