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

export type SuggestionStatus = "applied" | "open";

export type ReviewSuggestion = {
  appliedAfterContent?: string;
  appliedBeforeContent?: string;
  originalText?: string;
  replacement: string;
  status: SuggestionStatus;
};

export type ReviewReply = {
  body: string;
  id: string;
  kind: ReviewKind;
  suggestion?: ReviewSuggestion;
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
  suggestion?: ReviewSuggestion;
};

export type SuggestionBlock = {
  replacement: string;
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

export function createSuggestionBlock(replacement: string): string {
  const fence = replacement.includes("```") ? "~~~" : "```";

  return `${fence}suggestion\n${normalizeLineEndings(replacement)}\n${fence}`;
}

export function appendSuggestionBlock(
  body: string,
  replacement: string,
): string {
  if (parseSuggestionBlock(body) != null) {
    return body;
  }

  const block = createSuggestionBlock(replacement);
  const trimmedBody = body.trimEnd();

  return trimmedBody ? `${trimmedBody}\n\n${block}` : block;
}

export function parseSuggestionBlock(body: string): SuggestionBlock | undefined {
  const block = findSuggestionBlock(body);

  return block ? { replacement: block.replacement } : undefined;
}

export function bodyWithoutSuggestionBlock(body: string): string {
  const block = findSuggestionBlock(body);

  if (!block) {
    return body.trim();
  }

  return [
    ...block.lines.slice(0, block.start),
    ...block.lines.slice(block.end + 1),
  ].join("\n").trim();
}

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
      lineNumber: annotationLineNumber(comment),
      metadata: threadMetadata(comment, path),
    }));

  if (draftTarget != null && draftTarget.side == null) {
    annotations.push({
      lineNumber: annotationLineNumber(draftTarget),
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
      lineNumber: annotationLineNumber(comment),
      metadata: threadMetadata(comment, path),
      side: annotationSide(comment),
    }));

  if (draftTarget?.side != null) {
    annotations.push({
      lineNumber: annotationLineNumber(draftTarget),
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
      side: annotationSide(draftTarget),
    });
  }

  return annotations;
}

export function selectedTextForTarget(
  contents: string,
  target: CommentTarget,
): string {
  if (target.selectedText != null && target.selectedText.length > 0) {
    return target.selectedText;
  }

  const lines = contents.split(/\r\n|\r|\n/u);
  const start = Math.max(target.lineNumber - 1, 0);
  const end = Math.max(target.endLineNumber - 1, start);

  if (
    target.charStart != null
    && target.charEnd != null
    && start === end
  ) {
    return (lines[start] ?? "").slice(target.charStart, target.charEnd);
  }

  return lines.slice(start, end + 1).join("\n");
}

export function targetFromThread(thread: ReviewThread): CommentTarget {
  return {
    charEnd: thread.charEnd,
    charStart: thread.charStart,
    endLineNumber: thread.endLineNumber,
    endSide: thread.endSide,
    lineNumber: thread.lineNumber,
    selectedText: thread.selectedText,
    side: thread.side,
  };
}

export function applySuggestionToContent(
  contents: string,
  target: CommentTarget,
  replacement: string,
): {
  content: string;
  originalText: string;
} {
  const hadFinalNewline = /\r\n|\r|\n$/u.test(contents);
  const lines = linesWithoutFinalEmpty(contents);
  const start = Math.max(target.lineNumber - 1, 0);
  const end = Math.max(target.endLineNumber - 1, start);
  const normalizedReplacement = normalizeLineEndings(replacement);

  if (
    target.charStart != null
    && target.charEnd != null
    && start === end
  ) {
    const line = lines[start] ?? "";
    const charStart = Math.max(0, target.charStart);
    const charEnd = Math.max(charStart, target.charEnd);
    const nextLines = [...lines];
    const originalText = line.slice(charStart, charEnd);

    nextLines[start] = `${line.slice(0, charStart)}${normalizedReplacement}${line.slice(charEnd)}`;

    return {
      content: joinLines(nextLines, hadFinalNewline),
      originalText,
    };
  }

  const nextLines = [...lines];
  const replacementLines = normalizedReplacement.length === 0
    ? []
    : normalizedReplacement.split("\n");
  const originalText = nextLines.slice(start, end + 1).join("\n");

  nextLines.splice(start, end - start + 1, ...replacementLines);

  return {
    content: joinLines(nextLines, hadFinalNewline),
    originalText,
  };
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

function annotationLineNumber(target: CommentTarget): number {
  return Math.max(target.lineNumber, target.endLineNumber);
}

function annotationSide(target: CommentTarget): AnnotationSide {
  return target.endSide ?? target.side ?? "additions";
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

function findSuggestionBlock(body: string): {
  end: number;
  fence: "```" | "~~~";
  lines: string[];
  replacement: string;
  start: number;
} | undefined {
  const lines = normalizeLineEndings(body).split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const fence = suggestionFence(lines[index]);

    if (!fence) {
      continue;
    }

    const replacement: string[] = [];

    for (let end = index + 1; end < lines.length; end += 1) {
      if (isClosingFence(lines[end], fence)) {
        return {
          end,
          fence,
          lines,
          replacement: replacement.join("\n"),
          start: index,
        };
      }

      replacement.push(lines[end]);
    }

    return undefined;
  }

  return undefined;
}

function suggestionFence(line: string | undefined): "```" | "~~~" | undefined {
  const match = line?.trim().match(/^(```|~~~)suggestion\b/iu);

  return match?.[1] === "```" || match?.[1] === "~~~" ? match[1] : undefined;
}

function isClosingFence(line: string | undefined, fence: "```" | "~~~"): boolean {
  return line?.trim() === fence;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n|\r|\n/gu, "\n");
}

function linesWithoutFinalEmpty(contents: string): string[] {
  const lines = normalizeLineEndings(contents).split("\n");

  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function joinLines(lines: readonly string[], hadFinalNewline: boolean): string {
  const content = lines.join("\n");

  return hadFinalNewline ? `${content}\n` : content;
}
