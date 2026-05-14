import assert from "node:assert/strict";
import test from "node:test";

import {
  appendSuggestionBlock,
  applySuggestionToContent,
  bodyWithoutSuggestionBlock,
  createDiffCommentAnnotations,
  createFileCommentAnnotations,
  createSuggestionBlock,
  parseSuggestionBlock,
  selectedTextForTarget,
  targetFromDiffRange,
  targetFromDiffToken,
  targetFromFileRange,
  targetFromFileToken,
  type ReviewThread,
} from "../src/app/comment-annotations.mts";

test("targetFromFileRange keeps a multiline file selection", () => {
  assert.deepEqual(targetFromFileRange({
    end: 5,
    start: 3,
  }), {
    endLineNumber: 5,
    lineNumber: 3,
  });
});

test("targetFromFileRange normalizes reversed line ranges", () => {
  assert.deepEqual(targetFromFileRange({
    end: 3,
    start: 5,
  }), {
    endLineNumber: 5,
    lineNumber: 3,
  });
});

test("targetFromDiffRange keeps diff side and end side", () => {
  assert.deepEqual(targetFromDiffRange({
    end: 12,
    endSide: "additions",
    side: "deletions",
    start: 10,
  }), {
    endLineNumber: 12,
    endSide: "additions",
    lineNumber: 10,
    side: "deletions",
  });
});

test("targetFromDiffRange defaults to additions when the range has no side", () => {
  assert.deepEqual(targetFromDiffRange({
    end: 4,
    start: 4,
  }), {
    endLineNumber: 4,
    endSide: undefined,
    lineNumber: 4,
    side: "additions",
  });
});

test("token targets preserve character-level context", () => {
  const tokenElement = {} as HTMLElement;

  assert.deepEqual(targetFromFileToken({
    lineCharEnd: 12,
    lineCharStart: 7,
    lineNumber: 2,
    tokenElement,
    tokenText: "title",
    type: "token",
  }), {
    charEnd: 12,
    charStart: 7,
    endLineNumber: 2,
    lineNumber: 2,
    selectedText: "title",
  });

  assert.deepEqual(targetFromDiffToken({
    lineCharEnd: 8,
    lineCharStart: 2,
    lineNumber: 9,
    side: "additions",
    tokenElement,
    tokenText: "value",
    type: "token",
  }), {
    charEnd: 8,
    charStart: 2,
    endLineNumber: 9,
    lineNumber: 9,
    selectedText: "value",
    side: "additions",
  });
});

test("selectedTextForTarget returns explicit token text first", () => {
  assert.equal(selectedTextForTarget("one\ntwo\nthree", {
    endLineNumber: 2,
    lineNumber: 2,
    selectedText: "tw",
  }), "tw");
});

test("selectedTextForTarget extracts character ranges when token text is absent", () => {
  assert.equal(selectedTextForTarget("alpha beta", {
    charEnd: 10,
    charStart: 6,
    endLineNumber: 1,
    lineNumber: 1,
  }), "beta");
});

test("selectedTextForTarget extracts multiline content", () => {
  assert.equal(selectedTextForTarget("one\ntwo\nthree\nfour", {
    endLineNumber: 3,
    lineNumber: 2,
  }), "two\nthree");
});

test("createSuggestionBlock formats a GitHub-style suggestion fence", () => {
  assert.equal(
    createSuggestionBlock("new\nvalue"),
    "```suggestion\nnew\nvalue\n```",
  );
});

test("createSuggestionBlock uses tilde fences when the suggestion contains backticks", () => {
  assert.equal(
    createSuggestionBlock("```ts\nconst value = true;\n```"),
    "~~~suggestion\n```ts\nconst value = true;\n```\n~~~",
  );
});

test("appendSuggestionBlock keeps the review body and appends a suggestion", () => {
  assert.equal(
    appendSuggestionBlock("Use clearer text.", "new value"),
    "Use clearer text.\n\n```suggestion\nnew value\n```",
  );
});

test("appendSuggestionBlock does not add a second suggestion block", () => {
  const body = "Use clearer text.\n\n```suggestion\nnew value\n```";

  assert.equal(appendSuggestionBlock(body, "other value"), body);
});

test("parseSuggestionBlock extracts a multiline replacement", () => {
  assert.deepEqual(
    parseSuggestionBlock("Use clearer text.\n\n```suggestion\nnew\nvalue\n```"),
    { replacement: "new\nvalue" },
  );
});

test("parseSuggestionBlock supports tilde fences", () => {
  assert.deepEqual(
    parseSuggestionBlock("~~~suggestion\n```ts\nconst value = true;\n```\n~~~"),
    { replacement: "```ts\nconst value = true;\n```" },
  );
});

test("bodyWithoutSuggestionBlock removes the suggestion fence", () => {
  assert.equal(
    bodyWithoutSuggestionBlock("Use clearer text.\n\n```suggestion\nnew value\n```"),
    "Use clearer text.",
  );
});

test("bodyWithoutSuggestionBlock keeps regular fenced code blocks", () => {
  const body = "```ts\nconst value = true;\n```\n\n```suggestion\nnew value\n```";

  assert.equal(
    bodyWithoutSuggestionBlock(body),
    "```ts\nconst value = true;\n```",
  );
});

test("applySuggestionToContent replaces whole line ranges and preserves final newline", () => {
  assert.deepEqual(
    applySuggestionToContent("one\ntwo\nthree\n", {
      endLineNumber: 2,
      lineNumber: 2,
    }, "TWO"),
    {
      content: "one\nTWO\nthree\n",
      originalText: "two",
    },
  );
});

test("applySuggestionToContent supports multiline replacements", () => {
  assert.deepEqual(
    applySuggestionToContent("one\ntwo\nthree", {
      endLineNumber: 3,
      lineNumber: 2,
    }, "TWO\nTHREE"),
    {
      content: "one\nTWO\nTHREE",
      originalText: "two\nthree",
    },
  );
});

test("applySuggestionToContent supports character-level replacements", () => {
  assert.deepEqual(
    applySuggestionToContent("alpha beta", {
      charEnd: 10,
      charStart: 6,
      endLineNumber: 1,
      lineNumber: 1,
    }, "gamma"),
    {
      content: "alpha gamma",
      originalText: "beta",
    },
  );
});

test("createFileCommentAnnotations includes saved threads and anchors draft at the range end", () => {
  const threads: ReviewThread[] = [
    reviewThread("readme.md", 2, "Looks good"),
    {
      ...reviewThread("readme.md", 4, "Multi-line thread"),
      endLineNumber: 6,
      selectedText: "multi\nline\nthread",
    },
    reviewThread("readme.md", 3, "Diff only", "additions"),
    reviewThread("readme.md", 7, "Resolved", undefined, true),
    reviewThread("other.md", 2, "Ignore this"),
  ];

  const annotations = createFileCommentAnnotations("readme.md", threads, {
    endLineNumber: 6,
    lineNumber: 5,
    selectedText: "draft range",
  });

  assert.equal(annotations.length, 3);
  assert.equal(annotations[0]?.lineNumber, 2);
  assert.equal(annotations[0]?.metadata.kind, "thread");
  assert.equal(annotations[0]?.metadata.thread?.body, "Looks good");
  assert.equal(annotations[1]?.lineNumber, 6);
  assert.equal(annotations[1]?.metadata.lineNumber, 4);
  assert.equal(annotations[1]?.metadata.endLineNumber, 6);
  assert.equal(annotations[2]?.lineNumber, 6);
  assert.deepEqual(annotations[2]?.metadata, {
    charEnd: undefined,
    charStart: undefined,
    endLineNumber: 6,
    kind: "draft",
    lineNumber: 5,
    path: "readme.md",
    selectedText: "draft range",
  });
});

test("createDiffCommentAnnotations includes side-aware threads and anchors draft at the range end", () => {
  const threads: ReviewThread[] = [
    reviewThread("readme.md", 2, "File only"),
    reviewThread("readme.md", 3, "Add this", "additions"),
    {
      ...reviewThread("readme.md", 5, "Replace this\n\n```suggestion\nnew value\n```", "deletions"),
      endLineNumber: 6,
      kind: "suggestion",
      selectedText: "old value",
      suggestion: {
        replacement: "new value",
        status: "open",
      },
    },
  ];

  const annotations = createDiffCommentAnnotations("readme.md", threads, {
    endLineNumber: 9,
    endSide: "additions",
    lineNumber: 8,
    side: "deletions",
  });

  assert.equal(annotations.length, 3);
  assert.equal(annotations[0]?.side, "additions");
  assert.equal(annotations[0]?.metadata.thread?.body, "Add this");
  assert.equal(annotations[1]?.lineNumber, 6);
  assert.equal(annotations[1]?.side, "deletions");
  assert.equal(annotations[1]?.metadata.thread?.kind, "suggestion");
  assert.deepEqual(annotations[2], {
    lineNumber: 9,
    metadata: {
      charEnd: undefined,
      charStart: undefined,
      endLineNumber: 9,
      endSide: "additions",
      kind: "draft",
      lineNumber: 8,
      path: "readme.md",
      selectedText: undefined,
      side: "deletions",
    },
    side: "additions",
  });
});

function reviewThread(
  path: string,
  lineNumber: number,
  body: string,
  side?: ReviewThread["side"],
  resolved = false,
): ReviewThread {
  return {
    body,
    endLineNumber: lineNumber,
    id: side ? `${path}:${lineNumber}:${side}` : `${path}:${lineNumber}`,
    kind: "comment",
    lineNumber,
    path,
    replies: [],
    resolved,
    side,
  };
}
