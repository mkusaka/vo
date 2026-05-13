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
  applySuggestionToContent,
  bodyWithoutSuggestionBlock,
  createDiffCommentAnnotations,
  createFileCommentAnnotations,
  parseSuggestionBlock,
  selectedTextForTarget,
  targetFromDiffRange,
  targetFromDiffToken,
  targetFromFileRange,
  targetFromFileToken,
  targetFromThread,
  type CommentAnnotationMetadata,
  type CommentTarget,
  type ReviewSuggestion,
  type ReviewThread,
  type SuggestionStatus,
} from "./comment-annotations.mts";
import type { SourcePayload } from "./source-types.mts";

type DiffsPanelProps = {
  onSourceChange(id: string, content: string): Promise<SourcePayload>;
  source?: SourcePayload;
  themeMode: "dark" | "light";
  viewMode: "annotate" | "diff";
};

export default function DiffsPanel({
  onSourceChange,
  source,
  themeMode,
  viewMode,
}: DiffsPanelProps) {
  const [threads, setThreads] = useState<ReviewThread[]>([]);
  const [draftBody, setDraftBody] = useState("");
  const [draftTarget, setDraftTarget] = useState<CommentTarget>();
  const [pendingSuggestionId, setPendingSuggestionId] = useState<string>();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(null);

  useEffect(() => {
    setThreads([]);
    resetDraft();
    setPendingSuggestionId(undefined);
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
  const replaceSuggestion = (
    threadId: string,
    replyId: string | undefined,
    replacement: string,
  ) => {
    updateSuggestion(threadId, replyId, (suggestion) => ({
      ...suggestion,
      replacement,
      status: suggestion.status === "applied" ? "open" : suggestion.status,
    }));
  };
  const setThreadResolved = (id: string, resolved: boolean) => {
    updateThread(id, (thread) => ({ ...thread, resolved }));
  };
  const insertReplySuggestion = (id: string) => {
    const thread = threads.find((candidate) => candidate.id === id);

    if (!thread) {
      return;
    }

    setReplyDrafts((current) => ({
      ...current,
      [id]: appendSuggestionBlock(
        current[id] ?? "",
        suggestionTextForTarget(activeSource, targetFromThread(thread)),
      ),
    }));
  };
  const addReply = (id: string) => {
    const body = replyDrafts[id]?.trim();

    if (!body) {
      return;
    }

    const suggestion = parseSuggestionBlock(body);

    updateThread(id, (thread) => ({
      ...thread,
      replies: [
        ...thread.replies,
        {
          body,
          id: `${id}:reply:${thread.replies.length + 1}`,
          kind: suggestion == null ? "comment" : "suggestion",
          suggestion: suggestion == null
            ? undefined
            : {
              replacement: suggestion.replacement,
              status: "open",
            },
        },
      ],
    }));
    setReplyDrafts((current) => ({
      ...current,
      [id]: "",
    }));
  };
  const applyReviewSuggestion = async (
    threadId: string,
    replyId?: string,
  ) => {
    const thread = threads.find((candidate) => candidate.id === threadId);
    const suggestion = thread ? suggestionFor(thread, replyId) : undefined;

    if (
      !thread
      || !suggestion
      || !canApplySuggestion(thread)
      || pendingSuggestionId
    ) {
      return;
    }

    const pendingId = suggestionActionId(threadId, replyId);
    const beforeContent = activeSource.content;
    const applied = applySuggestionToContent(
      beforeContent,
      targetFromThread(thread),
      suggestion.replacement,
    );

    setPendingSuggestionId(pendingId);

    try {
      const updatedSource = await onSourceChange(activeSource.id, applied.content);

      updateSuggestion(threadId, replyId, (current) => ({
        ...current,
        appliedAfterContent: updatedSource.content,
        appliedBeforeContent: beforeContent,
        originalText: applied.originalText,
        status: "applied",
      }));
    } finally {
      setPendingSuggestionId(undefined);
    }
  };
  const revertReviewSuggestion = async (
    threadId: string,
    replyId?: string,
  ) => {
    const thread = threads.find((candidate) => candidate.id === threadId);
    const suggestion = thread ? suggestionFor(thread, replyId) : undefined;

    if (!thread || !suggestion || pendingSuggestionId) {
      return;
    }

    const pendingId = suggestionActionId(threadId, replyId);
    const originalText = suggestion.originalText
      ?? thread.selectedText
      ?? suggestionTextForTarget(activeSource, targetFromThread(thread));
    const nextContent = suggestion.appliedBeforeContent != null
      && suggestion.appliedAfterContent === activeSource.content
      ? suggestion.appliedBeforeContent
      : applySuggestionToContent(
        activeSource.content,
        targetFromThread(thread),
        originalText,
      ).content;

    setPendingSuggestionId(pendingId);

    try {
      await onSourceChange(activeSource.id, nextContent);

      updateSuggestion(threadId, replyId, (current) => ({
        replacement: current.replacement,
        status: "open",
      }));
    } finally {
      setPendingSuggestionId(undefined);
    }
  };
  const renderCommentAnnotation = (
    annotation: LineAnnotation<CommentAnnotationMetadata> | DiffLineAnnotation<CommentAnnotationMetadata>,
  ) => renderAnnotation(annotation, {
    draftBody,
    pendingSuggestionId,
    onCancel: cancelDraft,
    onDraftBodyChange: setDraftBody,
    onInsertSuggestion: insertSuggestion,
    onInsertReplySuggestion: insertReplySuggestion,
    onReply: addReply,
    onReplyBodyChange(id, value) {
      setReplyDrafts((current) => ({
        ...current,
        [id]: value,
      }));
    },
    onResolve: setThreadResolved,
    onSuggestionApply: applyReviewSuggestion,
    onSuggestionChange: replaceSuggestion,
    onSuggestionRevert: revertReviewSuggestion,
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

  function updateSuggestion(
    threadId: string,
    replyId: string | undefined,
    update: (suggestion: ReviewSuggestion) => ReviewSuggestion,
  ) {
    updateThread(threadId, (thread) => {
      if (replyId == null) {
        const suggestion = update(thread.suggestion ?? {
          replacement: "",
          status: "open",
        });

        return {
          ...thread,
          body: replaceSuggestionBlock(thread.body, suggestion.replacement),
          kind: "suggestion",
          suggestion,
        };
      }

      return {
        ...thread,
        replies: thread.replies.map((reply) => {
          if (reply.id !== replyId) {
            return reply;
          }

          const suggestion = update(reply.suggestion ?? {
            replacement: "",
            status: "open",
          });

          return {
            ...reply,
            body: replaceSuggestionBlock(reply.body, suggestion.replacement),
            kind: "suggestion",
            suggestion,
          };
        }),
      };
    });
  }
}

type RenderAnnotationActions = {
  draftBody: string;
  pendingSuggestionId?: string;
  onCancel(): void;
  onDraftBodyChange(value: string): void;
  onInsertSuggestion(): void;
  onInsertReplySuggestion(id: string): void;
  onReply(id: string): void;
  onReplyBodyChange(id: string, value: string): void;
  onResolve(id: string, resolved: boolean): void;
  onSubmit(): void;
  onSuggestionApply(threadId: string, replyId?: string): void;
  onSuggestionChange(threadId: string, replyId: string | undefined, replacement: string): void;
  onSuggestionRevert(threadId: string, replyId?: string): void;
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
    const replyDraft = actions.replyDrafts[thread.id] ?? "";
    const replyHasSuggestion = parseSuggestionBlock(replyDraft) != null;

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
          canApply={canApplySuggestion(thread)}
          isPending={actions.pendingSuggestionId === suggestionActionId(thread.id)}
          onApply={() => {
            void actions.onSuggestionApply(thread.id);
          }}
          onChange={(replacement) => actions.onSuggestionChange(thread.id, undefined, replacement)}
          onRevert={() => {
            void actions.onSuggestionRevert(thread.id);
          }}
          originalText={thread.selectedText ?? ""}
          suggestion={thread.suggestion}
        />

        {thread.replies.map((reply, index) => {
          const replyBody = bodyWithoutSuggestionBlock(reply.body);

          return (
            <div className="annotation-reply" key={reply.id}>
              <div className="annotation-avatar">
                {index === 0 ? "A" : "M"}
              </div>
              <div className="annotation-reply-body">
                <strong>{index === 0 ? "Amadeus" : "Mark"}</strong>
                <span>now</span>
                {replyBody ? <p>{replyBody}</p> : null}
                <SuggestionBlock
                  canApply={canApplySuggestion(thread)}
                  isPending={actions.pendingSuggestionId === suggestionActionId(thread.id, reply.id)}
                  onApply={() => {
                    void actions.onSuggestionApply(thread.id, reply.id);
                  }}
                  onChange={(replacement) => actions.onSuggestionChange(thread.id, reply.id, replacement)}
                  onRevert={() => {
                    void actions.onSuggestionRevert(thread.id, reply.id);
                  }}
                  originalText={thread.selectedText ?? ""}
                  suggestion={reply.suggestion}
                />
              </div>
            </div>
          );
        })}

        <div className="annotation-reply-composer">
          <textarea
            aria-label={`Reply to ${target}`}
            onChange={(event) => actions.onReplyBodyChange(thread.id, event.currentTarget.value)}
            placeholder="Add reply..."
            rows={replyHasSuggestion ? 7 : 2}
            value={replyDraft}
          />
          <div className="annotation-actions">
            <button
              disabled={replyHasSuggestion}
              onClick={() => actions.onInsertReplySuggestion(thread.id)}
              type="button"
            >
              Make suggestion
            </button>
            <button
              disabled={!replyDraft.trim()}
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
  canApply,
  isPending,
  onApply,
  onChange,
  onRevert,
  originalText,
  suggestion,
}: {
  canApply: boolean;
  isPending: boolean;
  onApply(): void;
  onChange(replacement: string): void;
  onRevert(): void;
  originalText: string;
  suggestion?: ReviewSuggestion;
}) {
  if (!suggestion) {
    return null;
  }

  return (
    <div className="annotation-suggestion-block">
      <div className="annotation-heading">
        <strong>Suggested change</strong>
        <span>{suggestionStatusLabel(suggestion.status)}</span>
      </div>
      <div className="suggestion-diff">
        <pre data-kind="old">{suggestion.originalText ?? originalText}</pre>
        <textarea
          aria-label="Suggested replacement"
          className="annotation-suggestion-input"
          onChange={(event) => onChange(event.currentTarget.value)}
          value={suggestion.replacement}
        />
      </div>
      <div className="annotation-actions">
        {suggestion.status === "applied" ? (
          <button
            disabled={isPending}
            onClick={onRevert}
            type="button"
          >
            Revert suggestion
          </button>
        ) : (
          <button
            disabled={isPending || !canApply}
            onClick={onApply}
            type="button"
          >
            Apply suggestion
          </button>
        )}
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

function suggestionFor(
  thread: ReviewThread,
  replyId?: string,
): ReviewSuggestion | undefined {
  if (replyId == null) {
    return thread.suggestion;
  }

  return thread.replies.find((reply) => reply.id === replyId)?.suggestion;
}

function suggestionActionId(threadId: string, replyId?: string): string {
  return replyId == null ? threadId : `${threadId}:${replyId}`;
}

function canApplySuggestion(thread: ReviewThread): boolean {
  return thread.side !== "deletions";
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
    case "applied":
      return "applied";
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
