import type {
  AnnotationSide,
  DiffLineAnnotation,
  LineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";

export type CommentTarget = {
  lineNumber: number;
  side?: AnnotationSide;
};

export type LocalComment = {
  body: string;
  id: string;
  lineNumber: number;
  path: string;
  side?: AnnotationSide;
};

export type CommentAnnotationMetadata = {
  kind: "comment" | "draft";
  body?: string;
  id?: string;
  lineNumber: number;
  path: string;
  side?: AnnotationSide;
};

export function targetFromFileRange(
  range: SelectedLineRange,
): CommentTarget {
  return {
    lineNumber: range.start,
  };
}

export function targetFromDiffRange(
  range: SelectedLineRange,
): CommentTarget {
  return {
    lineNumber: range.start,
    side: range.side ?? range.endSide ?? "additions",
  };
}

export function createFileCommentAnnotations(
  path: string,
  comments: readonly LocalComment[],
  draftTarget: CommentTarget | undefined,
): LineAnnotation<CommentAnnotationMetadata>[] {
  const annotations = comments
    .filter((comment) => comment.path === path && comment.side == null)
    .map<LineAnnotation<CommentAnnotationMetadata>>((comment) => ({
      lineNumber: comment.lineNumber,
      metadata: {
        body: comment.body,
        id: comment.id,
        kind: "comment",
        lineNumber: comment.lineNumber,
        path,
      },
    }));

  if (draftTarget != null && draftTarget.side == null) {
    annotations.push({
      lineNumber: draftTarget.lineNumber,
      metadata: {
        kind: "draft",
        lineNumber: draftTarget.lineNumber,
        path,
      },
    });
  }

  return annotations;
}

export function createDiffCommentAnnotations(
  path: string,
  comments: readonly LocalComment[],
  draftTarget: CommentTarget | undefined,
): DiffLineAnnotation<CommentAnnotationMetadata>[] {
  const annotations = comments
    .filter((comment): comment is LocalComment & { side: AnnotationSide } => (
      comment.path === path && comment.side != null
    ))
    .map<DiffLineAnnotation<CommentAnnotationMetadata>>((comment) => ({
      lineNumber: comment.lineNumber,
      metadata: {
        body: comment.body,
        id: comment.id,
        kind: "comment",
        lineNumber: comment.lineNumber,
        path,
        side: comment.side,
      },
      side: comment.side,
    }));

  if (draftTarget?.side != null) {
    annotations.push({
      lineNumber: draftTarget.lineNumber,
      metadata: {
        kind: "draft",
        lineNumber: draftTarget.lineNumber,
        path,
        side: draftTarget.side,
      },
      side: draftTarget.side,
    });
  }

  return annotations;
}
