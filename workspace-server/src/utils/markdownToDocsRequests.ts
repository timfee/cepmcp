/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { docs_v1 } from "googleapis";

import { JSDOM } from "jsdom";
import { marked } from "marked";

interface FormatRange {
  start: number;
  end: number;
  type: "bold" | "italic" | "code" | "link" | "heading";
  url?: string;
  headingLevel?: number;
  isParagraph?: boolean;
}

interface ParsedMarkdown {
  plainText: string;
  formattingRequests: docs_v1.Schema$Request[];
}

/**
 * Converts markdown lines to HTML parts.
 */
function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const htmlParts: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const content = headingMatch[2] ?? "";
      try {
        const inlineHtml = marked.parseInline(content) as string;
        htmlParts.push(`<h${level}>${inlineHtml}</h${level}>`);
      } catch (error) {
        console.error("Markdown parsing failed for heading:", error);
        htmlParts.push(`<h${level}>${content}</h${level}>`);
      }
    } else if (line.trim()) {
      try {
        const inlineHtml = marked.parseInline(line) as string;
        htmlParts.push(`<p>${inlineHtml}</p>`);
      } catch (error) {
        console.error("Markdown parsing failed for line:", error);
        htmlParts.push(`<p>${line}</p>`);
      }
    } else {
      htmlParts.push("");
    }
  }

  return htmlParts.join("\n");
}

/**
 * Parses HTML to extract plain text and formatting ranges.
 */
function htmlToFormattingRanges(html: string): {
  plainText: string;
  ranges: FormatRange[];
} {
  const dom = new JSDOM(`<div>${html}</div>`);
  const wrapper = dom.window.document.querySelector("div");
  const ranges: FormatRange[] = [];
  let plainText = "";
  let currentPos = 0;

  function processNode(node: Node) {
    if (node.nodeType === 3) {
      const text = node.textContent || "";
      plainText += text;
      currentPos += text.length;
    } else if (node.nodeType === 1) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      const start = currentPos;

      for (const child of Array.from(node.childNodes)) {
        processNode(child);
      }

      const end = currentPos;
      if (tagName === "strong" || tagName === "b") {
        ranges.push({ start, end, type: "bold" });
      } else if (tagName === "em" || tagName === "i") {
        ranges.push({ start, end, type: "italic" });
      } else if (tagName === "code") {
        ranges.push({ start, end, type: "code" });
      } else if (tagName === "a") {
        ranges.push({
          start,
          end,
          type: "link",
          url: element.getAttribute("href") || "",
        });
      } else if (tagName.match(/^h[1-6]$/)) {
        ranges.push({
          start,
          end,
          type: "heading",
          headingLevel: Number.parseInt(tagName.charAt(1)),
          isParagraph: true,
        });
      } else if (tagName === "p") {
        const nextSibling = element.nextSibling;
        if (nextSibling && nextSibling.nodeType === 1) {
          plainText += "\n";
          currentPos += 1;
        }
      }
    }
  }

  if (wrapper) {
    for (const child of Array.from(wrapper.childNodes)) {
      processNode(child);
    }
  }

  return { plainText, ranges };
}

/**
 * Converts formatting ranges to Google Docs API requests.
 */
function formattingRangesToRequests(
  ranges: FormatRange[],
  startIndex: number
): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];
  const headingStyles: Record<number, string> = {
    1: "HEADING_1",
    2: "HEADING_2",
    3: "HEADING_3",
    4: "HEADING_4",
    5: "HEADING_5",
    6: "HEADING_6",
  };

  for (const range of ranges) {
    if (range.type === "heading" && range.headingLevel && range.isParagraph) {
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: {
            namedStyleType: headingStyles[range.headingLevel] || "HEADING_1",
          },
          range: {
            startIndex: startIndex + range.start,
            endIndex: startIndex + range.end,
          },
          fields: "namedStyleType",
        },
      });
      continue;
    }

    const textStyle: docs_v1.Schema$TextStyle = {};
    const fields: string[] = [];

    if (range.type === "bold") {
      textStyle.bold = true;
      fields.push("bold");
    } else if (range.type === "italic") {
      textStyle.italic = true;
      fields.push("italic");
    } else if (range.type === "code") {
      textStyle.weightedFontFamily = { fontFamily: "Courier New", weight: 400 };
      textStyle.backgroundColor = {
        color: { rgbColor: { red: 0.95, green: 0.95, blue: 0.95 } },
      };
      fields.push("weightedFontFamily", "backgroundColor");
    } else if (range.type === "link" && range.url) {
      textStyle.link = { url: range.url };
      textStyle.foregroundColor = {
        color: { rgbColor: { red: 0.06, green: 0.33, blue: 0.8 } },
      };
      textStyle.underline = true;
      fields.push("link", "foregroundColor", "underline");
    }

    if (fields.length > 0) {
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: startIndex + range.start,
            endIndex: startIndex + range.end,
          },
          textStyle,
          fields: fields.join(","),
        },
      });
    }
  }

  return requests;
}

/**
 * Parses markdown text and generates Google Docs API requests for formatting.
 */
export function parseMarkdownToDocsRequests(
  markdown: string,
  startIndex: number
): ParsedMarkdown {
  const html = markdownToHtml(markdown);

  if (!html || html === markdown) {
    return { plainText: markdown, formattingRequests: [] };
  }

  const { plainText, ranges } = htmlToFormattingRanges(html);
  const formattingRequests = formattingRangesToRequests(ranges, startIndex);

  return { plainText, formattingRequests };
}

/**
 * Handles line breaks and paragraphs in markdown text
 */
export function processMarkdownLineBreaks(text: string): string {
  return text.replace(/\n\n+/g, "\n\n");
}
