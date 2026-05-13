import { lstat } from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";

import {
  collectFiles,
  createVirtualSourceFile,
  extractTitle,
  isGlobPattern,
  isGitIgnored,
  isSupportedFile,
  loadSourceFile,
  loadSourceFiles,
  toSearchableText,
} from "./content.mts";
import type { FileMetadata, SourceFile, SupportedKind, WatchEntry } from "./types.mts";

export type AddPathsInput = {
  cwd: string;
  gitignore: boolean;
  paths: string[];
  recursive: boolean;
  watch: boolean;
};

export type DroppedFileInput = {
  name: string;
  content: string;
  kind?: SupportedKind;
};

type EventClient = {
  send: (event: string, data: unknown) => void;
};

export class ViewerState {
  readonly filesById = new Map<string, SourceFile>();
  readonly pathToId = new Map<string, string>();
  readonly watchers = new Map<string, FSWatcher>();
  readonly watchEntries: WatchEntry[] = [];

  readonly #clients = new Set<EventClient>();

  constructor(initialFiles: SourceFile[]) {
    for (const file of initialFiles) {
      this.upsertFile(file);
    }
  }

  get files(): SourceFile[] {
    return [...this.filesById.values()]
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  getFile(id: string): SourceFile | undefined {
    return this.filesById.get(id);
  }

  getMetadata(): FileMetadata[] {
    return this.files.map(toMetadata);
  }

  updateFileContent(id: string, content: string): SourceFile | undefined {
    const existing = this.filesById.get(id);

    if (!existing) {
      return undefined;
    }

    const nextFile: SourceFile = {
      ...existing,
      content,
      mtimeMs: Date.now(),
      searchableText: toSearchableText(content, existing.kind),
      size: Buffer.byteLength(content),
      title: extractTitle(content, existing.kind, existing.name),
    };

    this.filesById.set(id, nextFile);
    this.broadcast("file", { file: toMetadata(nextFile) });
    this.broadcast("files", { files: this.getMetadata(), changedId: id });

    return nextFile;
  }

  subscribe(client: EventClient): () => void {
    this.#clients.add(client);
    client.send("files", { files: this.getMetadata() });

    return () => {
      this.#clients.delete(client);
    };
  }

  async addPaths(input: AddPathsInput): Promise<{
    files: FileMetadata[];
    loaded: number;
    watched: WatchEntry[];
  }> {
    const filePaths = await collectFiles(input.paths, {
      cwd: input.cwd,
      gitignore: input.gitignore,
      recursive: input.recursive,
    });
    const files = await loadSourceFiles(filePaths, input.cwd);

    for (const file of files) {
      this.upsertFile(file);
    }

    if (input.watch) {
      await this.watchInputs(input);
    }

    this.broadcast("files", { files: this.getMetadata() });

    return {
      files: this.getMetadata(),
      loaded: files.length,
      watched: this.watchEntries,
    };
  }

  addDroppedFiles(inputs: DroppedFileInput[]): {
    files: FileMetadata[];
    added: number;
  } {
    for (const input of inputs) {
      this.upsertFile(createVirtualSourceFile(input));
    }

    this.broadcast("files", { files: this.getMetadata() });

    return {
      files: this.getMetadata(),
      added: inputs.length,
    };
  }

  async close(): Promise<void> {
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close()));
    this.watchers.clear();
  }

  private upsertFile(file: SourceFile): void {
    let nextFile = file;

    if (file.absolutePath) {
      const existingId = this.pathToId.get(file.absolutePath);
      const existingFile = existingId ? this.filesById.get(existingId) : undefined;

      if (existingId && existingId !== file.id) {
        this.filesById.delete(existingId);
      }

      if (existingFile) {
        nextFile = {
          ...file,
          baselineContent: existingFile.baselineContent,
        };
      }

      this.pathToId.set(file.absolutePath, file.id);
    }

    this.filesById.set(nextFile.id, nextFile);
    this.broadcast("file", { file: toMetadata(nextFile) });
  }

  private removePath(absolutePath: string): void {
    const id = this.pathToId.get(absolutePath);

    if (!id) {
      return;
    }

    this.pathToId.delete(absolutePath);
    this.filesById.delete(id);
    this.broadcast("files", { files: this.getMetadata() });
  }

  private async watchInputs(input: AddPathsInput): Promise<void> {
    const targets = input.paths.length > 0 ? input.paths : ["."];

    for (const target of targets) {
      const watchTarget = await resolveWatchTarget(target, input.cwd);

      if (!watchTarget) {
        continue;
      }

      const key = `${watchTarget.path}:${watchTarget.depth ?? "all"}`;

      if (this.watchers.has(key)) {
        continue;
      }

      const watcher = chokidar.watch(watchTarget.path, {
        awaitWriteFinish: {
          pollInterval: 100,
          stabilityThreshold: 200,
        },
        depth: watchTarget.depth,
        ignoreInitial: true,
        ignored: (candidate, stats) => {
          const basename = path.basename(candidate);

          if (basename === ".git" || basename === "node_modules") {
            return true;
          }

          return Boolean(stats?.isFile() && !isSupportedFile(candidate));
        },
      });

      watcher
        .on("add", (changedPath) => {
          void this.reloadPath(changedPath, input.cwd, input.gitignore);
        })
        .on("change", (changedPath) => {
          void this.reloadPath(changedPath, input.cwd, input.gitignore);
        })
        .on("unlink", (changedPath) => {
          this.removePath(path.resolve(changedPath));
        })
        .on("error", (error) => {
          this.broadcast("error", {
            message: error instanceof Error ? error.message : String(error),
          });
        });

      this.watchers.set(key, watcher);
      this.watchEntries.push({ pattern: key });
    }
  }

  private async reloadPath(
    changedPath: string,
    cwd: string,
    gitignore: boolean,
  ): Promise<void> {
    const absolutePath = path.resolve(changedPath);

    if (!isSupportedFile(absolutePath)) {
      return;
    }

    try {
      if (await isGitIgnored(absolutePath, cwd, gitignore)) {
        return;
      }

      const file = await loadSourceFile(absolutePath, cwd);

      if (!file) {
        return;
      }

      this.upsertFile(file);
      this.broadcast("files", { files: this.getMetadata(), changedId: file.id });
    } catch (error) {
      this.broadcast("error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private broadcast(event: string, data: unknown): void {
    for (const client of this.#clients) {
      client.send(event, data);
    }
  }
}

async function resolveWatchTarget(
  input: string,
  cwd: string,
): Promise<{ path: string; depth?: number } | undefined> {
  if (isGlobPattern(input)) {
    return {
      path: globWatchBase(input, cwd),
    };
  }

  const resolved = path.resolve(cwd, input);

  try {
    const stat = await lstat(resolved);

    if (stat.isDirectory()) {
      return { path: resolved };
    }

    if (stat.isFile()) {
      return { path: resolved, depth: 0 };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function globWatchBase(input: string, cwd: string): string {
  const segments = input.split(/[\\/]/u);
  const baseSegments: string[] = [];

  for (const segment of segments) {
    if (isGlobPattern(segment)) {
      break;
    }

    baseSegments.push(segment);
  }

  return path.resolve(cwd, baseSegments.length > 0 ? baseSegments.join(path.sep) : ".");
}

function toMetadata(file: SourceFile): FileMetadata {
  return {
    id: file.id,
    name: file.name,
    relativePath: file.relativePath,
    extension: file.extension,
    kind: file.kind,
    size: file.size,
    mtimeMs: file.mtimeMs,
    title: file.title,
    searchableText: file.searchableText,
    virtual: file.virtual,
  };
}
