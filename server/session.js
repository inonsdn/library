export const COOKIE = "folio_drive";
export function readSession(req, now = Date.now()) {
  try {
    const value = (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const session = JSON.parse(
      Buffer.from(value || "", "base64url").toString(),
    );
    if (
      typeof session.token !== "string" ||
      !session.token ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= now
    )
      return null;
    return session;
  } catch {
    return null;
  }
}
export function sameOrigin(req) {
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}
