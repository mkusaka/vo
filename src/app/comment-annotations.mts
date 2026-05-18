import type {
  AnnotationSide,
  DiffTokenEventBaseProps,
  DiffLineAnnotation,
  LineAnnotation,
  SelectedLineRange,
  TokenEventBase,
} from "@pierre/diffs";
import lzString from "lz-string";

import { normalizeSharePath } from "./url-state.mts";

const COMMENTS_HASH_PREFIX = "comments=";
const COMMENT_HASH_PREFIX = "comment=";
const SHARED_COMMENTS_VERSION = 1;

export type CommentTarget = {
  charEnd?: number;
  charStart?: number;
  endLineNumber: number;
  endSide?: AnnotationSide;
  lineNumber: number;
  selectedText?: string;
  side?: AnnotationSide;
};

type ReviewKind = "comment" | "suggestion";

export type SuggestionStatus = "applied" | "open";

export type ReviewSuggestion = {
  appliedAfterContent?: string;
  appliedBeforeContent?: string;
  originalText?: string;
  replacement: string;
  status: SuggestionStatus;
};

type ReviewReply = {
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

type SharedCommentPayload = {
  comments?: unknown;
  v?: unknown;
};

type SharedReviewComment = {
  body?: unknown;
  charEnd?: unknown;
  charStart?: unknown;
  endLineNumber?: unknown;
  endSide?: unknown;
  id?: unknown;
  kind?: unknown;
  lineNumber?: unknown;
  path?: unknown;
  replies?: unknown;
  resolved?: unknown;
  selectedText?: unknown;
  side?: unknown;
  suggestion?: unknown;
};

type SharedReviewReply = {
  body?: unknown;
  id?: unknown;
  kind?: unknown;
  suggestion?: unknown;
};

type SharedReviewSuggestion = {
  appliedAfterContent?: unknown;
  appliedBeforeContent?: unknown;
  originalText?: unknown;
  replacement?: unknown;
  status?: unknown;
};

type SharedCommentContext = {
  search: string;
  sourcePath?: string;
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

export function hasSharedCommentHash(hash: string): boolean {
  const payload = hashPayload(hash);

  return (
    payload.startsWith(COMMENTS_HASH_PREFIX)
    || payload.startsWith(COMMENT_HASH_PREFIX)
    || isRawCommentBody(payload)
  );
}

export function viewModeFromSharedCommentHash(
  search: string,
  hash: string,
): "annotate" | "diff" | undefined {
  const comments = sharedCommentsFromHash(hash, {
    search,
    sourcePath: new URLSearchParams(search).get("file") ?? undefined,
  });

  if (comments.length === 0) {
    return undefined;
  }

  return comments.some((comment) => parseAnnotationSide(comment.side) != null)
    ? "diff"
    : "annotate";
}

export function reviewThreadsFromCommentHash(
  hash: string,
  context: SharedCommentContext,
): ReviewThread[] {
  return sharedCommentsFromHash(hash, context).flatMap((comment, index) => {
    const thread = reviewThreadFromSharedComment(comment, index, context);

    return thread ? [thread] : [];
  });
}

export function commentHashFromReviewThreads(
  threads: readonly ReviewThread[],
): string {
  const comments = threads
    .filter((thread) => !thread.resolved)
    .map(sharedCommentFromThread);

  if (comments.length === 0) {
    return "";
  }

  return `#${COMMENTS_HASH_PREFIX}${lzString.compressToEncodedURIComponent(JSON.stringify({
    comments,
    v: SHARED_COMMENTS_VERSION,
  }))}`;
}

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

function sharedCommentsFromHash(
  hash: string,
  context: SharedCommentContext,
): SharedReviewComment[] {
  const payload = hashPayload(hash);

  if (payload.startsWith(COMMENTS_HASH_PREFIX)) {
    const rawJson = decodeCommentsPayload(payload.slice(COMMENTS_HASH_PREFIX.length));
    const parsed = parseJson(rawJson);
    const comments = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed)
        ? (parsed as SharedCommentPayload).comments
        : undefined;

    return Array.isArray(comments)
      ? comments.filter(isRecord).map((comment) => comment as SharedReviewComment)
      : [];
  }

  const rawBody = rawCommentBodyFromHashPayload(payload);

  if (!rawBody) {
    return [];
  }

  return [sharedCommentFromRawBody(rawBody, context)];
}

function decodeCommentsPayload(encoded: string): string {
  return lzString.decompressFromEncodedURIComponent(encoded) ?? safeDecodeURIComponent(encoded);
}

function reviewThreadFromSharedComment(
  comment: SharedReviewComment,
  index: number,
  context: SharedCommentContext,
): ReviewThread | undefined {
  const body = stringValue(comment.body)?.trim();

  if (!body) {
    return undefined;
  }

  const path = normalizeSharePath(
    stringValue(comment.path)
      ?? new URLSearchParams(context.search).get("file")
      ?? context.sourcePath
      ?? "",
  );

  if (!path) {
    return undefined;
  }

  const sourcePath = context.sourcePath ? normalizeSharePath(context.sourcePath) : undefined;

  if (sourcePath && path !== sourcePath) {
    return undefined;
  }

  const lineNumber = positiveInteger(comment.lineNumber) ?? 1;
  const endLineNumber = Math.max(
    lineNumber,
    positiveInteger(comment.endLineNumber) ?? lineNumber,
  );
  const suggestion = reviewSuggestionFromShared(comment.suggestion)
    ?? suggestionFromBody(body);
  const kind = reviewKindValue(comment.kind) ?? (suggestion ? "suggestion" : "comment");
  const id = stringValue(comment.id)
    ?? `url:${index + 1}:${path}:${lineNumber}:${stableHash(body)}`;

  return {
    body,
    charEnd: nonNegativeInteger(comment.charEnd),
    charStart: nonNegativeInteger(comment.charStart),
    endLineNumber,
    endSide: parseAnnotationSide(comment.endSide),
    id,
    kind,
    lineNumber,
    path,
    replies: repliesFromShared(comment.replies, id),
    resolved: comment.resolved === true,
    selectedText: stringValue(comment.selectedText),
    side: parseAnnotationSide(comment.side),
    suggestion,
  };
}

function sharedCommentFromRawBody(
  body: string,
  context: SharedCommentContext,
): SharedReviewComment {
  const params = new URLSearchParams(context.search);
  const lineNumber = positiveInteger(params.get("line")) ?? 1;

  return {
    body,
    charEnd: nonNegativeInteger(params.get("charEnd")),
    charStart: nonNegativeInteger(params.get("charStart")),
    endLineNumber: Math.max(
      lineNumber,
      positiveInteger(params.get("endLine")) ?? lineNumber,
    ),
    endSide: params.get("endSide") ?? undefined,
    lineNumber,
    path: params.get("file") ?? context.sourcePath,
    selectedText: params.get("selectedText") ?? params.get("text") ?? undefined,
    side: params.get("side") ?? undefined,
  };
}

function sharedCommentFromThread(thread: ReviewThread): SharedReviewComment {
  return {
    body: thread.body,
    charEnd: thread.charEnd,
    charStart: thread.charStart,
    endLineNumber: thread.endLineNumber,
    endSide: thread.endSide,
    id: thread.id,
    kind: thread.kind,
    lineNumber: thread.lineNumber,
    path: thread.path,
    replies: thread.replies.map(sharedReplyFromReply),
    resolved: thread.resolved,
    selectedText: thread.selectedText,
    side: thread.side,
    suggestion: sharedSuggestionFromSuggestion(thread.suggestion),
  };
}

function sharedReplyFromReply(reply: ReviewThread["replies"][number]): SharedReviewReply {
  return {
    body: reply.body,
    id: reply.id,
    kind: reply.kind,
    suggestion: sharedSuggestionFromSuggestion(reply.suggestion),
  };
}

function sharedSuggestionFromSuggestion(
  suggestion: ReviewSuggestion | undefined,
): SharedReviewSuggestion | undefined {
  if (!suggestion) {
    return undefined;
  }

  return {
    originalText: suggestion.originalText,
    replacement: suggestion.replacement,
    status: suggestion.status,
  };
}

function repliesFromShared(
  value: unknown,
  threadId: string,
): ReviewThread["replies"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate, index) => {
    if (!isRecord(candidate)) {
      return [];
    }

    const reply = candidate as SharedReviewReply;
    const body = stringValue(reply.body)?.trim();

    if (!body) {
      return [];
    }

    const suggestion = reviewSuggestionFromShared(reply.suggestion)
      ?? suggestionFromBody(body);
    const kind = reviewKindValue(reply.kind)
      ?? (suggestion ? "suggestion" : "comment");

    return [{
      body,
      id: stringValue(reply.id)
        ?? `${threadId}:reply:${index + 1}:${stableHash(body)}`,
      kind,
      suggestion,
    }];
  });
}

function reviewSuggestionFromShared(value: unknown): ReviewSuggestion | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const suggestion = value as SharedReviewSuggestion;
  const replacement = stringValue(suggestion.replacement);

  if (replacement == null) {
    return undefined;
  }

  return {
    originalText: stringValue(suggestion.originalText),
    replacement,
    status: suggestion.status === "applied" ? "applied" : "open",
  };
}

function suggestionFromBody(body: string): ReviewSuggestion | undefined {
  const suggestion = parseSuggestionBlock(body);

  return suggestion
    ? {
      replacement: suggestion.replacement,
      status: "open",
    }
    : undefined;
}

function hashPayload(hash: string): string {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

function rawCommentBodyFromHashPayload(payload: string): string | undefined {
  if (payload.startsWith(COMMENT_HASH_PREFIX)) {
    return safeDecodeURIComponent(payload.slice(COMMENT_HASH_PREFIX.length)).trim()
      || undefined;
  }

  if (isRawCommentBody(payload)) {
    return safeDecodeURIComponent(payload).trim() || undefined;
  }

  return undefined;
}

function isRawCommentBody(payload: string): boolean {
  return payload.startsWith("https://") || payload.startsWith("http://");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const number = numberValue(value);

  return number != null && number >= 1 ? number : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const number = numberValue(value);

  return number != null && number >= 0 ? number : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseAnnotationSide(value: unknown): AnnotationSide | undefined {
  return value === "additions" || value === "deletions" ? value : undefined;
}

function reviewKindValue(value: unknown): ReviewKind | undefined {
  return value === "comment" || value === "suggestion" ? value : undefined;
}

function stableHash(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
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
