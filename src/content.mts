import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  globby,
  isGitIgnored as createGitIgnoredMatcher,
} from "globby";

import type { SourceFile, SupportedKind } from "./types.mts";

const SUPPORTED_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".md",
  ".markdown",
  ".mdx",
]);

const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export function detectKind(filePath: string): SupportedKind | undefined {
  const extension = path.extname(filePath).toLowerCase();

  if (HTML_EXTENSIONS.has(extension)) {
    return "html";
  }

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "markdown";
  }

  if (extension === ".mdx") {
    return "mdx";
  }

  return undefined;
}

export function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isGlobPattern(value: string): boolean {
  return /[*?[\]{}()!+@]/u.test(value);
}

export async function collectFiles(
  inputs: string[],
  options: { cwd: string; recursive: boolean; gitignore?: boolean },
): Promise<string[]> {
  const targets = inputs.length > 0 ? inputs : ["."];
  const found = new Set<string>();
  const respectGitignore = options.gitignore ?? true;

  for (const input of targets) {
    if (isGlobPattern(input)) {
      const matches = await globby(input, {
        absolute: true,
        cwd: options.cwd,
        dot: false,
        gitignore: respectGitignore,
        ignore: ["**/.git/**", "**/node_modules/**"],
        onlyFiles: true,
        unique: true,
      });

      for (const match of matches) {
        if (isSupportedFile(match)) {
          found.add(path.resolve(match));
        }
      }

      continue;
    }

    const resolved = path.resolve(options.cwd, input);
    let stat;

    try {
      stat = await lstat(resolved);
    } catch (error) {
      throw new Error(`Cannot access ${input}: ${formatError(error)}`);
    }

    if (stat.isDirectory()) {
      const pattern = options.recursive
        ? "**/*.{html,htm,md,markdown,mdx}"
        : "*.{html,htm,md,markdown,mdx}";
      const matches = await globby(pattern, {
        absolute: true,
        cwd: resolved,
        dot: false,
        gitignore: respectGitignore,
        ignore: ["**/.git/**", "**/node_modules/**"],
        onlyFiles: true,
        unique: true,
      });

      for (const match of matches) {
        found.add(path.resolve(match));
      }

      continue;
    }

    if (
      stat.isFile()
      && isSupportedFile(resolved)
      && !(await isGitIgnored(resolved, options.cwd, respectGitignore))
    ) {
      found.add(resolved);
    }
  }

  return [...found].sort((left, right) => left.localeCompare(right));
}

export async function loadSourceFiles(
  filePaths: string[],
  cwd: string,
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];

  for (const absolutePath of filePaths) {
    const file = await loadSourceFile(absolutePath, cwd);

    if (file) {
      files.push(file);
    }
  }

  return files;
}

export async function loadSourceFile(
  absolutePath: string,
  cwd: string,
): Promise<SourceFile | undefined> {
  const kind = detectKind(absolutePath);

  if (!kind) {
    return undefined;
  }

  const [stat, content] = await Promise.all([
    lstat(absolutePath),
    readFile(absolutePath, "utf8"),
  ]);

  if (!stat.isFile()) {
    return undefined;
  }

  return createSourceFile({
    absolutePath,
    content,
    cwd,
    kind,
    mtimeMs: stat.mtimeMs,
    name: path.basename(absolutePath),
    relativePath: path.relative(cwd, absolutePath) || path.basename(absolutePath),
    size: stat.size,
    virtual: false,
  });
}

export function createVirtualSourceFile(input: {
  name: string;
  content: string;
  kind?: SupportedKind;
}): SourceFile {
  const kind = input.kind ?? detectKind(input.name) ?? "markdown";
  const now = Date.now();
  const name = path.basename(input.name);

  return createSourceFile({
    content: input.content,
    kind,
    mtimeMs: now,
    name,
    relativePath: name,
    size: Buffer.byteLength(input.content),
    virtual: true,
  });
}

export async function isGitIgnored(
  absolutePath: string,
  cwd: string,
  enabled: boolean,
): Promise<boolean> {
  if (!enabled) {
    return false;
  }

  const isIgnored = await createGitIgnoredMatcher({
    cwd,
    ignore: ["**/.git/**", "**/node_modules/**"],
  });

  return isIgnored(path.resolve(absolutePath));
}

export function preprocessMdx(content: string): string {
  return stripMdxModuleDeclarations(content)
    .replace(/<\/?[A-Z][\w.:-]*(?:\s[^<>]*)?\/?>/gu, (tag) => escapeHtml(tag));
}

function stripMdxModuleDeclarations(content: string): string {
  const lines = content.split(/\r\n|\r|\n/u);
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (/^\s*import\b/u.test(line)) {
      index = skipImportDeclaration(lines, index);
      continue;
    }

    if (/^\s*export\b/u.test(line)) {
      index = skipExportDeclaration(lines, index);
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n");
}

function skipImportDeclaration(lines: readonly string[], start: number): number {
  const firstLine = lines[start] ?? "";

  if (
    /;\s*$/u.test(firstLine)
    || /^\s*import\s+["'][^"']+["']\s*$/u.test(firstLine)
    || /\bfrom\s+["'][^"']+["']\s*;?\s*$/u.test(firstLine)
  ) {
    return start;
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    if (
      /;\s*$/u.test(lines[index] ?? "")
      || /\bfrom\s+["'][^"']+["']\s*;?\s*$/u.test(lines[index] ?? "")
    ) {
      return index;
    }
  }

  return start;
}

function skipExportDeclaration(lines: readonly string[], start: number): number {
  let depth = 0;

  for (let index = start; index < lines.length; index += 1) {
    depth += bracketDelta(lines[index] ?? "");

    if (index === start && depth <= 0) {
      return start;
    }

    if (index > start && depth <= 0) {
      return index;
    }
  }

  return start;
}

function bracketDelta(line: string): number {
  let delta = 0;

  for (const character of line) {
    if (character === "{" || character === "(" || character === "[") {
      delta += 1;
    }

    if (character === "}" || character === ")" || character === "]") {
      delta -= 1;
    }
  }

  return delta;
}

export function stripFrontmatter(content: string): {
  body: string;
  frontmatter?: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);

  if (!match) {
    return { body: content };
  }

  return {
    body: content.slice(match[0].length),
    frontmatter: match[1],
  };
}

export function toSearchableText(content: string, kind: SupportedKind): string {
  const markdown = kind === "mdx" ? preprocessMdx(content) : content;
  const { body, frontmatter } = stripFrontmatter(markdown);
  const withMetadata = frontmatter ? `${frontmatter}\n${body}` : body;

  if (kind === "html") {
    return normalizeWhitespace(stripHtml(withMetadata));
  }

  return normalizeWhitespace(stripHtml(
    withMetadata
      .replace(/```[\s\S]*?```/gu, " ")
      .replace(/`([^`]*)`/gu, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
      .replace(/[#>*_\-~|:[\]()]/gu, " "),
  ));
}

export function extractTitle(content: string, kind: SupportedKind, fallback: string): string {
  if (kind === "html") {
    const title = content.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]
      ?? content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1];

    return normalizeWhitespace(title ? stripHtml(title) : fallback);
  }

  const markdown = kind === "mdx" ? preprocessMdx(content) : content;
  const { body } = stripFrontmatter(markdown);
  const heading = body.match(/^#\s+(.+)$/mu)?.[1];

  return normalizeWhitespace(heading ?? fallback);
}

function createFileId(filePath: string): string {
  return createHash("sha1").update(path.resolve(filePath)).digest("hex").slice(0, 12);
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/giu, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'");
}

function createSourceFile(input: {
  absolutePath?: string;
  content: string;
  cwd?: string;
  kind: SupportedKind;
  mtimeMs: number;
  name: string;
  relativePath: string;
  size: number;
  virtual: boolean;
}): SourceFile {
  const idSource = input.absolutePath
    ? path.resolve(input.absolutePath)
    : `${input.name}\0${input.content}\0${input.mtimeMs}`;

  return {
    id: createFileId(idSource),
    absolutePath: input.absolutePath,
    relativePath: input.relativePath,
    name: input.name,
    extension: path.extname(input.name).toLowerCase(),
    kind: input.kind,
    size: input.size,
    mtimeMs: input.mtimeMs,
    title: extractTitle(input.content, input.kind, input.name),
    baselineContent: input.content,
    content: input.content,
    searchableText: toSearchableText(input.content, input.kind),
    virtual: input.virtual,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
