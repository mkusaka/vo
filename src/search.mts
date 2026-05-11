import type { FileMetadata } from "./types.mts";

export type SearchMode = "filename" | "text";

export type SearchResult = {
  file: FileMetadata;
  score: number;
  snippet?: string;
};

export function searchFiles(
  files: FileMetadata[],
  query: string,
  mode: SearchMode,
): SearchResult[] {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return files.map((file, index) => ({
      file,
      score: files.length - index,
    }));
  }

  if (mode === "filename") {
    return files
      .map((file) => ({
        file,
        score: fuzzyPathScore(file.relativePath, normalizedQuery),
      }))
      .filter((result) => result.score > 0)
      .sort(compareResults);
  }

  return files
    .map((file) => {
      const haystack = normalize(`${file.title}\n${file.relativePath}\n${file.searchableText}`);
      const index = haystack.indexOf(normalizedQuery);

      return {
        file,
        score: index === -1 ? 0 : 10_000 - index,
        snippet: index === -1 ? undefined : createSnippet(file.searchableText, normalizedQuery),
      };
    })
    .filter((result) => result.score > 0)
    .sort(compareResults);
}

export function fuzzyPathScore(value: string, query: string): number {
  const path = normalize(value);
  const needle = normalize(query);

  if (!needle) {
    return 1;
  }

  if (path.includes(needle)) {
    return 20_000 - path.indexOf(needle) + basenameBoost(path, needle);
  }

  let score = 0;
  let queryIndex = 0;
  let previousMatch = -1;

  for (let index = 0; index < path.length && queryIndex < needle.length; index += 1) {
    if (path[index] !== needle[queryIndex]) {
      continue;
    }

    score += 100;

    if (index === 0 || "/._- ".includes(path[index - 1] ?? "")) {
      score += 40;
    }

    if (previousMatch + 1 === index) {
      score += 30;
    }

    previousMatch = index;
    queryIndex += 1;
  }

  if (queryIndex !== needle.length) {
    return 0;
  }

  return score + basenameBoost(path, needle);
}

function basenameBoost(value: string, query: string): number {
  const slash = value.lastIndexOf("/");
  const basename = slash === -1 ? value : value.slice(slash + 1);

  return basename.includes(query) ? 500 : 0;
}

function createSnippet(value: string, normalizedQuery: string): string {
  const normalizedValue = normalize(value);
  const index = normalizedValue.indexOf(normalizedQuery);

  if (index === -1) {
    return value.slice(0, 160);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(value.length, index + normalizedQuery.length + 100);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < value.length ? "..." : "";

  return `${prefix}${value.slice(start, end).replace(/\s+/gu, " ").trim()}${suffix}`;
}

function compareResults(left: SearchResult, right: SearchResult): number {
  return right.score - left.score
    || left.file.relativePath.localeCompare(right.file.relativePath);
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}
