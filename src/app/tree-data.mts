import type { FileMetadata } from "../types.mts";

export function toTreePaths(files: readonly FileMetadata[]): string[] {
  return [...new Set(files.map((file) => normalizeTreePath(file.relativePath)))]
    .sort((left, right) => left.localeCompare(right));
}

export function directoryPrefixes(paths: readonly string[]): string[] {
  const prefixes = new Set<string>();

  for (const treePath of paths) {
    const segments = treePath.split("/").filter(Boolean);

    for (let index = 1; index < segments.length; index += 1) {
      prefixes.add(`${segments.slice(0, index).join("/")}/`);
    }
  }

  return [...prefixes].sort((left, right) => left.localeCompare(right));
}

export function fileIdByTreePath(files: readonly FileMetadata[]): Map<string, string> {
  return new Map(
    files.map((file) => [normalizeTreePath(file.relativePath), file.id]),
  );
}

function normalizeTreePath(value: string): string {
  return value.replaceAll("\\", "/");
}
