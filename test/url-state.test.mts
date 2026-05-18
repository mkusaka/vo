import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSharePath,
  selectedPathFromSearch,
  viewModeFromSearch,
  withViewerUrlState,
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

test("viewModeFromSearch reads shared view query values", () => {
  assert.equal(viewModeFromSearch("?view=annotation"), "annotate");
  assert.equal(viewModeFromSearch("?view=annotate"), "annotate");
  assert.equal(viewModeFromSearch("?view=diff"), "diff");
  assert.equal(viewModeFromSearch("?view=raw"), "render");
  assert.equal(viewModeFromSearch("?view=render"), "render");
  assert.equal(viewModeFromSearch("?view=other"), undefined);
});

test("withViewerUrlState writes file and view while preserving hash by default", () => {
  assert.equal(
    withViewerUrlState("http://localhost:6301/?q=md#comments=raw", {
      filePath: "examples/page.mdx",
      viewMode: "annotate",
    }),
    "/?q=md&file=examples%2Fpage.mdx&view=annotation#comments=raw",
  );
  assert.equal(
    withViewerUrlState("http://localhost:6301/?q=md#top", {
      filePath: "README.md",
      hash: "",
      viewMode: "render",
    }),
    "/?q=md&file=README.md&view=raw",
  );
});

test("normalizeSharePath trims paths for sharing", () => {
  assert.equal(normalizeSharePath(" /examples\\page.mdx "), "examples/page.mdx");
});
