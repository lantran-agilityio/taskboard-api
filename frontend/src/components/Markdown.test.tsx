import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown, renderMarkdown } from "./Markdown";

describe("renderMarkdown", () => {
  it("formats basic Markdown", () => {
    const html = renderMarkdown("**bold** and _soft_\n\n- one\n- two\n\n`code`");

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>soft</em>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<code>code</code>");
  });

  it("keeps single line breaks", () => {
    expect(renderMarkdown("first\nsecond")).toContain("first<br>second");
  });

  it.each([
    ["<script>alert(1)</script>", "<script"],
    ['<img src=x onerror="alert(1)">', "onerror"],
    ["[click](javascript:alert(1))", "javascript:"],
    ['<a href="#" onclick="alert(1)">x</a>', "onclick"],
    ["<iframe src='https://example.com'></iframe>", "<iframe"],
    ["<style>body{display:none}</style>", "<style"],
  ])("strips %s", (input, banned) => {
    expect(renderMarkdown(input).toLowerCase()).not.toContain(banned);
  });

  it("opens links in a new tab, safely", () => {
    const html = renderMarkdown("[site](https://example.com)");

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe("Markdown", () => {
  it("renders formatted text", () => {
    render(<Markdown text={"# Plan\n\nShip **today**"} />);

    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByText("today").tagName).toBe("STRONG");
  });
});
