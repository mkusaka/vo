#!/usr/bin/env node
import { run } from "./cli.mts";

try {
  await run(process.argv.slice(2), process.cwd());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`vo: ${message}\n`);
  process.exitCode = 1;
}
