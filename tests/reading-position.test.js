import { test } from "node:test";
import assert from "node:assert/strict";
import { captureAnchor, anchorScrollTop } from "../src/reading-position.js";
test("restores the same point in an image after viewport/image dimensions change", () => {
  const saved = captureAnchor([
    { chapterId: "ep1", fileId: "page1", top: -416, bottom: 584, height: 1000 },
  ]);
  assert.equal(saved.fraction, 0.5);
  assert.equal(
    anchorScrollTop({ top: 200, height: 1600 }, saved.fraction, 0),
    916,
  );
});
test("tracks the active episode when scrolling continuously and ignores finished pages", () => {
  const saved = captureAnchor([
    {
      chapterId: "ep1",
      fileId: "last",
      top: -1200,
      bottom: -200,
      height: 1000,
    },
    { chapterId: "ep2", fileId: "first", top: 0, bottom: 1000, height: 1000 },
  ]);
  assert.equal(saved.chapterId, "ep2");
  assert.equal(saved.fileId, "first");
});
test("handles empty chapters and clamps offsets", () => {
  assert.equal(captureAnchor([]), null);
  assert.equal(anchorScrollTop({ top: 0, height: 1000 }, -1, 0), 0);
  assert.equal(anchorScrollTop({ top: 100, height: 1000 }, 2, 0), 1016);
});
