import assert from "node:assert/strict";
import test from "node:test";

import {
  directoryPrefixes,
  fileIdByTreePath,
  toTreePaths,
} from "../src/app/tree-data.mts";
import type { FileMetadata, SupportedKind } from "../src/types.mts";

test("toTreePaths normalizes and sorts file paths", () => {
  assert.deepEqual(toTreePaths([
    file("docs\\intro.md"),
    file("README.md"),
    file("docs/intro.md"),
  ]), [
    "docs/intro.md",
    "README.md",
  ]);
});

test("directoryPrefixes expands parent directories for open trees", () => {
  assert.deepEqual(directoryPrefixes([
    "README.md",
    "docs/intro.md",
    "docs/guides/start.mdx",
  ]), [
    "docs/",
    "docs/guides/",
  ]);
});

test("fileIdByTreePath maps normalized tree paths to metadata ids", () => {
  const files = [
    file("docs\\intro.md", "intro"),
    file("docs/guides/start.mdx", "start"),
  ];

  assert.equal(fileIdByTreePath(files).get("docs/intro.md"), "intro");
  assert.equal(fileIdByTreePath(files).get("docs/guides/start.mdx"), "start");
});

function file(relativePath: string, id = relativePath): FileMetadata {
  const kind: SupportedKind = relativePath.endsWith(".mdx")
    ? "mdx"
    : relativePath.endsWith(".html")
      ? "html"
      : "markdown";

  return {
    extension: relativePath.slice(relativePath.lastIndexOf(".")),
    id,
    kind,
    mtimeMs: 0,
    name: relativePath.split(/[\\/]/u).at(-1) ?? relativePath,
    relativePath,
    searchableText: "",
    size: 0,
    title: relativePath,
    virtual: false,
  };
}
