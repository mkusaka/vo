import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectFiles,
  detectKind,
  loadSourceFiles,
  preprocessMdx,
  toSearchableText,
} from "../src/content.mts";

test("detectKind recognizes supported file types", () => {
  assert.equal(detectKind("index.html"), "html");
  assert.equal(detectKind("README.md"), "markdown");
  assert.equal(detectKind("post.markdown"), "markdown");
  assert.equal(detectKind("page.mdx"), "mdx");
  assert.equal(detectKind("style.css"), undefined);
});

test("collectFiles expands directories recursively by default and can stay flat", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vo-content-"));

  try {
    await writeFile(path.join(directory, "index.html"), "<h1>HTML</h1>");
    await writeFile(path.join(directory, "notes.md"), "# Notes");
    await writeFile(path.join(directory, "ignore.txt"), "ignore");
    await mkdir(path.join(directory, "nested"));
    await writeFile(path.join(directory, "nested", "page.mdx"), "# Page");

    const flat = await collectFiles(["."], { cwd: directory, recursive: false });
    assert.deepEqual(flat.map((file) => path.basename(file)).sort(), [
      "index.html",
      "notes.md",
    ]);

    const recursive = await collectFiles(["."], { cwd: directory, recursive: true });
    assert.deepEqual(recursive.map((file) => path.basename(file)).sort(), [
      "index.html",
      "notes.md",
      "page.mdx",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("collectFiles respects gitignore by default and can include ignored files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vo-gitignore-"));

  try {
    await writeFile(path.join(directory, ".gitignore"), "ignored.md\nnested/\n");
    await writeFile(path.join(directory, "visible.md"), "# Visible");
    await writeFile(path.join(directory, "ignored.md"), "# Ignored");
    await mkdir(path.join(directory, "nested"));
    await writeFile(path.join(directory, "nested", "hidden.mdx"), "# Hidden");

    const respected = await collectFiles(["."], {
      cwd: directory,
      gitignore: true,
      recursive: true,
    });
    assert.deepEqual(respected.map((file) => path.basename(file)), [
      "visible.md",
    ]);

    const included = await collectFiles(["."], {
      cwd: directory,
      gitignore: false,
      recursive: true,
    });
    assert.deepEqual(included.map((file) => path.basename(file)).sort(), [
      "hidden.mdx",
      "ignored.md",
      "visible.md",
    ]);

    const explicitIgnored = await collectFiles(["ignored.md"], {
      cwd: directory,
      gitignore: true,
      recursive: true,
    });
    assert.deepEqual(explicitIgnored, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loadSourceFiles extracts titles and searchable text", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vo-load-"));

  try {
    const markdown = path.join(directory, "guide.md");
    await writeFile(markdown, "---\ntags: docs\n---\n# Guide\nFind this phrase.");

    const [file] = await loadSourceFiles([markdown], directory);
    assert.equal(file?.title, "Guide");
    assert.equal(file?.baselineContent, "---\ntags: docs\n---\n# Guide\nFind this phrase.");
    assert.match(file?.searchableText ?? "", /Find this phrase/u);
    assert.match(file?.searchableText ?? "", /tags docs/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preprocessMdx strips module lines and escapes JSX", () => {
  const output = preprocessMdx(`import X from "./x";
export const meta = {};

# Title

<Callout tone="info">Hello</Callout>`);

  assert.doesNotMatch(output, /import X/u);
  assert.doesNotMatch(output, /export const meta/u);
  assert.match(output, /&lt;Callout tone=&quot;info&quot;&gt;Hello&lt;\/Callout&gt;/u);
});

test("toSearchableText removes markup noise", () => {
  const text = toSearchableText("<h1>Hello</h1><script>bad()</script><p>World</p>", "html");

  assert.match(text, /Hello/u);
  assert.match(text, /World/u);
  assert.doesNotMatch(text, /bad/u);
});
