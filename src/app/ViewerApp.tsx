import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useReducer,
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
import type { FileMetadata, SupportedKind } from "../types.mts";
import { fileKindShortLabel, fileKindTitle } from "./file-kind.mts";
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

type ViewerState = {
  files: FileMetadata[];
  html: string;
  isDragging: boolean;
  mode: SearchMode;
  query: string;
  requestedPath?: string;
  selectedId?: string;
  source?: SourcePayload;
  status: string;
  themeMode: ThemeMode;
  viewMode: ViewMode;
};

type ViewerAction =
  | { type: "document-loaded"; html: string }
  | { type: "dragging-changed"; isDragging: boolean }
  | { type: "files-loaded"; files: FileMetadata[]; status?: string }
  | { type: "mode-changed"; mode: SearchMode }
  | { type: "query-changed"; query: string }
  | { type: "requested-path-changed"; requestedPath?: string }
  | { type: "selected-id-changed"; selectedId?: string }
  | { type: "selected-file-chosen"; selectedId: string }
  | { type: "source-loaded"; source?: SourcePayload }
  | {
    type: "source-updated";
    files: FileMetadata[];
    html: string;
    source: SourcePayload;
    status: string;
  }
  | { type: "status-changed"; status: string }
  | { type: "theme-mode-changed"; themeMode: ThemeMode }
  | { type: "view-mode-changed"; viewMode: ViewMode };

export function ViewerApp() {
  const {
    files,
    html,
    mode,
    query,
    dispatch,
    results,
    searchInputRef,
    selectFile,
    selected,
    selectedId,
    source,
    status,
    themeMode,
    updateSelectedSource,
    viewerClassName,
    viewMode,
  } = useViewerController();
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);

  return (
    <main
      className={isSidebarMinimized ? `${viewerClassName} sidebar-minimized` : viewerClassName}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          dispatch({ isDragging: false, type: "dragging-changed" });
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        dispatch({ isDragging: true, type: "dragging-changed" });
      }}
      onDrop={(event) => {
        void handleDrop(event, dispatch);
        dispatch({ isDragging: false, type: "dragging-changed" });
      }}
      onKeyDown={(event) => handleShortcut(event, searchInputRef, dispatch)}
    >
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-main">
            <div className="product-name">vo</div>
            <div className="file-count">{files.length} files</div>
          </div>
          <div className="sidebar-header-actions">
            <div className="status">{status}</div>
            <button
              aria-label={isSidebarMinimized ? "サイドバーを展開" : "サイドバーを折りたたむ"}
              className="sidebar-toggle"
              onClick={() => setIsSidebarMinimized((v) => !v)}
              title={isSidebarMinimized ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              <ChevronIcon direction={isSidebarMinimized ? "right" : "left"} />
            </button>
          </div>
        </div>

        <div className="search-panel">
          <div className="search-tabs" role="tablist" aria-label="Search mode">
            <button
              aria-selected={mode === "filename"}
              className={mode === "filename" ? "active" : ""}
              onClick={() => dispatch({ mode: "filename", type: "mode-changed" })}
              type="button"
            >
              Files
            </button>
            <button
              aria-selected={mode === "text"}
              className={mode === "text" ? "active" : ""}
              onClick={() => dispatch({ mode: "text", type: "mode-changed" })}
              type="button"
            >
              Text
            </button>
          </div>
          <input
            ref={searchInputRef}
            aria-label="Search"
            onChange={(event) => dispatch({
              query: event.target.value,
              type: "query-changed",
            })}
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
              onCopyFailed={(error) => dispatch({
                status: formatError(error),
                type: "status-changed",
              })}
              path={selected?.relativePath}
            />
          </div>
          <div className="preview-actions">
            <ThemeToggle
              mode={themeMode}
              onChange={(nextThemeMode) => dispatch({
                themeMode: nextThemeMode,
                type: "theme-mode-changed",
              })}
            />
            <ViewModeTabs
              mode={viewMode}
              onChange={(nextViewMode) => dispatch({
                type: "view-mode-changed",
                viewMode: nextViewMode,
              })}
            />
            {selected ? (
              <dl aria-label="File metadata">
                <div>
                  <dt className="visually-hidden">Type</dt>
                  <dd>
                    <FileKindBadge kind={selected.kind} />
                  </dd>
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

type ViewerController = ViewerState & {
  dispatch: (action: ViewerAction) => void;
  results: SearchResult[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  selectFile(id: string): void;
  selected?: FileMetadata;
  updateSelectedSource(id: string, content: string): Promise<SourcePayload>;
  viewerClassName: string;
};

function useViewerController(): ViewerController {
  const [state, dispatch] = useReducer(
    viewerReducer,
    undefined,
    createInitialViewerState,
  );
  const {
    files,
    isDragging,
    mode,
    query,
    requestedPath,
    selectedId,
    themeMode,
  } = state;
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    void loadFiles()
      .then((loadedFiles) => {
        if (!cancelled) {
          dispatch({ files: loadedFiles, type: "files-loaded" });
        }
      })
      .catch((error: unknown) => {
        dispatch({ status: formatError(error), type: "status-changed" });
      });

    const events = new EventSource("/api/events");
    const onFiles = (event: Event) => {
      const payload = JSON.parse((event as MessageEvent).data) as FilesPayload;

      dispatch({ files: payload.files, type: "files-loaded" });
    };
    const onError = () => {
      dispatch({ status: "connection lost", type: "status-changed" });
    };

    events.addEventListener("files", onFiles);
    events.addEventListener("error", onError);

    return () => {
      cancelled = true;
      events.removeEventListener("files", onFiles);
      events.removeEventListener("error", onError);
      events.close();
    };
  }, []);

  useEffect(() => {
    const syncRequestedPath = () => {
      dispatch({
        requestedPath: selectedPathFromSearch(window.location.search),
        type: "requested-path-changed",
      });
    };

    window.addEventListener("popstate", syncRequestedPath);

    return () => {
      window.removeEventListener("popstate", syncRequestedPath);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !event.data
        || typeof event.data !== "object"
        || event.data.type !== "vo:navigate"
        || typeof event.data.relativePath !== "string"
      ) {
        return;
      }

      const normalizedTarget = normalizeSharePath(event.data.relativePath as string);
      const targetFile = files.find(
        (file) => normalizeSharePath(file.relativePath) === normalizedTarget,
      );

      if (targetFile) {
        dispatch({ selectedId: targetFile.id, type: "selected-file-chosen" });
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [files]);

  useEffect(() => {
    const nextSelectedId = resolveSelectedId(files, requestedPath, selectedId);

    if (nextSelectedId !== selectedId) {
      dispatch({ selectedId: nextSelectedId, type: "selected-id-changed" });
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
    dispatch({ selectedId: id, type: "selected-file-chosen" });
  };
  const updateSelectedSource = async (
    id: string,
    content: string,
  ): Promise<SourcePayload> => {
    const payload = await updateSourceContent(id, content);

    dispatch({
      files: payload.files,
      html: payload.html,
      source: payload.source,
      status: "suggestion applied",
      type: "source-updated",
    });

    return payload.source;
  };

  useEffect(() => {
    if (!selected || typeof window === "undefined") {
      return;
    }

    const nextUrl = withSelectedFilePath(window.location.href, selected.relativePath);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentUrl) {
      window.history.pushState(null, "", nextUrl);
    }
  }, [selected]);

  useEffect(() => {
    if (!selectedId || !selectedRefreshKey) {
      dispatch({ html: "", type: "document-loaded" });
      return;
    }

    let cancelled = false;

    void loadDocumentHtml(selectedId)
      .then((loadedHtml) => {
        if (!cancelled) {
          dispatch({ html: loadedHtml, type: "document-loaded" });
        }
      })
      .catch((error: unknown) => {
        dispatch({ status: formatError(error), type: "status-changed" });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedRefreshKey]);

  useEffect(() => {
    if (!selectedId || !selectedRefreshKey) {
      dispatch({ source: undefined, type: "source-loaded" });
      return;
    }

    let cancelled = false;

    void loadSourcePayload(selectedId)
      .then((payload) => {
        if (!cancelled) {
          dispatch({ source: payload, type: "source-loaded" });
        }
      })
      .catch((error: unknown) => {
        dispatch({ status: formatError(error), type: "status-changed" });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedRefreshKey]);

  return {
    ...state,
    dispatch,
    results,
    searchInputRef,
    selectFile,
    selected,
    updateSelectedSource,
    viewerClassName,
  };
}

function createInitialViewerState(): ViewerState {
  return {
    files: [],
    html: "",
    isDragging: false,
    mode: "filename",
    query: "",
    requestedPath: initialSelectedPath(),
    status: "ready",
    themeMode: "light",
    viewMode: "render",
  };
}

function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case "document-loaded":
      return { ...state, html: action.html };
    case "dragging-changed":
      return { ...state, isDragging: action.isDragging };
    case "files-loaded":
      return {
        ...state,
        files: action.files,
        status: action.status ?? state.status,
      };
    case "mode-changed":
      return { ...state, mode: action.mode };
    case "query-changed":
      return { ...state, query: action.query };
    case "requested-path-changed":
      return { ...state, requestedPath: action.requestedPath };
    case "selected-id-changed":
      return { ...state, selectedId: action.selectedId };
    case "selected-file-chosen":
      return {
        ...state,
        requestedPath: undefined,
        selectedId: action.selectedId,
      };
    case "source-loaded":
      return { ...state, source: action.source };
    case "source-updated":
      return {
        ...state,
        files: action.files,
        html: action.html,
        source: action.source,
        status: action.status,
      };
    case "status-changed":
      return { ...state, status: action.status };
    case "theme-mode-changed":
      return { ...state, themeMode: action.themeMode };
    case "view-mode-changed":
      return { ...state, viewMode: action.viewMode };
  }
}

async function loadFiles(): Promise<FileMetadata[]> {
  const response = await fetch("/api/files");

  if (!response.ok) {
    throw new Error(`files request failed: ${response.status}`);
  }

  const payload = await response.json() as FilesPayload;

  return payload.files;
}

async function loadDocumentHtml(id: string): Promise<string> {
  const response = await fetch(`/api/document/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error(`document request failed: ${response.status}`);
  }

  const payload = await response.json() as DocumentPayload;

  return payload.html;
}

async function loadSourcePayload(id: string): Promise<SourcePayload> {
  const response = await fetch(`/api/source/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error(`source request failed: ${response.status}`);
  }

  return response.json() as Promise<SourcePayload>;
}

async function updateSourceContent(
  id: string,
  content: string,
): Promise<SourceUpdatePayload> {
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

  return response.json() as Promise<SourceUpdatePayload>;
}

function resolveSelectedId(
  files: readonly FileMetadata[],
  requestedPath: string | undefined,
  selectedId: string | undefined,
): string | undefined {
  if (files.length === 0) {
    return undefined;
  }

  const requestedFile = requestedPath
    ? findFileByPath(files, requestedPath)
    : undefined;

  if (requestedFile) {
    return requestedFile.id;
  }

  if (selectedId && files.some((file) => file.id === selectedId)) {
    return selectedId;
  }

  return files[0]?.id;
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
  const isSyncingSelectionRef = useRef(false);
  pathToIdRef.current = fileIdByTreePath(results.map((result) => result.file));

  const { model } = useFileTree({
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    onSelectionChange(selectedPaths) {
      if (isSyncingSelectionRef.current) {
        return;
      }

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
    isSyncingSelectionRef.current = true;

    try {
      for (const treePath of model.getSelectedPaths()) {
        model.getItem(treePath)?.deselect();
      }

      if (!normalizedSelectedPath || !paths.includes(normalizedSelectedPath)) {
        return;
      }

      model.getItem(normalizedSelectedPath)?.select();
      model.focusPath(normalizedSelectedPath);
    } finally {
      isSyncingSelectionRef.current = false;
    }
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
  onCopyFailed,
  path,
}: {
  onCopyFailed(error: unknown): void;
  path?: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | "idle">("idle");
  const copyStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copyStatusTimeoutRef.current) {
        clearTimeout(copyStatusTimeoutRef.current);
      }
    };
  }, []);

  const showCopyStatus = (status: "copied" | "failed") => {
    if (copyStatusTimeoutRef.current) {
      clearTimeout(copyStatusTimeoutRef.current);
    }

    setCopyStatus(status);
    copyStatusTimeoutRef.current = setTimeout(() => {
      setCopyStatus("idle");
      copyStatusTimeoutRef.current = undefined;
    }, 1600);
  };

  if (!path) {
    return <p>No document loaded</p>;
  }

  return (
    <div className="file-path-copy">
      <span className="file-path" title={path}>{path}</span>
      <button
        aria-label="Copy file path"
        className="file-path-copy-button"
        onClick={() => {
          if (!navigator.clipboard) {
            showCopyStatus("failed");
            onCopyFailed(new Error("clipboard unavailable"));
            return;
          }

          void navigator.clipboard.writeText(path)
            .then(() => showCopyStatus("copied"))
            .catch((error: unknown) => {
              showCopyStatus("failed");
              onCopyFailed(error);
            });
        }}
        title="Copy file path"
        type="button"
      >
        <CopyIcon />
      </button>
      <span className={`file-path-copy-feedback is-${copyStatus}`} role="status">
        {copyStatus === "copied"
          ? "Copied"
          : copyStatus === "failed"
            ? "Failed"
            : ""}
      </span>
    </div>
  );
}

function FileKindBadge({ kind }: { kind: SupportedKind }) {
  const title = `Type: ${fileKindTitle(kind)}`;

  return (
    <span
      aria-label={title}
      className={`file-kind-badge file-kind-${kind}`}
      title={title}
    >
      <FileKindIcon />
      <span>{fileKindShortLabel(kind)}</span>
    </span>
  );
}

function FileKindIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
      <path d="M4.75 1.75h4.7l3.8 3.8v8.7H4.75z" />
      <path d="M9.25 1.9v3.85h3.85" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
      <path d="M6.25 2.25h6.5v8.5h-6.5z" />
      <path d="M3.25 5.25h6.5v8.5h-6.5z" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
      {direction === "left"
        ? <path d="M10 3L6 8l4 5" />
        : <path d="M6 3l4 5-4 5" />}
    </svg>
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
  dispatch: (action: ViewerAction) => void,
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
    dispatch({ mode: "filename", type: "mode-changed" });
    inputRef.current?.focus();
  }

  if (event.key === "/") {
    event.preventDefault();
    dispatch({ mode: "text", type: "mode-changed" });
    inputRef.current?.focus();
  }
}

async function handleDrop(
  event: DragEvent<HTMLElement>,
  dispatch: (action: ViewerAction) => void,
): Promise<void> {
  event.preventDefault();

  const files = [...event.dataTransfer.files]
    .filter((file) => /\.(?:html?|md|markdown|mdx)$/iu.test(file.name));

  if (files.length === 0) {
    dispatch({ status: "no supported files", type: "status-changed" });
    return;
  }

  try {
    const result = await dropFiles(files);

    dispatch({
      files: result.files,
      status: `added ${files.length}`,
      type: "files-loaded",
    });
  } catch (error: unknown) {
    dispatch({ status: formatError(error), type: "status-changed" });
  }
}

async function dropFiles(files: File[]): Promise<FilesPayload> {
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

  return response.json() as Promise<FilesPayload>;
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
