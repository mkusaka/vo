import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiffCommentAnnotations,
  createFileCommentAnnotations,
  targetFromDiffRange,
  targetFromFileRange,
  type LocalComment,
} from "../src/app/comment-annotations.mts";

test("targetFromFileRange opens a file comment on the clicked start line", () => {
  assert.deepEqual(targetFromFileRange({
    end: 5,
    start: 3,
  }), {
    lineNumber: 3,
  });
});

test("targetFromDiffRange keeps the diff side from the gutter click", () => {
  assert.deepEqual(targetFromDiffRange({
    end: 12,
    side: "deletions",
    start: 10,
  }), {
    lineNumber: 10,
    side: "deletions",
  });
});

test("targetFromDiffRange defaults to additions when the range has no side", () => {
  assert.deepEqual(targetFromDiffRange({
    end: 4,
    start: 4,
  }), {
    lineNumber: 4,
    side: "additions",
  });
});

test("createFileCommentAnnotations includes saved comments and the active draft", () => {
  const comments: LocalComment[] = [
    comment("readme.md", 2, "Looks good"),
    comment("readme.md", 3, "Diff only", "additions"),
    comment("other.md", 2, "Ignore this"),
  ];

  assert.deepEqual(createFileCommentAnnotations("readme.md", comments, {
    lineNumber: 4,
  }), [
    {
      lineNumber: 2,
      metadata: {
        body: "Looks good",
        id: "readme.md:2",
        kind: "comment",
        lineNumber: 2,
        path: "readme.md",
      },
    },
    {
      lineNumber: 4,
      metadata: {
        kind: "draft",
        lineNumber: 4,
        path: "readme.md",
      },
    },
  ]);
});

test("createDiffCommentAnnotations includes side-aware comments and draft", () => {
  const comments: LocalComment[] = [
    comment("readme.md", 2, "File only"),
    comment("readme.md", 3, "Add this", "additions"),
    comment("readme.md", 5, "Remove this", "deletions"),
  ];

  assert.deepEqual(createDiffCommentAnnotations("readme.md", comments, {
    lineNumber: 8,
    side: "additions",
  }), [
    {
      lineNumber: 3,
      metadata: {
        body: "Add this",
        id: "readme.md:3:additions",
        kind: "comment",
        lineNumber: 3,
        path: "readme.md",
        side: "additions",
      },
      side: "additions",
    },
    {
      lineNumber: 5,
      metadata: {
        body: "Remove this",
        id: "readme.md:5:deletions",
        kind: "comment",
        lineNumber: 5,
        path: "readme.md",
        side: "deletions",
      },
      side: "deletions",
    },
    {
      lineNumber: 8,
      metadata: {
        kind: "draft",
        lineNumber: 8,
        path: "readme.md",
        side: "additions",
      },
      side: "additions",
    },
  ]);
});

function comment(
  path: string,
  lineNumber: number,
  body: string,
  side?: LocalComment["side"],
): LocalComment {
  return {
    body,
    id: side ? `${path}:${lineNumber}:${side}` : `${path}:${lineNumber}`,
    lineNumber,
    path,
    side,
  };
}
