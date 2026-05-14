import assert from "node:assert/strict";
import test from "node:test";

import { renderDocument } from "../src/render.mts";
import type { SourceFile, SupportedKind } from "../src/types.mts";

test("renderDocument keeps Markdown Mermaid fences executable", () => {
  const html = renderDocument(sourceFile("```mermaid\ngraph TD\n  A-->B\n```"), "http://localhost:6276");

  assert.match(html, /<pre class="mermaid">graph TD\n  A--&gt;B<\/pre>/u);
  assert.match(html, /await import\("\/api\/vendor\/mermaid\.esm\.min\.mjs"\)/u);
  assert.match(html, /mermaid\.default\.run\(\{ nodes: diagrams \}\)/u);
});

test("renderDocument keeps MDX Mermaid fences after preprocessing", () => {
  const html = renderDocument(sourceFile("export const meta = {};\n\n```mermaid\nsequenceDiagram\n  A->>B: Hi\n```", "mdx"), "http://localhost:6276");

  assert.match(html, /<pre class="mermaid">sequenceDiagram\n  A-&gt;&gt;B: Hi<\/pre>/u);
});

function sourceFile(content: string, kind: SupportedKind = "markdown"): SourceFile {
  return {
    baselineContent: content,
    content,
    extension: kind === "mdx" ? ".mdx" : ".md",
    id: `example.${kind}`,
    kind,
    mtimeMs: 0,
    name: `example.${kind}`,
    relativePath: `example.${kind}`,
    searchableText: content,
    size: content.length,
    title: "Example",
    virtual: false,
  };
}
