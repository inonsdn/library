import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { accessSession, sessionError } from "../server/session.js";
import { fetchDriveMedia } from "../server/drive-media.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).end();
  const { path, ...params } = req.query;
  if (
    typeof path !== "string" ||
    !/^files(?:\/[a-zA-Z0-9_-]{10,200})?$/.test(path)
  )
    return res.status(400).end();
  const allowed = new Set([
    "q",
    "fields",
    "pageSize",
    "pageToken",
    "supportsAllDrives",
    "includeItemsFromAllDrives",
    "alt",
    "orderBy",
  ]);
  if (
    Object.entries(params).some(
      ([key, value]) => !allowed.has(key) || typeof value !== "string",
    )
  )
    return res.status(400).end();
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  try {
    let session = await accessSession(req, res);
    const url = `https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams(params)}`;
    const options = () => ({
      headers: { Authorization: `Bearer ${session.token}` },
      signal: controller.signal,
    });
    let upstream = await fetchDriveMedia(url, options());
    if (upstream.status === 401 && session.refreshToken) {
      await upstream.body?.cancel();
      session = await accessSession(req, res, { forceRefresh: true });
      upstream = await fetchDriveMedia(url, options());
    }
    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream",
    );
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (e) {
    if (!res.headersSent) return sessionError(res, e);
    res.destroy();
  }
}
