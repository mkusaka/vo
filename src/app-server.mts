import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

import { initializeSessionState } from "./session-state.mts";
import { ViewerState } from "./viewer-state.mts";

export type StartViewerServerOptions = {
  host: string;
  port: number;
  open: boolean;
  state: ViewerState;
  token: string;
};

export type StartedViewerServer = {
  close: () => Promise<void>;
  host: string;
  port: number;
  url: string;
};

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function startViewerAppServer(
  options: StartViewerServerOptions,
): Promise<StartedViewerServer> {
  initializeSessionState({
    state: options.state,
    token: options.token,
  });

  const server = await createServer({
    configFile: path.join(projectRoot, "vite.config.ts"),
    root: projectRoot,
    server: {
      host: options.host,
      port: options.port,
      strictPort: false,
    },
  });

  await server.listen();
  const url = resolveServerUrl(server, options.host);

  if (options.open) {
    openUrl(url);
  }

  return {
    close: async () => {
      await options.state.close();
      await server.close();
    },
    host: new URL(url).hostname,
    port: Number(new URL(url).port),
    url,
  };
}

function resolveServerUrl(server: ViteDevServer, preferredHost: string): string {
  const urls = server.resolvedUrls;

  if (urls?.local.length) {
    return urls.local[0];
  }

  const address = server.httpServer?.address();

  if (typeof address === "object" && address) {
    const host = preferredHost === "0.0.0.0" ? "localhost" : preferredHost;
    return `http://${host}:${address.port}/`;
  }

  throw new Error("Vite server did not expose a listening address");
}

function openUrl(url: string): void {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}
