import type { SupportedKind } from "../types.mts";

export function fileKindShortLabel(kind: SupportedKind): "html" | "md" | "mdx" {
  switch (kind) {
    case "html":
      return "html";
    case "markdown":
      return "md";
    case "mdx":
      return "mdx";
  }
}

export function fileKindTitle(kind: SupportedKind): "HTML" | "Markdown" | "MDX" {
  switch (kind) {
    case "html":
      return "HTML";
    case "markdown":
      return "Markdown";
    case "mdx":
      return "MDX";
  }
}
