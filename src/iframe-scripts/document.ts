export {};

document.addEventListener("click", (event) => {
  const link = (event.target as Element | null)?.closest("a");
  if (!link) return;

  const nav = (link as HTMLElement).dataset.voNavigate;
  if (nav) {
    event.preventDefault();
    const hash = (link as HTMLElement).dataset.voHash ?? "";
    window.parent.postMessage({ type: "vo:navigate", relativePath: nav, hash }, "*");
    return;
  }

  const href = link.getAttribute("href");
  if (!href) return;

  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
    event.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }

  if (!href.startsWith("#")) return;

  const id = href.slice(1);
  const target =
    document.getElementById(id) ?? document.querySelector(`[name="${CSS.escape(id)}"]`);
  if (target) {
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth" });
    window.parent.postMessage({ type: "vo:anchor", hash: href }, "*");
  }
});

const diagrams = document.querySelectorAll(".mermaid");
if (diagrams.length > 0) {
  // URL as variable so TypeScript does not attempt to resolve it as a module path.
  const mermaidUrl = "/api/vendor/mermaid.esm.min.mjs";
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const mermaid = await import(mermaidUrl);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  mermaid.default.initialize({ startOnLoad: false, securityLevel: "strict" });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  await mermaid.default.run({ nodes: diagrams });
}
