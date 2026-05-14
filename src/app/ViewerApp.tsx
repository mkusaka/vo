import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  searchFiles,
  type SearchMode,
  type SearchResult,
} from "../search.mts";
import type { FileMetadata } from "../types.mts";
import type { SourcePayload } from "./source-types.mts";
import {
  directoryPrefixes,
  fileIdByTreePath,
  toTreePaths,
} from "./tree-data.mts";
import {
  normalizeSharePath,
  selectedPathFromSearch,
  withSelectedFilePath,
} from "./url-state.mts";

const DiffsPanel = lazy(() => import("./DiffsPanel.tsx"));

type FilesPayload = {
  files: FileMetadata[];
};

type DocumentPayload = {
  html: string;
  id: string;
};

type SourceUpdatePayload = {
  files: FileMetadata[];
  html: string;
  source: SourcePayload;
};

type ViewMode = "render" | "annotate" | "diff";
type ThemeMode = "dark" | "light";

export function ViewerApp() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [requestedPath, setRequestedPath] = useState(initialSelectedPath);
  const [selectedId, setSelectedId] = useState<string>();
  const [html, setHtml] = useState("");
  const [source, setSource] = useState<SourcePayload>();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("filename");
  const [viewMode, setViewMode] = useState<ViewMode>("render");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [status, setStatus] = useState("ready");
  const [isDragging, setDragging] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/files")
      .then((response) => response.json() as Promise<FilesPayload>)
      .then((payload) => {
        if (!cancelled) {
          setFiles(payload.files);
        }
      })
      .catch((error: unknown) => {
        setStatus(formatError(error));
      });

    const events = new EventSource("/api/events");
    events.addEventListener("files", (event) => {
      const payload = JSON.parse(event.data) as FilesPayload;
      setFiles(payload.files);
      setStatus("updated");
    });
    events.addEventListener("error", () => {
      setStatus("connection lost");
    });

    return () => {
      cancelled = true;
      events.close();
    };
  }, []);

  useEffect(() => {
    const syncRequestedPath = () => {
      setRequestedPath(selectedPathFromSearch(window.location.search));
    };

    window.addEventListener("popstate", syncRequestedPath);

    return () => {
      window.removeEventListener("popstate", syncRequestedPath);
    };
  }, []);

  useEffect(() => {
    if (files.length === 0) {
      setSelectedId(undefined);
      return;
    }

    const requestedFile = requestedPath
      ? findFileByPath(files, requestedPath)
      : undefined;

    if (requestedFile && requestedFile.id !== selectedId) {
      setSelectedId(requestedFile.id);
      return;
    }

    if (!selectedId || !files.some((file) => file.id === selectedId)) {
      setSelectedId(files[0]?.id);
    }
  }, [files, requestedPath, selectedId]);

  const results = useMemo(
    () => searchFiles(files, query, mode),
    [files, mode, query],
  );
  const selected = files.find((file) => file.id === selectedId);
  const selectedRefreshKey = selected
    ? `${selected.id}:${selected.mtimeMs}`
    : undefined;
  const viewerClassName = [
    "viewer",
    `theme-${themeMode}`,
    isDragging ? "is-dragging" : "",
  ].filter(Boolean).join(" ");
  const selectFile = (id: string) => {
    const file = files.find((candidate) => candidate.id === id);

    if (file) {
      setRequestedPath(normalizeSharePath(file.relativePath));
    }

    setSelectedId(id);
  };
  const updateSelectedSource = async (
    id: string,
    content: string,
  ): Promise<SourcePayload> => {
    const response = await fetch(`/api/source/${encodeURIComponent(id)}`, {
      body: JSON.stringify({ content }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });

    if (!response.ok) {
      throw new Error(`source update failed: ${response.status}`);
    }

    const payload = await response.json() as SourceUpdatePayload;

    setFiles(payload.files);
    setHtml(payload.html);
    setSource(payload.source);
    setStatus("suggestion applied");

    return payload.source;
  };

  useEffect(() => {
    if (!selected || typeof window === "undefined") {
      return;
    }

    const nextUrl = withSelectedFilePath(window.location.href, selected.relativePath);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [selected]);

  useEffect(() => {
    if (!selectedId || !selectedRefreshKey) {
      setHtml("");
      return;
    }

    let cancelled = false;

    fetch(`/api/document/${encodeURIComponent(selectedId)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`document request failed: ${response.status}`);
        }

        return response.json() as Promise<DocumentPayload>;
      })
      .then((payload) => {
        if (!cancelled) {
          setHtml(payload.html);
        }
      })
      .catch((error: unknown) => {
        setStatus(formatError(error));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedRefreshKey]);

  useEffect(() => {
    if (!selectedId || !selectedRefreshKey) {
      setSource(undefined);
      return;
    }

    let cancelled = false;

    fetch(`/api/source/${encodeURIComponent(selectedId)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`source request failed: ${response.status}`);
        }

        return response.json() as Promise<SourcePayload>;
      })
      .then((payload) => {
        if (!cancelled) {
          setSource(payload);
        }
      })
      .catch((error: unknown) => {
        setStatus(formatError(error));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedRefreshKey]);

  return (
    <main
      className={viewerClassName}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragging(false);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={(event) => {
        void handleDrop(event, setFiles, setStatus);
        setDragging(false);
      }}
      onKeyDown={(event) => handleShortcut(event, searchInputRef, setMode)}
    >
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <div className="product-name">vo</div>
            <div className="file-count">{files.length} files</div>
          </div>
          <div className="status">{status}</div>
        </div>

        <div className="search-panel">
          <div className="search-tabs" role="tablist" aria-label="Search mode">
            <button
              aria-selected={mode === "filename"}
              className={mode === "filename" ? "active" : ""}
              onClick={() => setMode("filename")}
              type="button"
            >
              Files
            </button>
            <button
              aria-selected={mode === "text"}
              className={mode === "text" ? "active" : ""}
              onClick={() => setMode("text")}
              type="button"
            >
              Text
            </button>
          </div>
          <input
            ref={searchInputRef}
            aria-label="Search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            type="search"
            value={query}
          />
        </div>

        <div className="tree-panel">
          <TreePanel
            onSelectFile={selectFile}
            results={results}
            selectedPath={selected?.relativePath}
          />
          <TextHits
            mode={mode}
            onSelectFile={selectFile}
            query={query}
            results={results}
            selectedId={selectedId}
          />
        </div>
      </aside>

      <section className="preview">
        <header className="preview-header">
          <div className="preview-title">
            <h1>{selected?.title ?? "vo"}</h1>
            <FilePathButton
              onCopied={() => setStatus("path copied")}
              onCopyFailed={(error) => setStatus(formatError(error))}
              path={selected?.relativePath}
            />
          </div>
          <div className="preview-actions">
            <ThemeToggle mode={themeMode} onChange={setThemeMode} />
            <ViewModeTabs mode={viewMode} onChange={setViewMode} />
            {selected ? (
              <dl>
                <div>
                  <dt>Type</dt>
                  <dd>{selected.kind}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatBytes(selected.size)}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </header>

        <div className={viewMode === "render" ? "document-frame" : "document-frame code-frame"}>
          {selected ? (
            <DocumentBody
              html={html}
              selected={selected}
              selectedId={selectedId}
              source={source}
              themeMode={themeMode}
              onSourceChange={updateSelectedSource}
              viewMode={viewMode}
            />
          ) : (
            <div className="empty-state">Drop HTML, Markdown, or MDX files</div>
          )}
        </div>
      </section>
    </main>
  );
}

function TreePanel({
  onSelectFile,
  results,
  selectedPath,
}: {
  onSelectFile: (id: string) => void;
  results: SearchResult[];
  selectedPath?: string;
}) {
  const paths = useMemo(
    () => toTreePaths(results.map((result) => result.file)),
    [results],
  );
  const normalizedSelectedPath = selectedPath?.replaceAll("\\", "/");
  const pathsKey = paths.join("\0");
  const pathToIdRef = useRef(fileIdByTreePath(results.map((result) => result.file)));
  pathToIdRef.current = fileIdByTreePath(results.map((result) => result.file));

  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    onSelectionChange(selectedPaths) {
      const treePath = selectedPaths.at(-1);
      const id = treePath ? pathToIdRef.current.get(treePath) : undefined;

      if (id) {
        onSelectFile(id);
      }
    },
    paths,
  });

  useEffect(() => {
    model.resetPaths(paths, {
      initialExpandedPaths: directoryPrefixes(paths),
    });
  }, [model, paths, pathsKey]);

  useEffect(() => {
    for (const treePath of model.getSelectedPaths()) {
      model.getItem(treePath)?.deselect();
    }

    if (!normalizedSelectedPath || !paths.includes(normalizedSelectedPath)) {
      return;
    }

    model.getItem(normalizedSelectedPath)?.select();
    model.focusPath(normalizedSelectedPath);
  }, [model, normalizedSelectedPath, paths, pathsKey]);

  return (
    <FileTree
      className="tree-view"
      model={model}
      style={{ height: "100%" }}
    />
  );
}

function TextHits({
  mode,
  onSelectFile,
  query,
  results,
  selectedId,
}: {
  mode: SearchMode;
  onSelectFile: (id: string) => void;
  query: string;
  results: SearchResult[];
  selectedId?: string;
}) {
  if (mode !== "text" || !query.trim()) {
    return null;
  }

  return (
    <div className="text-hits" role="listbox" aria-label="Text search results">
      {results.slice(0, 8).map((result) => (
        <button
          aria-selected={result.file.id === selectedId}
          className={result.file.id === selectedId ? "text-hit selected" : "text-hit"}
          key={result.file.id}
          onClick={() => onSelectFile(result.file.id)}
          type="button"
        >
          <span>{result.file.title}</span>
          <small>{result.snippet}</small>
        </button>
      ))}
    </div>
  );
}

function ThemeToggle({
  mode,
  onChange,
}: {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const nextMode = mode === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextMode} mode`}
      className="theme-toggle"
      onClick={() => onChange(nextMode)}
      type="button"
    >
      {mode === "dark" ? "Light" : "Dark"}
    </button>
  );
}

function ViewModeTabs({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="view-tabs" role="tablist" aria-label="Display mode">
      {(["render", "annotate", "diff"] as const).map((nextMode) => (
        <button
          aria-selected={mode === nextMode}
          className={mode === nextMode ? "active" : ""}
          key={nextMode}
          onClick={() => onChange(nextMode)}
          type="button"
        >
          {viewModeLabel(nextMode)}
        </button>
      ))}
    </div>
  );
}

function FilePathButton({
  onCopied,
  onCopyFailed,
  path,
}: {
  onCopied(): void;
  onCopyFailed(error: unknown): void;
  path?: string;
}) {
  if (!path) {
    return <p>No document loaded</p>;
  }

  return (
    <button
      className="file-path-button"
      onClick={() => {
        if (!navigator.clipboard) {
          onCopyFailed(new Error("clipboard unavailable"));
          return;
        }

        void navigator.clipboard.writeText(path)
          .then(onCopied)
          .catch(onCopyFailed);
      }}
      title="Copy file path"
      type="button"
    >
      {path}
    </button>
  );
}

function DocumentBody({
  html,
  onSourceChange,
  selected,
  selectedId,
  source,
  themeMode,
  viewMode,
}: {
  html: string;
  onSourceChange(id: string, content: string): Promise<SourcePayload>;
  selected: FileMetadata;
  selectedId?: string;
  source?: SourcePayload;
  themeMode: ThemeMode;
  viewMode: ViewMode;
}) {
  if (viewMode === "render") {
    return html ? (
      <iframe
        key={selectedId}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts"
        srcDoc={html}
        title={selected.title}
      />
    ) : (
      <div className="empty-state">Loading</div>
    );
  }

  return (
    <Suspense fallback={<div className="empty-state">Loading</div>}>
      <DiffsPanel
        onSourceChange={onSourceChange}
        source={source}
        themeMode={themeMode}
        viewMode={viewMode}
      />
    </Suspense>
  );
}

function handleShortcut(
  event: KeyboardEvent<HTMLElement>,
  inputRef: RefObject<HTMLInputElement | null>,
  setMode: (mode: SearchMode) => void,
): void {
  const target = event.target as HTMLElement | null;

  if (
    target
    && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  ) {
    return;
  }

  if (event.key === "t") {
    event.preventDefault();
    setMode("filename");
    inputRef.current?.focus();
  }

  if (event.key === "/") {
    event.preventDefault();
    setMode("text");
    inputRef.current?.focus();
  }
}

async function handleDrop(
  event: DragEvent<HTMLElement>,
  setFiles: (files: FileMetadata[]) => void,
  setStatus: (status: string) => void,
): Promise<void> {
  event.preventDefault();

  const files = [...event.dataTransfer.files]
    .filter((file) => /\.(?:html?|md|markdown|mdx)$/iu.test(file.name));

  if (files.length === 0) {
    setStatus("no supported files");
    return;
  }

  const payload = await Promise.all(
    files.map(async (file) => ({
      content: await file.text(),
      name: file.name,
    })),
  );
  const response = await fetch("/api/drop", {
    body: JSON.stringify({ files: payload }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`drop failed: ${response.status}`);
  }

  const result = await response.json() as FilesPayload;
  setFiles(result.files);
  setStatus(`added ${files.length}`);
}

function viewModeLabel(mode: ViewMode): string {
  switch (mode) {
    case "annotate":
      return "Annotate";
    case "diff":
      return "Diff";
    case "render":
      return "Render";
  }
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function initialSelectedPath(): string | undefined {
  return typeof window === "undefined"
    ? undefined
    : selectedPathFromSearch(window.location.search);
}

function findFileByPath(
  files: readonly FileMetadata[],
  requestedPath: string,
): FileMetadata | undefined {
  const normalizedRequestedPath = normalizeSharePath(requestedPath);

  return files.find((file) => (
    normalizeSharePath(file.relativePath) === normalizedRequestedPath
  ));
}
