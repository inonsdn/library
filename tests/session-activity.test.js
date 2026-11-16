import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldTouchSession } from "../src/session-activity.js";
test("extends sessions for current user activity, without extending unattended tabs", () => {
  const now = 1000000;
  assert.equal(
    shouldTouchSession({
      now,
      lastInteraction: now - 1000,
      lastTouch: now - 300000,
      hidden: false,
    }),
    true,
  );
  assert.equal(
    shouldTouchSession({
      now,
      lastInteraction: now - 600000,
      lastTouch: now - 600000,
      hidden: false,
    }),
    false,
  );
  assert.equal(
    shouldTouchSession({
      now,
      lastInteraction: now,
      lastTouch: now - 600000,
      hidden: true,
    }),
    false,
  );
  assert.equal(
    shouldTouchSession({
      now,
      lastInteraction: now,
      lastTouch: now - 1000,
      hidden: false,
    }),
    false,
  );
});
