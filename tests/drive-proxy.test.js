import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import handler from "../api/drive.js";
class Res extends Writable {
  constructor() {
    super();
    this.headers = {};
    this.chunks = [];
  }
  setHeader(k, v) {
    this.headers[k] = v;
  }
  getHeader(k) {
    return this.headers[k];
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  json(value) {
    this.end(JSON.stringify(value));
    return this;
  }
  _write(chunk, encoding, next) {
    this.chunks.push(chunk);
    next();
  }
}
test("proxies read-only Drive metadata using the saved server credential", async () => {
  const original = global.fetch;
  const cookie = Buffer.from(
    JSON.stringify({
      token: "legacy-test-access",
      expiresAt: Date.now() + 60000,
    }),
  ).toString("base64url");
  global.fetch = async (url, options) => {
    assert.ok(url.startsWith("https://www.googleapis.com/drive/v3/files?"));
    assert.equal(options.headers.Authorization, "Bearer legacy-test-access");
    return new Response(
      JSON.stringify({ files: [{ id: "file", name: "001.webp" }] }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const res = new Res();
    await handler(
      {
        method: "GET",
        headers: { cookie: `folio_drive=${cookie}` },
        query: { path: "files", fields: "files(id,name)" },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(Buffer.concat(res.chunks)).files.length, 1);
    assert.equal(res.headers["Cache-Control"], "private, no-store");
  } finally {
    global.fetch = original;
  }
});
test("rejects arbitrary proxy paths before making external requests", async () => {
  const res = new Res();
  await handler(
    { method: "GET", headers: {}, query: { path: "https://other.example/" } },
    res,
  );
  assert.equal(res.statusCode, 400);
});
