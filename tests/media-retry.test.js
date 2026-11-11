import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchDriveMedia } from "../server/drive-media.js";
test("retries transient image failures without requiring a new login", async () => {
  let calls = 0,
    cancelled = 0;
  const waits = [];
  const result = await fetchDriveMedia(
    "test",
    { signal: new AbortController().signal },
    async () => {
      calls++;
      return calls < 3
        ? { status: 503, body: { cancel: async () => cancelled++ } }
        : { status: 200 };
    },
    async (ms) => waits.push(ms),
  );
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.equal(cancelled, 2);
  assert.deepEqual(waits, [300, 600]);
});
test("does not retry invalid authorization and bounds retries for persistent outages", async () => {
  let calls = 0;
  await fetchDriveMedia(
    "test",
    {},
    async () => {
      calls++;
      return { status: 401 };
    },
    async () => {},
  );
  assert.equal(calls, 1);
  calls = 0;
  const result = await fetchDriveMedia(
    "test",
    {},
    async () => {
      calls++;
      return { status: 503 };
    },
    async () => {},
  );
  assert.equal(calls, 3);
  assert.equal(result.status, 503);
});
