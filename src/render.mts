import { marked } from "marked";

import {
  preprocessMdx,
  stripFrontmatter,
} from "./content.mts";
import type { SourceFile } from "./types.mts";

marked.use({
  gfm: true,
  renderer: {
    code(token) {
      const language = token.lang?.trim().split(/\s+/u)[0]?.toLowerCase();

      if (language !== "mermaid") {
        return false;
      }

      return `<pre class="mermaid">${escapeHtml(token.text)}</pre>`;
    },
  },
});

export function renderDocument(file: SourceFile, origin: string): string {
  const baseHref = new URL(
    `/api/asset/${encodeURIComponent(file.id)}/`,
    origin,
  ).toString();
  const title = escapeHtml(file.title || file.name);
  const body = file.kind === "html"
    ? file.content
    : renderMarkdownDocument(file);

  if (file.kind === "html" && /<html[\s>]/iu.test(file.content)) {
    return injectBase(file.content, baseHref);
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeAttribute(baseHref)}">
  <title>${title}</title>
  <style>${documentStyles}</style>
</head>
<body>
  <article class="${file.kind === "html" ? "html-document" : "markdown-body"}">
${body}
  </article>
  <script type="module">
    const diagrams = document.querySelectorAll(".mermaid");
    if (diagrams.length > 0) {
      const mermaid = await import("/api/vendor/mermaid.esm.min.mjs");
      mermaid.default.initialize({ startOnLoad: false, securityLevel: "strict" });
      await mermaid.default.run({ nodes: diagrams });
    }
  </script>
</body>
</html>`;
}

export function renderMarkdownBody(file: SourceFile): string {
  return renderMarkdownDocument(file);
}

function renderMarkdownDocument(file: SourceFile): string {
  const source = file.kind === "mdx" ? preprocessMdx(file.content) : file.content;
  const { body, frontmatter } = stripFrontmatter(source);
  const rendered = marked.parse(body, { async: false });
  const metadata = frontmatter
    ? `<details class="frontmatter"><summary>Frontmatter</summary><pre>${escapeHtml(frontmatter)}</pre></details>\n`
    : "";

  return `${metadata}${String(rendered)}`;
}

function injectBase(html: string, baseHref: string): string {
  const base = `<base href="${escapeAttribute(baseHref)}">`;

  if (/<base\s/iu.test(html)) {
    return html;
  }

  if (/<head[^>]*>/iu.test(html)) {
    return html.replace(/<head([^>]*)>/iu, `<head$1>${base}`);
  }

  return `<!doctype html><html><head>${base}<style>${documentStyles}</style></head><body>${html}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/gu, "&quot;");
}

const documentStyles = `
:root {
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  color: light-dark(#24292f, #d8dee9);
  background: light-dark(#ffffff, #111827);
}

article {
  box-sizing: border-box;
  max-width: 980px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 36px clamp(18px, 5vw, 56px);
}

.markdown-body {
  line-height: 1.65;
  font-size: 16px;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3 {
  line-height: 1.25;
  margin-top: 1.8em;
}

.markdown-body h1:first-child,
.markdown-body h2:first-child,
.markdown-body h3:first-child {
  margin-top: 0;
}

.markdown-body pre {
  overflow-x: auto;
  padding: 16px;
  border-radius: 8px;
  background: light-dark(#f6f8fa, #0b1220);
}

.markdown-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
}

.markdown-body :not(pre) > code {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: light-dark(#eff1f3, #1f2937);
}

.markdown-body blockquote {
  margin-left: 0;
  padding-left: 1em;
  color: light-dark(#57606a, #9ca3af);
  border-left: 4px solid light-dark(#d0d7de, #374151);
}

.markdown-body table {
  border-collapse: collapse;
  display: block;
  overflow-x: auto;
}

.markdown-body th,
.markdown-body td {
  padding: 6px 12px;
  border: 1px solid light-dark(#d0d7de, #374151);
}

.markdown-body img {
  max-width: 100%;
}

.frontmatter {
  margin: 0 0 24px;
  padding: 12px 14px;
  border: 1px solid light-dark(#d0d7de, #374151);
  border-radius: 8px;
  background: light-dark(#f6f8fa, #172033);
}

.frontmatter summary {
  cursor: pointer;
  font-weight: 600;
}

.frontmatter pre {
  margin-bottom: 0;
  white-space: pre-wrap;
}
`;
