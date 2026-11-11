import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/session.js";
import { readSession } from "../server/session.js";
function response() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(s) {
      this.statusCode = s;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
    end() {
      return this;
    },
  };
}
test("saves session in HttpOnly cookie and restores it only before expiration", async () => {
  const res = response();
  await handler(
    {
      method: "POST",
      headers: {
        host: "library.nonsdn.com",
        origin: "https://library.nonsdn.com",
      },
      body: { token: "test-token", expiresIn: 3600 },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  const cookie = res.headers["Set-Cookie"];
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const req = { headers: { cookie } };
  assert.equal(readSession(req).token, "test-token");
  assert.equal(readSession(req, Date.now() + 3601000), null);
  const restored = response();
  await handler({ ...req, method: "GET" }, restored);
  assert.equal(restored.body.token, "test-token");
  assert.equal(restored.headers["Cache-Control"], "private, no-store");
});
test("rejects cross-origin writes and disconnect expires saved cookie", async () => {
  const denied = response();
  await handler(
    {
      method: "POST",
      headers: { host: "library.nonsdn.com", origin: "https://other.test" },
      body: {},
    },
    denied,
  );
  assert.equal(denied.statusCode, 403);
  const removed = response();
  await handler(
    {
      method: "DELETE",
      headers: {
        host: "library.nonsdn.com",
        origin: "https://library.nonsdn.com",
      },
    },
    removed,
  );
  assert.match(removed.headers["Set-Cookie"], /Max-Age=0/);
  assert.equal(readSession({ headers: { cookie: "folio_drive=bad" } }), null);
});
