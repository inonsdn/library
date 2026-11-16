import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessSession,
  readSession,
  seal,
  unseal,
  IDLE_MS,
  publicSession,
} from "../server/session.js";
import sessionHandler from "../api/session.js";
import start from "../api/auth/start.js";
import callback from "../api/auth/callback.js";
process.env.SESSION_ENCRYPTION_KEY =
  "test-encryption-key-with-at-least-32-characters";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
function response() {
  return {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    getHeader(k) {
      return this.headers[k];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
    redirect(status, url) {
      this.statusCode = status;
      this.location = url;
      return this;
    },
  };
}
function session(overrides = {}) {
  return {
    token: "access-private",
    refreshToken: "refresh-private",
    expiresAt: Date.now() + 3600000,
    lastActive: Date.now(),
    ...overrides,
  };
}
function request(value) {
  return {
    headers: {
      cookie: `folio_drive=${seal(value)}`,
      host: "library.nonsdn.com",
      origin: "https://library.nonsdn.com",
    },
  };
}
function storedCookie(res) {
  const h = res.headers["Set-Cookie"];
  return (Array.isArray(h) ? h : [h]).find((v) =>
    v?.startsWith("folio_drive="),
  );
}
test("encrypts refresh tokens, rejects tampering, and never exposes tokens in session JSON", () => {
  const value = seal(session());
  assert.ok(value.startsWith("v2."));
  assert.ok(!value.includes("refresh-private"));
  assert.equal(unseal(value).refreshToken, "refresh-private");
  const bytes = Buffer.from(value.slice(3), "base64url");
  bytes[30] ^= 1;
  assert.equal(unseal(`v2.${bytes.toString("base64url")}`), null);
  const exposed = publicSession(session());
  assert.equal(exposed.token, "server-session");
  assert.equal(exposed.refreshToken, undefined);
  assert.ok(!JSON.stringify(exposed).includes("access-private"));
});
test("expires after three days idle even when the refresh token is still usable", async () => {
  const stale = session({ lastActive: Date.now() - IDLE_MS - 1 });
  assert.equal(readSession(request(stale)), null);
  await assert.rejects(accessSession(request(stale), response()), {
    status: 401,
  });
});
test("automatically refreshes expired access without extending an unattended session", async () => {
  const original = global.fetch;
  let calls = 0;
  const lastActive = Date.now() - 2 * 86400000;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.equal(options.body.get("grant_type"), "refresh_token");
    assert.equal(options.body.get("refresh_token"), "refresh-private");
    return {
      ok: true,
      json: async () => ({ access_token: "renewed-access", expires_in: 3600 }),
    };
  };
  try {
    const res = response();
    const renewed = await accessSession(
      request(session({ expiresAt: Date.now() - 1, lastActive })),
      res,
    );
    assert.equal(renewed.token, "renewed-access");
    assert.equal(renewed.lastActive, lastActive);
    assert.equal(renewed.refreshToken, "refresh-private");
    assert.equal(calls, 1);
    const maxAge = Number(storedCookie(res).match(/Max-Age=(\d+)/)[1]);
    assert.ok(maxAge <= 86400 && maxAge > 86390);
  } finally {
    global.fetch = original;
  }
});
test("active user requests roll the inactivity deadline forward to three days", async () => {
  const req = request(session({ lastActive: Date.now() - 2 * 86400000 })),
    res = response();
  await sessionHandler(
    { ...req, method: "POST", body: { action: "touch" } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.idleExpiresAt > Date.now() + IDLE_MS - 1000);
  const lifetime = Number(storedCookie(res).match(/Max-Age=(\d+)/)[1]);
  assert.ok(lifetime >= 259199 && lifetime <= 259200);
});
test("revoked Google refresh tokens require reconnect rather than a refresh loop", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: "invalid_grant" }),
  });
  try {
    const res = response();
    await sessionHandler(
      {
        ...request(session({ expiresAt: Date.now() - 1 })),
        method: "POST",
        body: { action: "touch" },
      },
      res,
    );
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "RECONNECT_REQUIRED");
    assert.match(storedCookie(res), /Max-Age=0/);
  } finally {
    global.fetch = original;
  }
});
test("temporary refresh outages preserve the saved connection", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: "temporarily_unavailable" }),
  });
  try {
    const res = response();
    await sessionHandler(
      {
        ...request(session({ expiresAt: Date.now() - 1 })),
        method: "POST",
        body: { action: "touch" },
      },
      res,
    );
    assert.equal(res.statusCode, 503);
    assert.equal(storedCookie(res), undefined);
  } finally {
    global.fetch = original;
  }
});
test("OAuth requests offline access with PKCE and binds the callback to its browser", async () => {
  const res = response();
  start({ method: "GET", headers: { host: "library.nonsdn.com" } }, res);
  assert.equal(res.statusCode, 302);
  const url = new URL(res.location);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.ok(options.body.get("code_verifier"));
    assert.equal(
      options.body.get("redirect_uri"),
      "https://library.nonsdn.com/api/auth/callback",
    );
    return {
      ok: true,
      json: async () => ({
        access_token: "access-code",
        refresh_token: "refresh-code",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/drive.readonly",
      }),
    };
  };
  try {
    const result = response();
    await callback(
      {
        method: "GET",
        headers: { cookie: res.headers["Set-Cookie"] },
        query: { state: url.searchParams.get("state"), code: "code-once" },
      },
      result,
    );
    assert.equal(result.location, "/");
    const stored = readSession({ headers: { cookie: storedCookie(result) } });
    assert.equal(stored.refreshToken, "refresh-code");
    assert.equal(result.headers["Set-Cookie"].length, 2);
    const rejected = response();
    await callback(
      {
        method: "GET",
        headers: { cookie: res.headers["Set-Cookie"] },
        query: { state: "wrong-state", code: "code" },
      },
      rejected,
    );
    assert.equal(rejected.location, "/?auth_error=state");
  } finally {
    global.fetch = original;
  }
});
test("honors Google-issued refresh token expiration separately from app inactivity", () => {
  assert.equal(
    readSession(request(session({ refreshExpiresAt: Date.now() - 1 }))),
    null,
  );
});
