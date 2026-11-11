import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readSession } from "../server/session.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  if (req.method !== "GET") return res.status(405).end();
  const session = readSession(req);
  if (!session) return res.status(401).end("Reconnect Google Drive.");
  const id = req.query.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{10,200}$/.test(id))
    return res.status(400).end();
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  try {
    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      {
        headers: { Authorization: `Bearer ${session.token}` },
        signal: controller.signal,
      },
    );
    if (!upstream.ok)
      return res
        .status(upstream.status)
        .end("Unable to load page from Google Drive.");
    const type = upstream.headers.get("content-type") || "";
    if (!type.startsWith("image/") && !type.startsWith("application/pdf")) {
      await upstream.body?.cancel();
      return res.status(415).end();
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", "inline");
    // Pipe bytes immediately: no full-file buffering or decode gate.
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    if (!res.headersSent) res.status(502).end("Page download interrupted.");
    else res.destroy();
  }
}
