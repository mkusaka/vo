export type SupportedKind = "html" | "markdown" | "mdx";

export type SourceFile = {
  id: string;
  absolutePath?: string;
  relativePath: string;
  name: string;
  extension: string;
  kind: SupportedKind;
  size: number;
  mtimeMs: number;
  title: string;
  baselineContent: string;
  content: string;
  searchableText: string;
  virtual: boolean;
};

export type CliOptions = {
  paths: string[];
  host: string;
  port: number;
  open: boolean;
  recursive: boolean;
  gitignore: boolean;
  watch: boolean;
  json: boolean;
};

export type FileMetadata = {
  id: string;
  name: string;
  relativePath: string;
  extension: string;
  kind: SupportedKind;
  size: number;
  mtimeMs: number;
  title: string;
  searchableText: string;
  virtual: boolean;
};

export type WatchEntry = {
  pattern: string;
};

export type StoredSession = {
  version: 1;
  files: string[];
  watches: WatchEntry[];
};
