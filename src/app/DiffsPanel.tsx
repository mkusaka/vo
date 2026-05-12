import { File as CodeFile, FileDiff } from "@pierre/diffs/react";
import {
  parseDiffFromFile,
  type DiffLineAnnotation,
  type FileContents,
  type FileDiffMetadata,
  type LineAnnotation,
  type SelectedLineRange,
} from "@pierre/diffs";
import { useEffect, useMemo, useState } from "react";

import {
  createDiffCommentAnnotations,
  createFileCommentAnnotations,
  targetFromDiffRange,
  targetFromFileRange,
  type CommentAnnotationMetadata,
  type CommentTarget,
  type LocalComment,
} from "./comment-annotations.mts";
import type { SourcePayload } from "./source-types.mts";

type DiffsPanelProps = {
  source?: SourcePayload;
  viewMode: "annotate" | "diff";
};

export default function DiffsPanel({
  source,
  viewMode,
}: DiffsPanelProps) {
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [draftBody, setDraftBody] = useState("");
  const [draftTarget, setDraftTarget] = useState<CommentTarget>();

  useEffect(() => {
    setComments([]);
    setDraftBody("");
    setDraftTarget(undefined);
  }, [source?.id]);

  useEffect(() => {
    setDraftBody("");
    setDraftTarget(undefined);
  }, [viewMode]);

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
  const lineAnnotations = useMemo<LineAnnotation<CommentAnnotationMetadata>[]>(
    () => source
      ? createFileCommentAnnotations(source.relativePath, comments, draftTarget)
      : [],
    [comments, draftTarget, source],
  );
  const diffLineAnnotations = useMemo<DiffLineAnnotation<CommentAnnotationMetadata>[]>(
    () => source
      ? createDiffCommentAnnotations(source.relativePath, comments, draftTarget)
      : [],
    [comments, draftTarget, source],
  );

  if (!source || !currentFile) {
    return <div className="empty-state">Loading</div>;
  }

  const openFileDraft = (range: SelectedLineRange) => {
    setDraftBody("");
    setDraftTarget(targetFromFileRange(range));
  };
  const openDiffDraft = (range: SelectedLineRange) => {
    setDraftBody("");
    setDraftTarget(targetFromDiffRange(range));
  };
  const cancelDraft = () => {
    setDraftBody("");
    setDraftTarget(undefined);
  };
  const submitDraft = () => {
    const body = draftBody.trim();

    if (!body || draftTarget == null) {
      return;
    }

    setComments((current) => [
      ...current,
      {
        body,
        id: `${source.id}:${current.length + 1}`,
        lineNumber: draftTarget.lineNumber,
        path: source.relativePath,
        side: draftTarget.side,
      },
    ]);
    cancelDraft();
  };
  const renderCommentAnnotation = (
    annotation: LineAnnotation<CommentAnnotationMetadata> | DiffLineAnnotation<CommentAnnotationMetadata>,
  ) => renderAnnotation(annotation, {
    draftBody,
    onCancel: cancelDraft,
    onDraftBodyChange: setDraftBody,
    onSubmit: submitDraft,
  });

  if (viewMode === "diff") {
    if (!fileDiff || fileDiff.hunks.length === 0) {
      return <div className="empty-state">No changes since load</div>;
    }

    return (
      <FileDiff<CommentAnnotationMetadata>
        className="diffs-view"
        disableWorkerPool
        fileDiff={fileDiff}
        lineAnnotations={diffLineAnnotations}
        options={{
          diffStyle: "unified",
          enableGutterUtility: true,
          lineDiffType: "word",
          lineHoverHighlight: "both",
          onGutterUtilityClick: openDiffDraft,
          overflow: "wrap",
          theme: "pierre-light",
          themeType: "light",
        }}
        renderAnnotation={renderCommentAnnotation}
      />
    );
  }

  return (
    <CodeFile<CommentAnnotationMetadata>
      className="diffs-view"
      disableWorkerPool
      file={currentFile}
      lineAnnotations={lineAnnotations}
      options={{
        enableGutterUtility: true,
        lineHoverHighlight: "both",
        onGutterUtilityClick: openFileDraft,
        overflow: "wrap",
        theme: "pierre-light",
        themeType: "light",
      }}
      renderAnnotation={renderCommentAnnotation}
    />
  );
}

type RenderAnnotationActions = {
  draftBody: string;
  onCancel(): void;
  onDraftBodyChange(value: string): void;
  onSubmit(): void;
};

function renderAnnotation(
  annotation: LineAnnotation<CommentAnnotationMetadata> | DiffLineAnnotation<CommentAnnotationMetadata>,
  actions: RenderAnnotationActions,
) {
  const target = describeAnnotationTarget(annotation.metadata);

  if (annotation.metadata.kind === "comment") {
    return (
      <div className="annotation-card">
        <div className="annotation-heading">
          <strong>Comment</strong>
          <span>{target}</span>
        </div>
        <p>{annotation.metadata.body}</p>
      </div>
    );
  }

  return (
    <div className="annotation-card annotation-composer">
      <div className="annotation-heading">
        <strong>New comment</strong>
        <span>{target}</span>
      </div>
      <textarea
        aria-label={`Comment for ${target}`}
        onChange={(event) => actions.onDraftBodyChange(event.currentTarget.value)}
        placeholder="Add a comment..."
        rows={3}
        value={actions.draftBody}
      />
      <div className="annotation-actions">
        <button
          disabled={!actions.draftBody.trim()}
          onClick={actions.onSubmit}
          type="button"
        >
          Comment
        </button>
        <button onClick={actions.onCancel} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function describeAnnotationTarget(metadata: CommentAnnotationMetadata): string {
  if (metadata.side === "additions") {
    return `Added line ${metadata.lineNumber}`;
  }

  if (metadata.side === "deletions") {
    return `Deleted line ${metadata.lineNumber}`;
  }

  return `Line ${metadata.lineNumber}`;
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
