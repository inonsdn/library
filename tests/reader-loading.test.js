import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pageRatio,
  preloadMargin,
  createDownloadQueue,
} from "../src/reader-loading.js";
test("reserves actual tall manga panel dimensions with fallback for absent metadata", () => {
  assert.equal(
    pageRatio({ imageMediaMetadata: { width: 800, height: 3200 } }),
    0.25,
  );
  assert.equal(pageRatio({}), 2 / 3);
});
test("buffers three screens ahead and one screen behind on any screen size", () => {
  assert.equal(preloadMargin(900), "900px 0px 2700px 0px");
  assert.equal(preloadMargin(600), "600px 0px 1800px 0px");
});
test("limits concurrency and prioritizes pages near the new viewport after a jump", async () => {
  const queue = createDownloadQueue(1),
    controller = new AbortController();
  let release;
  const order = [];
  const first = queue(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    controller.signal,
  );
  await Promise.resolve();
  let near = 100,
    far = 200;
  const a = queue(
    async () => order.push("old"),
    controller.signal,
    () => near,
  );
  const b = queue(
    async () => order.push("new viewport"),
    controller.signal,
    () => far,
  );
  far = 0;
  release();
  await Promise.all([first, a, b]);
  assert.deepEqual(order, ["new viewport", "old"]);
});
test("cancels queued pages when leaving the chapter", async () => {
  const queue = createDownloadQueue(1),
    controller = new AbortController(),
    cancelled = new AbortController();
  let release,
    ran = false;
  const first = queue(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    controller.signal,
  );
  await Promise.resolve();
  const second = queue(async () => {
    ran = true;
  }, cancelled.signal);
  cancelled.abort();
  await assert.rejects(second, { name: "AbortError" });
  release();
  await first;
  assert.equal(ran, false);
});
