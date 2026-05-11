import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { searchFiles, type SearchMode } from "../search.mts";
import type { FileMetadata } from "../types.mts";

type FilesPayload = {
  files: FileMetadata[];
};

type DocumentPayload = {
  html: string;
  id: string;
};

export function ViewerApp() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [html, setHtml] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("filename");
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
    if (files.length === 0) {
      setSelectedId(undefined);
      return;
    }

    if (!selectedId || !files.some((file) => file.id === selectedId)) {
      setSelectedId(files[0]?.id);
    }
  }, [files, selectedId]);

  useEffect(() => {
    if (!selectedId) {
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
  }, [selectedId]);

  const results = useMemo(
    () => searchFiles(files, query, mode),
    [files, mode, query],
  );
  const selected = files.find((file) => file.id === selectedId);

  return (
    <main
      className={isDragging ? "viewer is-dragging" : "viewer"}
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

        <div className="file-list" role="listbox" aria-label="Files">
          {results.map((result) => (
            <button
              aria-selected={result.file.id === selectedId}
              className={result.file.id === selectedId ? "file-row selected" : "file-row"}
              key={result.file.id}
              onClick={() => setSelectedId(result.file.id)}
              type="button"
            >
              <span className="file-title">{result.file.title}</span>
              <span className="file-path">{result.file.relativePath}</span>
              {result.snippet ? <span className="file-snippet">{result.snippet}</span> : null}
            </button>
          ))}
        </div>
      </aside>

      <section className="preview">
        <header className="preview-header">
          <div>
            <h1>{selected?.title ?? "vo"}</h1>
            <p>{selected?.relativePath ?? "No document loaded"}</p>
          </div>
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
        </header>

        <div className="document-frame">
          {html ? (
            <iframe
              key={selectedId}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts"
              srcDoc={html}
              title={selected?.title ?? "Document"}
            />
          ) : (
            <div className="empty-state">Drop HTML, Markdown, or MDX files</div>
          )}
        </div>
      </section>
    </main>
  );
}

function handleShortcut(
  event: KeyboardEvent<HTMLElement>,
  inputRef: React.RefObject<HTMLInputElement | null>,
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
