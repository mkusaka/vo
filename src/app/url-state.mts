const FILE_QUERY_PARAM = "file";
const VIEW_QUERY_PARAM = "view";

export type ShareViewMode = "annotate" | "diff" | "render";

export function selectedPathFromSearch(search: string): string | undefined {
  const value = new URLSearchParams(search).get(FILE_QUERY_PARAM);

  if (!value) {
    return undefined;
  }

  const normalized = normalizeSharePath(value);

  return normalized.length > 0 ? normalized : undefined;
}

export function withSelectedFilePath(
  href: string,
  filePath: string | undefined,
  hash?: string,
): string {
  return withViewerUrlState(href, {
    filePath,
    hash,
  });
}

export function viewModeFromSearch(search: string): ShareViewMode | undefined {
  const value = new URLSearchParams(search).get(VIEW_QUERY_PARAM);

  switch (value) {
    case "annotation":
    case "annotate":
      return "annotate";
    case "diff":
      return "diff";
    case "raw":
    case "render":
      return "render";
    default:
      return undefined;
  }
}

export function withViewerUrlState(
  href: string,
  {
    filePath,
    hash,
    viewMode,
  }: {
    filePath?: string;
    hash?: string | null;
    viewMode?: ShareViewMode;
  },
): string {
  const url = new URL(href, "http://vo.local");

  if (filePath && filePath.trim()) {
    url.searchParams.set(FILE_QUERY_PARAM, normalizeSharePath(filePath));
  } else {
    url.searchParams.delete(FILE_QUERY_PARAM);
  }

  if (viewMode) {
    url.searchParams.set(VIEW_QUERY_PARAM, viewModeQueryValue(viewMode));
  }

  if (hash !== undefined) {
    url.hash = hash ?? "";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function normalizeSharePath(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^\/+/u, "");
}

function viewModeQueryValue(viewMode: ShareViewMode): string {
  switch (viewMode) {
    case "annotate":
      return "annotation";
    case "diff":
      return "diff";
    case "render":
      return "raw";
  }
}
