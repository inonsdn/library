import { COOKIE, readSession, sameOrigin } from "../server/session.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "GET") {
    const session = readSession(req);
    return res.status(200).json(session || {});
  }
  if (!["POST", "DELETE"].includes(req.method)) return res.status(405).end();
  if (!sameOrigin(req)) return res.status(403).end();
  if (req.method === "DELETE") {
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    );
    return res.status(200).json({ ok: true });
  }
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
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${lifetime}`,
  );
  return res.status(200).json({ ok: true });
}
