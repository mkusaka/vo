import { collectFiles, loadSourceFiles } from "./content.mts";
import { startViewerAppServer } from "./app-server.mts";
import {
  addToRunningSession,
  clearRunningSession,
  createSessionToken,
  probeRunningSession,
  readRunningSession,
  writeRunningSession,
  type RunningSession,
} from "./runtime-session.mts";
import type { CliOptions } from "./types.mts";
import { ViewerState } from "./viewer-state.mts";

const DEFAULT_PORT = 6276;
const DEFAULT_HOST = "localhost";

export async function run(argv: string[], cwd: string): Promise<void> {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  if (options.version) {
    process.stdout.write("0.1.0\n");
    return;
  }

  const runningSession = await readRunningSession();

  if (runningSession && await probeRunningSession(runningSession)) {
    const addResult = await addToRunningSession(runningSession, {
      cwd,
      gitignore: options.gitignore,
      paths: options.paths,
      recursive: options.recursive,
      watch: options.watch,
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify({
        existing: true,
        result: addResult,
        url: runningSession.url,
      }, null, 2)}\n`);
    } else {
      process.stdout.write(`vo: added paths to existing session at ${runningSession.url}\n`);
    }

    return;
  }

  if (runningSession) {
    await clearRunningSession(runningSession);
  }

  const initialPaths = await collectFiles(options.paths, {
    cwd,
    gitignore: options.gitignore,
    recursive: options.recursive,
  });
  const files = await loadSourceFiles(initialPaths, cwd);
  const state = new ViewerState(files);
  const token = createSessionToken();
  const server = await startViewerAppServer({
    host: options.host,
    open: options.open,
    port: options.port,
    state,
    token,
  });

  if (options.watch) {
    await state.addPaths({
      cwd,
      gitignore: options.gitignore,
      paths: options.paths,
      recursive: options.recursive,
      watch: true,
    });
  }

  const session: RunningSession = {
    host: server.host,
    pid: process.pid,
    port: server.port,
    startedAt: new Date().toISOString(),
    token,
    url: server.url,
    version: 1,
  };

  await writeRunningSession(session);

  const summary = {
    watch: options.watch,
    url: server.url,
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      path: file.absolutePath,
      kind: file.kind,
    })),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`vo: serving ${files.length} file(s) at ${server.url}\n`);
  }

  await waitForShutdown(async () => {
    await clearRunningSession(session);
    await server.close();
  });
}

type ParsedArgs = CliOptions & {
  help: boolean;
  version: boolean;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const options: ParsedArgs = {
    paths: [],
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    open: true,
    recursive: true,
    gitignore: true,
    watch: true,
    json: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--version") {
      options.version = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--open") {
      options.open = true;
      continue;
    }

    if (arg === "--no-open") {
      options.open = false;
      continue;
    }

    if (arg === "-R" || arg === "--recursive") {
      options.recursive = true;
      continue;
    }

    if (arg === "--no-recursive") {
      options.recursive = false;
      continue;
    }

    if (arg === "--gitignore") {
      options.gitignore = true;
      continue;
    }

    if (arg === "--no-gitignore") {
      options.gitignore = false;
      continue;
    }

    if (arg === "--watch") {
      options.watch = true;
      continue;
    }

    if (arg === "--no-watch") {
      options.watch = false;
      continue;
    }

    if (arg === "-p" || arg === "--port") {
      options.port = parsePort(readValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      options.port = parsePort(arg.slice("--port=".length));
      continue;
    }

    if (arg === "-b" || arg === "--bind" || arg === "--host") {
      options.host = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--bind=")) {
      options.host = arg.slice("--bind=".length);
      continue;
    }

    if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
      continue;
    }

    if (arg.startsWith("-") && arg !== "-") {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.paths.push(arg);
  }

  return options;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return port;
}

function waitForShutdown(close: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    let closed = false;

    const shutdown = (): void => {
      if (closed) {
        return;
      }

      closed = true;
      close().then(resolve, reject);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

function helpText(): string {
  return `vo - local HTML / Markdown / MDX viewer

Usage:
  vo [files-or-directories] [options]

Options:
  -p, --port <port>      Port to bind (default: ${DEFAULT_PORT})
  -b, --bind <host>      Host to bind (default: ${DEFAULT_HOST})
  -R, --recursive        Read directories recursively (default)
      --no-recursive     Read only direct children of directories
      --gitignore        Respect .gitignore rules (default)
      --no-gitignore     Include files ignored by .gitignore
      --open             Open the viewer in a browser
      --no-open          Do not open a browser
      --watch            Watch loaded paths for changes (default)
      --no-watch         Disable document watching
      --json             Print startup metadata as JSON
  -h, --help             Show help
      --version          Show version
`;
}
