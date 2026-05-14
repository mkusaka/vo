import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSharePath,
  selectedPathFromSearch,
  withSelectedFilePath,
} from "../src/app/url-state.mts";

test("selectedPathFromSearch reads normalized file query", () => {
  assert.equal(
    selectedPathFromSearch("?file=examples%2Fpage.mdx"),
    "examples/page.mdx",
  );
  assert.equal(selectedPathFromSearch("?q=page"), undefined);
});

test("withSelectedFilePath updates only the file query parameter", () => {
  assert.equal(
    withSelectedFilePath("http://localhost:6301/?q=md#top", "examples\\page.mdx"),
    "/?q=md&file=examples%2Fpage.mdx#top",
  );
  assert.equal(
    withSelectedFilePath("http://localhost:6301/?q=md&file=old.md", undefined),
    "/?q=md",
  );
});

test("normalizeSharePath trims paths for sharing", () => {
  assert.equal(normalizeSharePath(" /examples\\page.mdx "), "examples/page.mdx");
});
