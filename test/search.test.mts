import assert from "node:assert/strict";
import test from "node:test";

import { fuzzyPathScore, searchFiles } from "../src/search.mts";
import type { FileMetadata } from "../src/types.mts";

const files: FileMetadata[] = [
  file("docs/getting-started.md", "Getting Started", "install run serve"),
  file("src/components/FileList.mdx", "File List", "React component docs"),
  file("public/index.html", "Index", "html shell"),
];

test("fuzzyPathScore supports GitHub t-style subsequence matching", () => {
  assert.ok(fuzzyPathScore("src/components/FileList.mdx", "fl") > 0);
  assert.ok(fuzzyPathScore("src/components/FileList.mdx", "zz") === 0);
});

test("searchFiles ranks filename matches", () => {
  const results = searchFiles(files, "file", "filename");

  assert.equal(results[0]?.file.relativePath, "src/components/FileList.mdx");
});

test("searchFiles searches rough full text", () => {
  const results = searchFiles(files, "serve", "text");

  assert.equal(results[0]?.file.relativePath, "docs/getting-started.md");
  assert.match(results[0]?.snippet ?? "", /serve/u);
});

function file(
  relativePath: string,
  title: string,
  searchableText: string,
): FileMetadata {
  const extension = relativePath.endsWith(".html")
    ? ".html"
    : relativePath.endsWith(".mdx")
      ? ".mdx"
      : ".md";

  return {
    extension,
    id: relativePath,
    kind: extension === ".html" ? "html" : extension === ".mdx" ? "mdx" : "markdown",
    mtimeMs: 0,
    name: relativePath.split("/").at(-1) ?? relativePath,
    relativePath,
    searchableText,
    size: searchableText.length,
    title,
    virtual: false,
  };
}
