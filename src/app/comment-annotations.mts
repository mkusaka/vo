import type {
  AnnotationSide,
  DiffTokenEventBaseProps,
  DiffLineAnnotation,
  LineAnnotation,
  SelectedLineRange,
  TokenEventBase,
} from "@pierre/diffs";

export type CommentTarget = {
  charEnd?: number;
  charStart?: number;
  endLineNumber: number;
  endSide?: AnnotationSide;
  lineNumber: number;
  selectedText?: string;
  side?: AnnotationSide;
};

export type ReviewKind = "comment" | "suggestion";

export type SuggestionStatus = "open" | "kept" | "undone";

export type ReviewReply = {
  body: string;
  id: string;
};

export type ReviewThread = {
  body: string;
  lineNumber: number;
  charEnd?: number;
  charStart?: number;
  endLineNumber: number;
  endSide?: AnnotationSide;
  id: string;
  kind: ReviewKind;
  path: string;
  replies: ReviewReply[];
  resolved: boolean;
  selectedText?: string;
  side?: AnnotationSide;
  suggestion?: {
    replacement: string;
    status: SuggestionStatus;
  };
};

export type CommentAnnotationMetadata = {
  kind: "draft" | "thread";
  body?: string;
  id?: string;
  reviewKind?: ReviewKind;
  lineNumber: number;
  charEnd?: number;
  charStart?: number;
  endLineNumber: number;
  endSide?: AnnotationSide;
  path: string;
  selectedText?: string;
  side?: AnnotationSide;
  thread?: ReviewThread;
};

export function targetFromFileRange(
  range: SelectedLineRange,
): CommentTarget {
  const { start, end } = normalizeRange(range.start, range.end);

  return {
    endLineNumber: end,
    lineNumber: start,
  };
}

export function targetFromDiffRange(
  range: SelectedLineRange,
): CommentTarget {
  const { start, end } = normalizeRange(range.start, range.end);

  return {
    endLineNumber: end,
    endSide: range.endSide,
    lineNumber: start,
    side: range.side ?? range.endSide ?? "additions",
  };
}

export function targetFromFileToken(
  token: TokenEventBase,
): CommentTarget {
  return {
    charEnd: token.lineCharEnd,
    charStart: token.lineCharStart,
    endLineNumber: token.lineNumber,
    lineNumber: token.lineNumber,
    selectedText: token.tokenText,
  };
}

export function targetFromDiffToken(
  token: DiffTokenEventBaseProps,
): CommentTarget {
  return {
    charEnd: token.lineCharEnd,
    charStart: token.lineCharStart,
    endLineNumber: token.lineNumber,
    lineNumber: token.lineNumber,
    selectedText: token.tokenText,
    side: token.side,
  };
}

export function createFileCommentAnnotations(
  path: string,
  threads: readonly ReviewThread[],
  draftTarget: CommentTarget | undefined,
): LineAnnotation<CommentAnnotationMetadata>[] {
  const annotations = threads
    .filter((thread) => (
      thread.path === path
      && thread.side == null
      && !thread.resolved
    ))
    .map<LineAnnotation<CommentAnnotationMetadata>>((comment) => ({
      lineNumber: comment.lineNumber,
      metadata: threadMetadata(comment, path),
    }));

  if (draftTarget != null && draftTarget.side == null) {
    annotations.push({
      lineNumber: draftTarget.lineNumber,
      metadata: {
        charEnd: draftTarget.charEnd,
        charStart: draftTarget.charStart,
        endLineNumber: draftTarget.endLineNumber,
        kind: "draft",
        lineNumber: draftTarget.lineNumber,
        path,
        selectedText: draftTarget.selectedText,
      },
    });
  }

  return annotations;
}

export function createDiffCommentAnnotations(
  path: string,
  threads: readonly ReviewThread[],
  draftTarget: CommentTarget | undefined,
): DiffLineAnnotation<CommentAnnotationMetadata>[] {
  const annotations = threads
    .filter((comment): comment is ReviewThread & { side: AnnotationSide } => (
      comment.path === path
      && comment.side != null
      && !comment.resolved
    ))
    .map<DiffLineAnnotation<CommentAnnotationMetadata>>((comment) => ({
      lineNumber: comment.lineNumber,
      metadata: threadMetadata(comment, path),
      side: comment.side,
    }));

  if (draftTarget?.side != null) {
    annotations.push({
      lineNumber: draftTarget.lineNumber,
      metadata: {
        charEnd: draftTarget.charEnd,
        charStart: draftTarget.charStart,
        endLineNumber: draftTarget.endLineNumber,
        endSide: draftTarget.endSide,
        kind: "draft",
        lineNumber: draftTarget.lineNumber,
        path,
        selectedText: draftTarget.selectedText,
        side: draftTarget.side,
      },
      side: draftTarget.side,
    });
  }

  return annotations;
}

export function selectedTextForTarget(
  contents: string,
  target: CommentTarget,
): string {
  if (target.selectedText != null) {
    return target.selectedText;
  }

  const lines = contents.split(/\r\n|\r|\n/u);
  const start = Math.max(target.lineNumber - 1, 0);
  const end = Math.max(target.endLineNumber - 1, start);

  return lines.slice(start, end + 1).join("\n");
}

function threadMetadata(
  thread: ReviewThread,
  path: string,
): CommentAnnotationMetadata {
  return {
    body: thread.body,
    charEnd: thread.charEnd,
    charStart: thread.charStart,
    endLineNumber: thread.endLineNumber,
    endSide: thread.endSide,
    id: thread.id,
    kind: "thread",
    lineNumber: thread.lineNumber,
    path,
    reviewKind: thread.kind,
    selectedText: thread.selectedText,
    side: thread.side,
    thread,
  };
}

function normalizeRange(start: number, end: number): {
  end: number;
  start: number;
} {
  if (start <= end) {
    return { end, start };
  }

  return { end: start, start: end };
}
