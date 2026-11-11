import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import handler from "../api/image.js";
class Response extends Writable {
  constructor(onChunk = () => {}) {
    super();
    this.headers = {};
    this.chunks = [];
    this.onChunk = onChunk;
  }
  setHeader(k, v) {
    this.headers[k] = v;
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  _write(chunk, encoding, done) {
    this.chunks.push(chunk);
    this.onChunk(chunk);
    done();
  }
}
test("streams the first image bytes before the complete file arrives", async () => {
  const original = global.fetch;
  let release, firstByte;
  const received = new Promise((resolve) => {
    firstByte = resolve;
  });
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return {
      ok: true,
      headers: new Headers({ "Content-Type": "image/jpeg" }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          release = () => {
            controller.enqueue(new Uint8Array([3, 4]));
            controller.close();
          };
        },
      }),
    };
  };
  try {
    const cookie = Buffer.from(
      JSON.stringify({ token: "test-token", expiresAt: Date.now() + 60000 }),
    ).toString("base64url");
    const res = new Response(firstByte);
    const work = handler(
      {
        method: "GET",
        headers: { cookie: `folio_drive=${cookie}` },
        query: { id: "valid-image-id" },
      },
      res,
    );
    await received;
    assert.equal(res.writableFinished, false);
    assert.deepEqual([...res.chunks[0]], [1, 2]);
    release();
    await work;
    assert.deepEqual([...Buffer.concat(res.chunks)], [1, 2, 3, 4]);
    assert.equal(res.headers["Cache-Control"], "private, no-store");
  } finally {
    global.fetch = original;
  }
});
test("image route requires a saved Drive session", async () => {
  const res = new Response();
  await handler(
    { method: "GET", headers: {}, query: { id: "valid-image-id" } },
    res,
  );
  assert.equal(res.statusCode, 401);
});
