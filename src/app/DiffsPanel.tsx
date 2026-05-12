import { File as CodeFile, FileDiff } from "@pierre/diffs/react";
import {
  parseDiffFromFile,
  type DiffLineAnnotation,
  type DiffTokenEventBaseProps,
  type FileContents,
  type FileDiffMetadata,
  type LineAnnotation,
  type SelectedLineRange,
  type TokenEventBase,
} from "@pierre/diffs";
import { useEffect, useMemo, useState } from "react";

import {
  createDiffCommentAnnotations,
  createFileCommentAnnotations,
  selectedTextForTarget,
  targetFromDiffRange,
  targetFromDiffToken,
  targetFromFileRange,
  targetFromFileToken,
  type CommentAnnotationMetadata,
  type CommentTarget,
  type ReviewKind,
  type ReviewThread,
  type SuggestionStatus,
} from "./comment-annotations.mts";
import type { SourcePayload } from "./source-types.mts";

type DiffsPanelProps = {
  source?: SourcePayload;
  themeMode: "dark" | "light";
  viewMode: "annotate" | "diff";
};

export default function DiffsPanel({
  source,
  themeMode,
  viewMode,
}: DiffsPanelProps) {
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [draftBody, setDraftBody] = useState("");
  const [draftKind, setDraftKind] = useState<ReviewKind>("comment");
  const [draftSuggestion, setDraftSuggestion] = useState("");
  const [draftTarget, setDraftTarget] = useState<CommentTarget>();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null);

  useEffect(() => {
    setThreads([]);
    resetDraft();
    setReplyDrafts({});
    setSelectedLines(null);
  }, [source?.id]);

  useEffect(() => {
    resetDraft();
    setSelectedLines(null);
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
      ? createFileCommentAnnotations(source.relativePath, threads, draftTarget)
      : [],
    [draftTarget, source, threads],
  );
  const diffLineAnnotations = useMemo<DiffLineAnnotation<CommentAnnotationMetadata>[]>(
    () => source
      ? createDiffCommentAnnotations(source.relativePath, threads, draftTarget)
      : [],
    [draftTarget, source, threads],
  );
  const diffsTheme = themeMode === "dark" ? "pierre-dark" : "pierre-light";

  if (!source || !currentFile) {
    return <div className="empty-state">Loading</div>;
  }

  const activeSource = source;
  const openFileDraft = (range: SelectedLineRange) => {
    openDraftTarget(targetFromFileRange(range));
  };
  const openDiffDraft = (range: SelectedLineRange) => {
    openDraftTarget(targetFromDiffRange(range));
  };
  const openFileTokenDraft = (token: TokenEventBase) => {
    openDraftTarget(targetFromFileToken(token));
  };
  const openDiffTokenDraft = (token: DiffTokenEventBaseProps) => {
    openDraftTarget(targetFromDiffToken(token));
  };
  const onFileLinesSelected = (range: SelectedLineRange | null) => {
    setSelectedLines(range);
    if (range != null && isMultiLineRange(range)) {
      openFileDraft(range);
    }
  };
  const onDiffLinesSelected = (range: SelectedLineRange | null) => {
    setSelectedLines(range);
    if (range != null && isMultiLineRange(range)) {
      openDiffDraft(range);
    }
  };
  const cancelDraft = () => {
    resetDraft();
    setSelectedLines(null);
  };
  const submitDraft = () => {
    const body = draftBody.trim();

    if (draftTarget == null || !body) {
      return;
    }

    setThreads((current) => [
      ...current,
      {
        body,
        charEnd: draftTarget.charEnd,
        charStart: draftTarget.charStart,
        endLineNumber: draftTarget.endLineNumber,
        endSide: draftTarget.endSide,
        id: `${activeSource.id}:${current.length + 1}`,
        kind: draftKind,
        lineNumber: draftTarget.lineNumber,
        path: activeSource.relativePath,
        replies: [],
        resolved: false,
        selectedText: draftTarget.selectedText,
        side: draftTarget.side,
        suggestion: draftKind === "suggestion"
          ? {
            replacement: draftSuggestion,
            status: "open",
          }
          : undefined,
      },
    ]);
    cancelDraft();
  };
  const setThreadResolved = (id: string, resolved: boolean) => {
    updateThread(id, (thread) => ({ ...thread, resolved }));
  };
  const setSuggestionStatus = (id: string, status: SuggestionStatus) => {
    updateThread(id, (thread) => thread.suggestion
      ? {
        ...thread,
        suggestion: {
          ...thread.suggestion,
          status,
        },
      }
      : thread);
  };
  const addReply = (id: string) => {
    const body = replyDrafts[id]?.trim();

    if (!body) {
      return;
    }

    updateThread(id, (thread) => ({
      ...thread,
      replies: [
        ...thread.replies,
        {
          body,
          id: `${id}:reply:${thread.replies.length + 1}`,
        },
      ],
    }));
    setReplyDrafts((current) => ({
      ...current,
      [id]: "",
    }));
  };
  const renderCommentAnnotation = (
    annotation: LineAnnotation<CommentAnnotationMetadata> | DiffLineAnnotation<CommentAnnotationMetadata>,
  ) => renderAnnotation(annotation, {
    draftBody,
    draftKind,
    draftSuggestion,
    onCancel: cancelDraft,
    onDraftBodyChange: setDraftBody,
    onDraftKindChange(nextKind) {
      setDraftKind(nextKind);
      if (draftTarget != null && nextKind === "suggestion" && !draftSuggestion) {
        setDraftSuggestion(suggestionTextForTarget(activeSource, draftTarget));
      }
    },
    onDraftSuggestionChange: setDraftSuggestion,
    onReply: addReply,
    onReplyBodyChange(id, value) {
      setReplyDrafts((current) => ({
        ...current,
        [id]: value,
      }));
    },
    onResolve: setThreadResolved,
    onSuggestionStatus: setSuggestionStatus,
    onSubmit: submitDraft,
    replyDrafts,
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
          enableLineSelection: true,
          lineDiffType: "char",
          lineHoverHighlight: "both",
          onGutterUtilityClick: openDiffDraft,
          onLineSelected: onDiffLinesSelected,
          onTokenClick: openDiffTokenDraft,
          overflow: "wrap",
          theme: diffsTheme,
          themeType: themeMode,
        }}
        renderAnnotation={renderCommentAnnotation}
        selectedLines={selectedLines}
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
        enableLineSelection: true,
        lineHoverHighlight: "both",
        onGutterUtilityClick: openFileDraft,
        onLineSelected: onFileLinesSelected,
        onTokenClick: openFileTokenDraft,
        overflow: "wrap",
        theme: diffsTheme,
        themeType: themeMode,
      }}
      renderAnnotation={renderCommentAnnotation}
      selectedLines={selectedLines}
    />
  );

  function openDraftTarget(target: CommentTarget) {
    const selectedText = suggestionTextForTarget(activeSource, target);
    const nextTarget = {
      ...target,
      selectedText: target.selectedText ?? selectedText,
    };

    setDraftBody("");
    setDraftKind("comment");
    setDraftSuggestion(selectedText);
    setDraftTarget(nextTarget);
    setSelectedLines(selectedRangeFromTarget(nextTarget));
  }

  function resetDraft() {
    setDraftBody("");
    setDraftKind("comment");
    setDraftSuggestion("");
    setDraftTarget(undefined);
  }

  function updateThread(
    id: string,
    update: (thread: ReviewThread) => ReviewThread,
  ) {
    setThreads((current) => current.map((thread) => (
      thread.id === id ? update(thread) : thread
    )));
  }
}

type RenderAnnotationActions = {
  draftBody: string;
  draftKind: ReviewKind;
  draftSuggestion: string;
  onCancel(): void;
  onDraftBodyChange(value: string): void;
  onDraftKindChange(kind: ReviewKind): void;
  onDraftSuggestionChange(value: string): void;
  onReply(id: string): void;
  onReplyBodyChange(id: string, value: string): void;
  onResolve(id: string, resolved: boolean): void;
  onSubmit(): void;
  onSuggestionStatus(id: string, status: SuggestionStatus): void;
  replyDrafts: Record<string, string>;
};

function renderAnnotation(
  annotation: LineAnnotation<CommentAnnotationMetadata> | DiffLineAnnotation<CommentAnnotationMetadata>,
  actions: RenderAnnotationActions,
) {
  const target = describeAnnotationTarget(annotation.metadata);

  if (annotation.metadata.kind === "thread" && annotation.metadata.thread) {
    const { thread } = annotation.metadata;

    return (
      <div className={`annotation-card annotation-${thread.kind}`}>
        <div className="annotation-thread-header">
          <div className="annotation-avatar">Y</div>
          <div>
            <strong>You</strong>
            <span>now</span>
          </div>
          <span className="annotation-target">{target}</span>
        </div>

        <p>{thread.body}</p>
        <SelectedTextPreview metadata={annotation.metadata} />
        <SuggestionBlock
          onStatusChange={(status) => actions.onSuggestionStatus(thread.id, status)}
          thread={thread}
        />

        {thread.replies.map((reply, index) => (
          <div className="annotation-reply" key={reply.id}>
            <div className="annotation-avatar">
              {index === 0 ? "A" : "M"}
            </div>
            <div>
              <strong>{index === 0 ? "Amadeus" : "Mark"}</strong>
              <span>now</span>
              <p>{reply.body}</p>
            </div>
          </div>
        ))}

        <div className="annotation-reply-composer">
          <textarea
            aria-label={`Reply to ${target}`}
            onChange={(event) => actions.onReplyBodyChange(thread.id, event.currentTarget.value)}
            placeholder="Add reply..."
            rows={2}
            value={actions.replyDrafts[thread.id] ?? ""}
          />
          <div className="annotation-actions">
            <button
              disabled={!actions.replyDrafts[thread.id]?.trim()}
              onClick={() => actions.onReply(thread.id)}
              type="button"
            >
              Reply
            </button>
            <button
              onClick={() => actions.onResolve(thread.id, true)}
              type="button"
            >
              Resolve
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="annotation-card annotation-composer">
      <div className="annotation-heading">
        <strong>New review</strong>
        <span>{target}</span>
      </div>
      <div className="annotation-mode-tabs" role="tablist" aria-label="Review type">
        <button
          aria-selected={actions.draftKind === "comment"}
          className={actions.draftKind === "comment" ? "active" : ""}
          onClick={() => actions.onDraftKindChange("comment")}
          type="button"
        >
          Comment
        </button>
        <button
          aria-selected={actions.draftKind === "suggestion"}
          className={actions.draftKind === "suggestion" ? "active" : ""}
          onClick={() => actions.onDraftKindChange("suggestion")}
          type="button"
        >
          Suggest
        </button>
      </div>
      <SelectedTextPreview metadata={annotation.metadata} />
      <textarea
        aria-label={`Comment for ${target}`}
        onChange={(event) => actions.onDraftBodyChange(event.currentTarget.value)}
        placeholder="Leave a comment..."
        rows={3}
        value={actions.draftBody}
      />
      {actions.draftKind === "suggestion" ? (
        <textarea
          aria-label={`Suggestion for ${target}`}
          className="annotation-suggestion-input"
          onChange={(event) => actions.onDraftSuggestionChange(event.currentTarget.value)}
          placeholder="Suggested replacement..."
          rows={4}
          value={actions.draftSuggestion}
        />
      ) : null}
      <div className="annotation-actions">
        <button
          disabled={!actions.draftBody.trim()}
          onClick={actions.onSubmit}
          type="button"
        >
          {actions.draftKind === "suggestion" ? "Suggest" : "Comment"}
        </button>
        <button onClick={actions.onCancel} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SelectedTextPreview({
  metadata,
}: {
  metadata: CommentAnnotationMetadata;
}) {
  if (!metadata.selectedText) {
    return null;
  }

  return (
    <pre className="annotation-selection">
      {metadata.selectedText}
    </pre>
  );
}

function SuggestionBlock({
  onStatusChange,
  thread,
}: {
  onStatusChange(status: SuggestionStatus): void;
  thread: ReviewThread;
}) {
  if (!thread.suggestion) {
    return null;
  }

  return (
    <div className="annotation-suggestion-block">
      <div className="annotation-heading">
        <strong>Suggestion</strong>
        <span>{suggestionStatusLabel(thread.suggestion.status)}</span>
      </div>
      <div className="suggestion-diff">
        <pre data-kind="old">{thread.selectedText ?? ""}</pre>
        <pre data-kind="new">{thread.suggestion.replacement}</pre>
      </div>
      <div className="annotation-actions">
        <button
          className={thread.suggestion.status === "undone" ? "active" : ""}
          onClick={() => onStatusChange("undone")}
          type="button"
        >
          Undo
        </button>
        <button
          className={thread.suggestion.status === "kept" ? "active" : ""}
          onClick={() => onStatusChange("kept")}
          type="button"
        >
          Keep
        </button>
      </div>
    </div>
  );
}

function describeAnnotationTarget(metadata: CommentAnnotationMetadata): string {
  const lineRange = metadata.lineNumber === metadata.endLineNumber
    ? `Line ${metadata.lineNumber}`
    : `Lines ${metadata.lineNumber}-${metadata.endLineNumber}`;
  const side = metadata.side === "additions"
    ? "Added"
    : metadata.side === "deletions"
      ? "Deleted"
      : undefined;
  const charRange = metadata.charStart == null || metadata.charEnd == null
    ? ""
    : `, chars ${metadata.charStart + 1}-${metadata.charEnd}`;

  return side ? `${side} ${lineRange.toLowerCase()}${charRange}` : `${lineRange}${charRange}`;
}

function selectedRangeFromTarget(target: CommentTarget): SelectedLineRange {
  return {
    end: target.endLineNumber,
    endSide: target.endSide,
    side: target.side,
    start: target.lineNumber,
  };
}

function isMultiLineRange(range: SelectedLineRange): boolean {
  return (
    range.start !== range.end
    || (
      range.side != null
      && range.endSide != null
      && range.side !== range.endSide
    )
  );
}

function suggestionTextForTarget(
  source: SourcePayload,
  target: CommentTarget,
): string {
  return selectedTextForTarget(
    target.side === "deletions" ? source.baselineContent : source.content,
    target,
  );
}

function suggestionStatusLabel(status: SuggestionStatus): string {
  switch (status) {
    case "kept":
      return "kept";
    case "open":
      return "open";
    case "undone":
      return "undone";
  }
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
