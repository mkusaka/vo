# vo

`vo` is a local TanStack Start viewer for HTML, Markdown, and MDX files.

Pass files, directories, or glob patterns, and `vo` starts a local browser UI
with file navigation, a GitHub `t`-style filename finder, rough full-text
search, Mermaid rendering, drag and drop, and live document watch.

## Requirements

- Node.js 22.18.0 or newer
- pnpm

The CLI entrypoint is `src/main.mts` and is run directly by Node.js type
stripping. The browser shell is a TanStack Start app served by Vite.

## Usage

```sh
pnpm install
pnpm start README.md
pnpm start -- examples --no-open
node src/main.mts README.md notes.mdx index.html
```

Supported file types:

- `.html`
- `.htm`
- `.md`
- `.markdown`
- `.mdx`

Common options:

```sh
vo README.md                      # Open a file
vo docs                           # Open supported files recursively
vo 'docs/**/*.{md,mdx,html}'      # Open a glob pattern
vo --port 7000 --no-open docs     # Use a specific port
vo --no-recursive docs            # Only direct children
vo --no-gitignore docs            # Include gitignored files
vo --no-watch docs                # Disable filesystem watch
```

Directory inputs are recursive by default and `.gitignore` is respected by
default. Globbing is powered by `globby`; use `--no-gitignore` when you
intentionally want ignored files to appear.

## UI

- The file navigator is rendered with `@pierre/trees`.
- File search filters the tree with a fuzzy path matcher for GitHub `t`-style
  navigation.
- Text search scans extracted HTML/Markdown/MDX text.
- `Render` shows the generated document iframe.
- `Annotate` shows the whole source file with `@pierre/diffs`; use the gutter
  `+`, drag-select lines, or click a token to start a review thread.
- `Diff` shows the current file against the content captured when it was first
  loaded into the session, using `@pierre/diffs` with char-level word changes.
- Review threads support replies, resolve, comment drafts, and GitHub-style
  `suggestion` blocks for a line, multiple lines, or a token range. Suggestions
  can be added from the first comment or a reply, applied to the in-session
  source, and reverted.
- Click the file path in the preview header to copy it.
- The viewer chrome and `@pierre/trees` / `@pierre/diffs` panes can be switched
  between light and dark mode from the preview toolbar.
- Dropped `.html`, `.htm`, `.md`, `.markdown`, and `.mdx` files are added as
  virtual files for the current session.
- Mermaid code fences in Markdown/MDX are rendered inside the document iframe.

Sample files are available under `examples/`:

- `examples/markdown.md`
- `examples/page.mdx`
- `examples/index.html`

## Session and Watch

The first `vo` process starts a local Start/Vite server and writes a temporary
session file. Later `vo` invocations add paths to that running session instead
of starting another server.

Watch is enabled by default. File and directory inputs are watched with
`chokidar`; changes update the browser via server-sent events. Dragged files are
virtual session files and are not watched on disk.

Rendered documents are isolated in an iframe. Markdown and MDX rendering allows
HTML because this is a local document viewer, not a sanitizer for untrusted
content.

## Development

```sh
pnpm install
pnpm check
node src/main.mts --no-open README.md
```

Useful project commands:

```sh
pnpm dev        # Start the TanStack Start app directly
pnpm build      # Production build smoke test
pnpm typecheck  # TypeScript check
pnpm test       # Node test runner
```
