import { test } from "node:test";
import assert from "node:assert/strict";
import { naturalSort, listFolder, chapterFiles } from "../src/drive.js";
test("chapters and pages sort numerically without mutating input", () => {
  const input = [{ name: "ep-10" }, { name: "ep-2" }, { name: "ep-1" }];
  assert.deepEqual(
    naturalSort(input).map((f) => f.name),
    ["ep-1", "ep-2", "ep-10"],
  );
  assert.equal(input[0].name, "ep-10");
});
test("lists every Drive page and attaches authorization", async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer test");
    calls++;
    return {
      ok: true,
      json: async () =>
        calls === 1
          ? { files: [{ name: "10" }], nextPageToken: "next" }
          : { files: [{ name: "2" }] },
    };
  };
  assert.deepEqual(
    (await listFolder("test", "root")).map((f) => f.name),
    ["2", "10"],
  );
  assert.equal(calls, 2);
});
test("loads image subfolder without executing HTML", async () => {
  global.fetch = async (url) => ({
    ok: true,
    json: async () => ({
      files: new URL(url).searchParams.get("q").startsWith("'images'")
        ? [{ id: "page", name: "01.jpg", mimeType: "image/jpeg" }]
        : [
            { id: "html", name: "index.html", mimeType: "text/html" },
            {
              id: "images",
              name: "images",
              mimeType: "application/vnd.google-apps.folder",
            },
          ],
    }),
  });
  assert.deepEqual(
    (await chapterFiles("test", "chapter")).map((f) => f.id),
    ["page"],
  );
});
test("reports expired authorization", async () => {
  global.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(listFolder("bad", "root"), /expired/);
});

test("explains disabled Drive API separately from missing OAuth scope", async () => {
  global.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: { details: [{ reason: "SERVICE_DISABLED" }] },
    }),
  });
  await assert.rejects(listFolder("test", "root"), /API is disabled/);
  global.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: { errors: [{ reason: "insufficientPermissions" }] },
    }),
  });
  await assert.rejects(
    listFolder("test", "root"),
    /read permission is missing/,
  );
});
test("preserves Google error details for other forbidden responses", async () => {
  global.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { message: "Download quota exceeded." } }),
  });
  await assert.rejects(listFolder("test", "root"), /Download quota exceeded/);
});

test("excludes JSON and other documents from image chapters", async () => {
  const files = [
    {id:"json",name:"metadata.json",mimeType:"application/json"},
    {id:"text",name:"notes.txt",mimeType:"text/plain"},
    {id:"pdf",name:"book.pdf",mimeType:"application/pdf"},
    {id:"html",name:"index.html",mimeType:"text/html"},
    {id:"image",name:"001.jpg",mimeType:"image/jpeg"},
  ];
  global.fetch = async () => ({ok:true,json:async()=>({files})});
  assert.deepEqual((await chapterFiles("test","chapter")).map(f=>f.id),["image"]);
});
