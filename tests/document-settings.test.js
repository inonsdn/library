import { test } from "node:test";
import assert from "node:assert/strict";
import { documentType, clampPage } from "../src/document-settings.js";
import { chapterFiles, readable } from "../src/drive.js";
test("recognizes PDF and EPUB MIME types and file extensions, excludes JSON", () => {
  assert.equal(documentType({ mimeType: "application/pdf" }), "pdf");
  assert.equal(documentType({ mimeType: "application/epub+zip" }), "epub");
  assert.equal(
    documentType({
      name: "New Book.EPUB",
      mimeType: "application/octet-stream",
    }),
    "epub",
  );
  assert.equal(
    documentType({
      name: "New Book.PDF",
      mimeType: "application/octet-stream",
    }),
    "pdf",
  );
  assert.equal(
    readable({ name: "data.json", mimeType: "application/json" }),
    false,
  );
});
test("discovers PDF and EPUB in book → episode → content folders", async () => {
  const original = global.fetch;
  global.fetch = async (url) => ({
    ok: true,
    json: async () => ({
      files: new URL(url).searchParams.get("q").startsWith("'content'")
        ? [
            { id: "pdf", name: "01.pdf", mimeType: "application/pdf" },
            { id: "epub", name: "02.epub", mimeType: "application/epub+zip" },
            { id: "json", name: "metadata.json", mimeType: "application/json" },
          ]
        : [
            {
              id: "content",
              name: "content",
              mimeType: "application/vnd.google-apps.folder",
            },
          ],
    }),
  });
  try {
    assert.deepEqual(
      (await chapterFiles("test", "episode")).map((f) => f.id),
      ["pdf", "epub"],
    );
  } finally {
    global.fetch = original;
  }
});
test("clamps page navigation and restored positions to the actual PDF length", () => {
  assert.equal(clampPage(0, 10), 1);
  assert.equal(clampPage(-4, 10), 1);
  assert.equal(clampPage(999, 10), 10);
  assert.equal(clampPage("3", 10), 3);
  assert.equal(clampPage("bad", 10), 1);
});
