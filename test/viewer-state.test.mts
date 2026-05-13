import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ViewerState } from "../src/viewer-state.mts";

test("ViewerState keeps the first loaded content as diff baseline", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vo-state-"));
  const markdown = path.join(directory, "guide.md");

  try {
    await writeFile(markdown, "# First");

    const state = new ViewerState([]);
    const firstLoad = await state.addPaths({
      cwd: directory,
      gitignore: false,
      paths: ["guide.md"],
      recursive: true,
      watch: false,
    });
    const id = firstLoad.files[0]?.id;
    assert.ok(id);

    await writeFile(markdown, "# Second");
    await state.addPaths({
      cwd: directory,
      gitignore: false,
      paths: ["guide.md"],
      recursive: true,
      watch: false,
    });

    const file = state.getFile(id);
    assert.equal(file?.baselineContent, "# First");
    assert.equal(file?.content, "# Second");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ViewerState updates in-session content without changing the baseline", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "vo-state-"));
  const markdown = path.join(directory, "guide.md");

  try {
    await writeFile(markdown, "# First\n\nBody");

    const state = new ViewerState([]);
    const firstLoad = await state.addPaths({
      cwd: directory,
      gitignore: false,
      paths: ["guide.md"],
      recursive: true,
      watch: false,
    });
    const id = firstLoad.files[0]?.id;
    assert.ok(id);

    const updated = state.updateFileContent(id, "# Second\n\nUpdated body");

    assert.equal(updated?.baselineContent, "# First\n\nBody");
    assert.equal(updated?.content, "# Second\n\nUpdated body");
    assert.equal(updated?.title, "Second");
    assert.equal(updated?.searchableText, "Second Updated body");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
