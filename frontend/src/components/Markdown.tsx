import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

// Every link opens in a new tab without giving that page a handle on ours.
// Registered once: DOMPurify's hooks are global.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** Markdown to safe HTML: parsed by marked, then cleaned by DOMPurify. */
export function renderMarkdown(text: string): string {
  // breaks: a single line break is a line break, as people expect when typing.
  const html = marked.parse(text, { async: false, breaks: true, gfm: true });
  // Only formatting survives: no scripts, styles, event handlers or forms,
  // so a description or comment can't run code in someone else's browser.
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "img", "iframe"],
  });
}

/** Text written in Markdown (a description, a comment), shown formatted. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  // Safe to inject: renderMarkdown sanitises everything it returns.
  return (
    <div
      className={className ? `md ${className}` : "md"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
