import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const COOKIE = "folio_drive";
export const IDLE_MS = 3 * 24 * 60 * 60 * 1000;
export const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "548264816971-pseuh8l23qtb35ft8oaj6ids4aalofbs.apps.googleusercontent.com";
export const APP_ORIGIN =
  process.env.APP_ORIGIN || "https://library.nonsdn.com";
export function authConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_SECRET &&
      process.env.SESSION_ENCRYPTION_KEY?.length >= 32,
  );
}
function key() {
  const secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!secret || secret.length < 32)
    throw new Error("Session encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}
export function seal(value) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return `v2.${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")}`;
}
export function unseal(value) {
  try {
    if (!value?.startsWith("v2.")) return null;
    const data = Buffer.from(value.slice(3), "base64url");
    if (data.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
  } catch {
    return null;
  }
}
export function cookieValue(req, name = COOKIE) {
  return (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function readSession(req, now = Date.now()) {
  const value = cookieValue(req);
  if (!value) return null;
  if (value.startsWith("v2.")) {
    const session = unseal(value);
    if (
      !session ||
      typeof session.token !== "string" ||
      !session.token ||
      !Number.isFinite(session.lastActive) ||
      now - session.lastActive >= IDLE_MS ||
      session.lastActive > now + 60000 ||
      !Number.isFinite(session.expiresAt)
    )
      return null;
    if (session.refreshExpiresAt && session.refreshExpiresAt <= now)
      return null;
    if (!session.refreshToken && session.expiresAt <= now) return null;
    return session;
  }
  // Existing one-hour connections continue working during migration.
  try {
    const legacy = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      typeof legacy.token !== "string" ||
      !legacy.token ||
      !Number.isFinite(legacy.expiresAt) ||
      legacy.expiresAt <= now ||
      legacy.expiresAt > now + 3601000
    )
      return null;
    return legacy;
  } catch {
    return null;
  }
}
export function setCookie(res, name, value, maxAge) {
  const cookie = `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
  const prior = res.getHeader?.("Set-Cookie");
  res.setHeader(
    "Set-Cookie",
    prior ? [...(Array.isArray(prior) ? prior : [prior]), cookie] : cookie,
  );
}
export function writeSession(res, session, now = Date.now()) {
  const remaining = session.refreshToken
    ? IDLE_MS - (now - session.lastActive)
    : session.expiresAt - now;
  setCookie(res, COOKIE, seal(session), remaining / 1000);
}
export function clearSession(res) {
  setCookie(res, COOKIE, "", 0);
}
export function sameOrigin(req) {
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}
export class ReconnectRequired extends Error {
  constructor(
    message = "Your Google connection expired. Connect again to continue.",
  ) {
    super(message);
    this.status = 401;
    this.code = "RECONNECT_REQUIRED";
  }
}
const pendingRefresh = new Map();
async function refresh(session) {
  const identity = createHash("sha256")
    .update(session.refreshToken)
    .digest("hex");
  if (!pendingRefresh.has(identity)) {
    const job = (async () => {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: session.refreshToken,
          client_id: CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "invalid_grant" || response.status === 401)
          throw new ReconnectRequired(
            "Google requires you to reconnect. Your authorization may have expired or been revoked.",
          );
        throw Object.assign(
          new Error(
            "Google token renewal is temporarily unavailable. Please retry.",
          ),
          { status: 503 },
        );
      }
      if (!data.access_token)
        throw Object.assign(new Error("Google returned no access token."), {
          status: 503,
        });
      return data;
    })();
    pendingRefresh.set(identity, job);
    job.finally(() => pendingRefresh.delete(identity)).catch(() => {});
  }
  const data = await pendingRefresh.get(identity);
  const now = Date.now();
  return {
    ...session,
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600) * 1000,
    refreshToken: data.refresh_token || session.refreshToken,
    ...(data.refresh_token_expires_in
      ? { refreshExpiresAt: now + Number(data.refresh_token_expires_in) * 1000 }
      : {}),
  };
}
export async function accessSession(
  req,
  res,
  { touch = false, forceRefresh = false } = {},
) {
  let session = readSession(req);
  if (!session) throw new ReconnectRequired();
  let changed = false;
  if (
    session.refreshToken &&
    (forceRefresh || session.expiresAt <= Date.now() + 60000)
  ) {
    if (!authConfigured())
      throw Object.assign(
        new Error("Google token renewal is not configured."),
        { status: 503 },
      );
    session = await refresh(session);
    changed = true;
  } else if (session.expiresAt <= Date.now()) throw new ReconnectRequired();
  if (touch && session.refreshToken) {
    session = { ...session, lastActive: Date.now() };
    changed = true;
  }
  if (changed) writeSession(res, session);
  return session;
}
export function sessionError(res, error) {
  if (error.status === 401) clearSession(res);
  return res
    .status(error.status || 503)
    .json({
      error: error.message || "Google connection temporarily unavailable.",
      code: error.code || "RETRY_LATER",
    });
}
export function publicSession(session) {
  return {
    token: "server-session",
    connected: true,
    renewable: Boolean(session.refreshToken),
    expiresAt: session.expiresAt,
    idleExpiresAt: session.refreshToken
      ? session.lastActive + IDLE_MS
      : session.expiresAt,
    configured: authConfigured(),
  };
}
