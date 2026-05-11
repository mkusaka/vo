import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

import { renderDocument } from "./render.mts";
import { getSessionToken, getViewerState } from "./session-state.mts";
import type { DroppedFileInput } from "./viewer-state.mts";

const require = createRequire(import.meta.url);
const MAX_JSON_BODY_BYTES = 50 * 1024 * 1024;

export function voApiPlugin(): Plugin {
  return {
    name: "vo-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleRequest(req, res);

          if (!handled) {
            next();
          }
        } catch (error) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (!req.url) {
    return false;
  }

  const url = new URL(req.url, "http://vo.local");

  if (url.pathname === "/api/files" && req.method === "GET") {
    sendJson(res, 200, { files: getViewerState().getMetadata() });
    return true;
  }

  if (url.pathname.startsWith("/api/document/") && req.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice("/api/document/".length));
    const file = getViewerState().getFile(id);

    if (!file) {
      sendJson(res, 404, { error: "file not found" });
      return true;
    }

    sendJson(res, 200, {
      html: renderDocument(file, requestOrigin(req)),
      id: file.id,
    });
    return true;
  }

  if (url.pathname === "/api/drop" && req.method === "POST") {
    const dropped = asDroppedFiles(await readJson(req));
    sendJson(res, 200, getViewerState().addDroppedFiles(dropped));
    return true;
  }

  if (url.pathname === "/api/events" && req.method === "GET") {
    sendEvents(req, res);
    return true;
  }

  if (url.pathname === "/api/session" && req.method === "GET") {
    if (!hasValidToken(req)) {
      sendJson(res, 401, { error: "unauthorized" });
      return true;
    }

    sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/session/add" && req.method === "POST") {
    if (!hasValidToken(req)) {
      sendJson(res, 401, { error: "unauthorized" });
      return true;
    }

    const input = asAddPathsInput(await readJson(req));
    sendJson(res, 200, await getViewerState().addPaths(input));
    return true;
  }

  if (url.pathname.startsWith("/api/asset/") && req.method === "GET") {
    await sendAsset(url.pathname, res);
    return true;
  }

  if (url.pathname === "/api/vendor/mermaid.esm.min.mjs" && req.method === "GET") {
    await sendMermaid(res);
    return true;
  }

  return url.pathname.startsWith("/api/");
}

function sendEvents(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  });

  const unsubscribe = getViewerState().subscribe({
    send(event, data) {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
  });

  req.on("close", unsubscribe);
}

async function sendAsset(pathname: string, res: ServerResponse): Promise<void> {
  const [, , , encodedId, ...segments] = pathname.split("/");
  const id = decodeURIComponent(encodedId ?? "");
  const file = getViewerState().getFile(id);

  if (!file?.absolutePath || segments.length === 0) {
    sendJson(res, 404, { error: "asset not found" });
    return;
  }

  const baseDirectory = path.dirname(file.absolutePath);
  const requested = path.resolve(
    baseDirectory,
    segments.map((segment) => decodeURIComponent(segment)).join(path.sep),
  );
  const relative = path.relative(baseDirectory, requested);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendJson(res, 403, { error: "asset path escapes document directory" });
    return;
  }

  try {
    const body = await readFile(requested);
    res.writeHead(200, {
      "content-type": contentType(requested),
    });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "asset not found" });
  }
}

async function sendMermaid(res: ServerResponse): Promise<void> {
  const filePath = require.resolve("mermaid/dist/mermaid.esm.min.mjs");
  const body = await readFile(filePath, "utf8");

  res.writeHead(200, {
    "access-control-allow-origin": "*",
    "content-type": "text/javascript; charset=utf-8",
  });
  res.end(body);
}

function hasValidToken(req: IncomingMessage): boolean {
  const token = getSessionToken();

  if (!token) {
    return true;
  }

  return req.headers["x-vo-token"] === token;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;

    if (size > MAX_JSON_BODY_BYTES) {
      throw new Error("request body is too large");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function asDroppedFiles(value: unknown): DroppedFileInput[] {
  if (
    !value
    || typeof value !== "object"
    || !Array.isArray((value as { files?: unknown }).files)
  ) {
    throw new Error("drop request must contain files");
  }

  return (value as { files: unknown[] }).files.map((file) => {
    if (
      !file
      || typeof file !== "object"
      || typeof (file as { name?: unknown }).name !== "string"
      || typeof (file as { content?: unknown }).content !== "string"
    ) {
      throw new Error("dropped file must contain name and content");
    }

    return {
      content: (file as { content: string }).content,
      name: (file as { name: string }).name,
    };
  });
}

function asAddPathsInput(value: unknown): {
  cwd: string;
  paths: string[];
  recursive: boolean;
  watch: boolean;
} {
  if (!value || typeof value !== "object") {
    throw new Error("add request must be an object");
  }

  const input = value as {
    cwd?: unknown;
    paths?: unknown;
    recursive?: unknown;
    watch?: unknown;
  };

  if (
    typeof input.cwd !== "string"
    || !Array.isArray(input.paths)
    || !input.paths.every((item) => typeof item === "string")
    || typeof input.recursive !== "boolean"
    || typeof input.watch !== "boolean"
  ) {
    throw new Error("add request has invalid shape");
  }

  return {
    cwd: input.cwd,
    paths: input.paths,
    recursive: input.recursive,
    watch: input.watch,
  };
}

function requestOrigin(req: IncomingMessage): string {
  const host = req.headers.host ?? "localhost";
  const protocol = typeof req.headers["x-forwarded-proto"] === "string"
    ? req.headers["x-forwarded-proto"]
    : "http";

  return `${protocol}://${host}`;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(`${JSON.stringify(body)}\n`);
}

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
