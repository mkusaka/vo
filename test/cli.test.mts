import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs } from "../src/cli.mts";

test("parseArgs keeps defaults for a simple path", () => {
  const options = parseArgs(["README.md"]);

  assert.deepEqual(options.paths, ["README.md"]);
  assert.equal(options.host, "localhost");
  assert.equal(options.port, 6276);
  assert.equal(options.open, true);
  assert.equal(options.recursive, true);
  assert.equal(options.gitignore, true);
  assert.equal(options.watch, true);
});

test("parseArgs handles bind, port, no-recursive, no-gitignore, no-watch, and no-open", () => {
  const options = parseArgs([
    "--bind",
    "127.0.0.1",
    "--port=7000",
    "--no-recursive",
    "--no-gitignore",
    "--no-watch",
    "--no-open",
    "docs",
  ]);

  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.port, 7000);
  assert.equal(options.recursive, false);
  assert.equal(options.gitignore, false);
  assert.equal(options.watch, false);
  assert.equal(options.open, false);
  assert.deepEqual(options.paths, ["docs"]);
});
