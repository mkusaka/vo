import assert from "node:assert/strict";
import { test } from "node:test";

import { fileKindShortLabel, fileKindTitle } from "../src/app/file-kind.mts";

test("fileKindShortLabel keeps header type labels compact", () => {
  assert.equal(fileKindShortLabel("html"), "html");
  assert.equal(fileKindShortLabel("markdown"), "md");
  assert.equal(fileKindShortLabel("mdx"), "mdx");
});

test("fileKindTitle keeps accessible type labels descriptive", () => {
  assert.equal(fileKindTitle("html"), "HTML");
  assert.equal(fileKindTitle("markdown"), "Markdown");
  assert.equal(fileKindTitle("mdx"), "MDX");
});
