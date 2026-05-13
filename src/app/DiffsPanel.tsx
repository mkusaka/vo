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
  appendSuggestionBlock,
  bodyWithoutSuggestionBlock,
  createDiffCommentAnnotations,
  createFileCommentAnnotations,
  parseSuggestionBlock,
  selectedTextForTarget,
  targetFromDiffRange,
  targetFromDiffToken,
  targetFromFileRange,
  targetFromFileToken,
  type CommentAnnotationMetadata,
  type CommentTarget,
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

    const suggestion = parseSuggestionBlock(body);

    setThreads((current) => [
      ...current,
      {
        body,
        charEnd: draftTarget.charEnd,
        charStart: draftTarget.charStart,
        endLineNumber: draftTarget.endLineNumber,
        endSide: draftTarget.endSide,
        id: `${activeSource.id}:${current.length + 1}`,
        kind: suggestion == null ? "comment" : "suggestion",
        lineNumber: draftTarget.lineNumber,
        path: activeSource.relativePath,
        replies: [],
        resolved: false,
        selectedText: draftTarget.selectedText,
        side: draftTarget.side,
        suggestion: suggestion == null
          ? undefined
          : {
            replacement: suggestion.replacement,
            status: "open",
          },
      },
    ]);
    cancelDraft();
  };
  const insertSuggestion = () => {
    if (draftTarget == null) {
      return;
    }

    setDraftBody((current) => appendSuggestionBlock(
      current,
      suggestionTextForTarget(activeSource, draftTarget),
    ));
  };
  const replaceSuggestion = (id: string, replacement: string) => {
    updateThread(id, (thread) => ({
      ...thread,
      body: replaceSuggestionBlock(thread.body, replacement),
      kind: "suggestion",
      suggestion: {
        replacement,
        status: thread.suggestion?.status ?? "open",
      },
    }));
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
  const setThreadResolved = (id: string, resolved: boolean) => {
    updateThread(id, (thread) => ({ ...thread, resolved }));
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
    onCancel: cancelDraft,
    onDraftBodyChange: setDraftBody,
    onInsertSuggestion: insertSuggestion,
    onReply: addReply,
    onReplyBodyChange(id, value) {
      setReplyDrafts((current) => ({
        ...current,
        [id]: value,
      }));
    },
    onResolve: setThreadResolved,
    onSuggestionChange: replaceSuggestion,
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
    setDraftTarget(nextTarget);
    setSelectedLines(selectedRangeFromTarget(nextTarget));
  }

  function resetDraft() {
    setDraftBody("");
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
  onCancel(): void;
  onDraftBodyChange(value: string): void;
  onInsertSuggestion(): void;
  onReply(id: string): void;
  onReplyBodyChange(id: string, value: string): void;
  onResolve(id: string, resolved: boolean): void;
  onSubmit(): void;
  onSuggestionChange(id: string, replacement: string): void;
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
    const commentBody = bodyWithoutSuggestionBlock(thread.body);

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

        {commentBody ? <p>{commentBody}</p> : null}
        <SelectedTextPreview metadata={annotation.metadata} />
        <SuggestionBlock
          onChange={(replacement) => actions.onSuggestionChange(thread.id, replacement)}
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

  const hasSuggestion = parseSuggestionBlock(actions.draftBody) != null;

  return (
    <div className="annotation-card annotation-composer">
      <div className="annotation-heading">
        <strong>New review</strong>
        <span>{target}</span>
      </div>
      <SelectedTextPreview metadata={annotation.metadata} />
      <textarea
        aria-label={`Comment for ${target}`}
        onChange={(event) => actions.onDraftBodyChange(event.currentTarget.value)}
        placeholder="Leave a comment..."
        rows={hasSuggestion ? 8 : 4}
        value={actions.draftBody}
      />
      <div className="annotation-actions">
        <button
          disabled={hasSuggestion}
          onClick={actions.onInsertSuggestion}
          type="button"
        >
          Make suggestion
        </button>
        <button
          disabled={!actions.draftBody.trim()}
          onClick={actions.onSubmit}
          type="button"
        >
          Add review comment
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
  onChange,
  onStatusChange,
  thread,
}: {
  onChange(replacement: string): void;
  onStatusChange(status: SuggestionStatus): void;
  thread: ReviewThread;
}) {
  if (!thread.suggestion) {
    return null;
  }

  return (
    <div className="annotation-suggestion-block">
      <div className="annotation-heading">
        <strong>Suggested change</strong>
        <span>{suggestionStatusLabel(thread.suggestion.status)}</span>
      </div>
      <div className="suggestion-diff">
        <pre data-kind="old">{thread.selectedText ?? ""}</pre>
        <textarea
          aria-label="Suggested replacement"
          className="annotation-suggestion-input"
          onChange={(event) => onChange(event.currentTarget.value)}
          value={thread.suggestion.replacement}
        />
      </div>
      <div className="annotation-actions">
        <button
          className={thread.suggestion.status === "dismissed" ? "active" : ""}
          onClick={() => onStatusChange("dismissed")}
          type="button"
        >
          Dismiss
        </button>
        <button
          className={thread.suggestion.status === "committed" ? "active" : ""}
          onClick={() => onStatusChange("committed")}
          type="button"
        >
          Commit suggestion
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
    case "committed":
      return "committed";
    case "dismissed":
      return "dismissed";
    case "open":
      return "open";
  }
}

function replaceSuggestionBlock(body: string, replacement: string): string {
  const commentBody = bodyWithoutSuggestionBlock(body);
  const replacementBlock = appendSuggestionBlock("", replacement);

  return commentBody ? `${commentBody}\n\n${replacementBlock}` : replacementBlock;
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
