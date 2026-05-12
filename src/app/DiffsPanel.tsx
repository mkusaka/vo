import { File as CodeFile, FileDiff } from "@pierre/diffs/react";
import {
  parseDiffFromFile,
  type DiffLineAnnotation,
  type FileContents,
  type FileDiffMetadata,
  type LineAnnotation,
} from "@pierre/diffs";
import { useEffect, useMemo, useState } from "react";

import type { SourcePayload } from "./source-types.mts";

type DiffsPanelProps = {
  source?: SourcePayload;
  viewMode: "annotate" | "diff";
};

type AnnotationMetadata = {
  body: string;
  lineNumber: number;
  path: string;
};

export default function DiffsPanel({
  source,
  viewMode,
}: DiffsPanelProps) {
  const [annotationLine, setAnnotationLine] = useState(1);

  useEffect(() => {
    setAnnotationLine(1);
  }, [source?.id]);

  const lineCount = useMemo(
    () => countLines(source?.content ?? ""),
    [source?.content],
  );
  const activeLine = Math.min(annotationLine, lineCount);
  const currentFile = useMemo(
    () => source ? toFileContents(source, "current") : undefined,
    [source],
  );
  const baselineFile = useMemo(
    () => source ? toFileContents(source, "baseline") : undefined,
    [source],
  );
  const fileDiff = useMemo(
    () => createFileDiff(baselineFile, currentFile),
    [baselineFile, currentFile],
  );
  const lineAnnotations = useMemo<LineAnnotation<AnnotationMetadata>[]>(
    () => source
      ? [{
        lineNumber: activeLine,
        metadata: {
          body: `Preview comment for line ${activeLine}`,
          lineNumber: activeLine,
          path: source.relativePath,
        },
      }]
      : [],
    [activeLine, source],
  );
  const diffLineAnnotations = useMemo<DiffLineAnnotation<AnnotationMetadata>[]>(
    () => source
      ? [{
        lineNumber: activeLine,
        metadata: {
          body: `Preview comment for line ${activeLine}`,
          lineNumber: activeLine,
          path: source.relativePath,
        },
        side: "additions",
      }]
      : [],
    [activeLine, source],
  );

  if (!source || !currentFile) {
    return <div className="empty-state">Loading</div>;
  }

  if (viewMode === "diff") {
    if (!fileDiff || fileDiff.hunks.length === 0) {
      return <div className="empty-state">No changes since load</div>;
    }

    return (
      <FileDiff<AnnotationMetadata>
        className="diffs-view"
        disableWorkerPool
        fileDiff={fileDiff}
        lineAnnotations={diffLineAnnotations}
        options={{
          diffStyle: "unified",
          lineDiffType: "word",
          lineHoverHighlight: "both",
          onLineClick: ({ annotationSide, lineNumber }) => {
            if (annotationSide === "additions") {
              setAnnotationLine(lineNumber);
            }
          },
          onLineNumberClick: ({ annotationSide, lineNumber }) => {
            if (annotationSide === "additions") {
              setAnnotationLine(lineNumber);
            }
          },
          overflow: "wrap",
          theme: "github-light",
          themeType: "light",
        }}
        renderAnnotation={renderAnnotation}
      />
    );
  }

  return (
    <CodeFile<AnnotationMetadata>
      className="diffs-view"
      disableWorkerPool
      file={currentFile}
      lineAnnotations={lineAnnotations}
      options={{
        lineHoverHighlight: "both",
        onLineClick: ({ lineNumber }) => setAnnotationLine(lineNumber),
        onLineNumberClick: ({ lineNumber }) => setAnnotationLine(lineNumber),
        overflow: "wrap",
        theme: "github-light",
        themeType: "light",
      }}
      renderAnnotation={renderAnnotation}
    />
  );
}

function renderAnnotation(annotation: LineAnnotation<AnnotationMetadata> | DiffLineAnnotation<AnnotationMetadata>) {
  return (
    <div className="annotation-preview">
      <strong>Annotation</strong>
      <span>{annotation.metadata.body}</span>
    </div>
  );
}

function createFileDiff(
  baselineFile: FileContents | undefined,
  currentFile: FileContents | undefined,
): FileDiffMetadata | undefined {
  if (!baselineFile || !currentFile) {
    return undefined;
  }

  try {
    return parseDiffFromFile(baselineFile, currentFile);
  } catch {
    return undefined;
  }
}

function toFileContents(
  source: SourcePayload,
  version: "baseline" | "current",
): FileContents {
  const contents = version === "baseline"
    ? source.baselineContent
    : source.content;

  return {
    cacheKey: `${source.id}:${version}:${source.mtimeMs}:${contents.length}`,
    contents,
    name: source.relativePath,
  };
}

function countLines(value: string): number {
  if (!value) {
    return 1;
  }

  return value.split(/\r\n|\r|\n/u).length;
}
