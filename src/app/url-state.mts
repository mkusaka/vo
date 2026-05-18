const FILE_QUERY_PARAM = "file";

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
  const url = new URL(href, "http://vo.local");

  if (filePath && filePath.trim()) {
    url.searchParams.set(FILE_QUERY_PARAM, normalizeSharePath(filePath));
  } else {
    url.searchParams.delete(FILE_QUERY_PARAM);
  }

  url.hash = hash ?? "";

  return `${url.pathname}${url.search}${url.hash}`;
}

export function normalizeSharePath(filePath: string): string {
  return filePath.trim().replaceAll("\\", "/").replace(/^\/+/u, "");
}
