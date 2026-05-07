import { fetch as undiciFetch } from "undici";
import * as cheerio from "cheerio";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 modelpicker-scraper/0.1";

export async function fetchHtml(url: string): Promise<string> {
  const res = await undiciFetch(url, {
    method: "GET",
    headers: {
      "user-agent": DEFAULT_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  }

  return await res.text();
}

/**
 * Strip HTML to a compact text representation suitable for LLM extraction.
 * Removes scripts, styles, navigation chrome; keeps structure of headings, lists, tables.
 */
export function htmlToCleanText(html: string, opts: { maxChars?: number } = {}): string {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, iframe, link, meta, head").remove();
  $("nav, header, footer, aside").remove();
  $("[role='navigation'], [role='banner'], [role='contentinfo']").remove();
  $("[aria-hidden='true']").remove();

  const root = $("main").length ? $("main") : $("body");

  const text = root
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const max = opts.maxChars ?? 60_000;
  return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
}

/**
 * Like htmlToCleanText but preserves table structure as pipe-delimited rows
 * (LLMs read these reliably).
 */
export function htmlToStructuredText(html: string, opts: { maxChars?: number } = {}): string {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, iframe, link, meta, head").remove();
  $("nav, header, footer, aside").remove();
  $("[aria-hidden='true']").remove();

  $("table").each((_, table) => {
    const rows: string[] = [];
    $(table)
      .find("tr")
      .each((_, tr) => {
        const cells = $(tr)
          .find("th, td")
          .map((_, c) => $(c).text().trim().replace(/\s+/g, " "))
          .get();
        if (cells.length) rows.push("| " + cells.join(" | ") + " |");
      });
    $(table).replaceWith(`\n\n${rows.join("\n")}\n\n`);
  });

  $("h1, h2, h3, h4").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const level = parseInt(tag.slice(1), 10);
    const prefix = "#".repeat(level);
    $(el).replaceWith(`\n\n${prefix} ${$(el).text().trim()}\n\n`);
  });

  $("li").each((_, el) => {
    $(el).replaceWith(`- ${$(el).text().trim()}\n`);
  });

  const root = $("main").length ? $("main") : $("body");
  const text = root
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const max = opts.maxChars ?? 80_000;
  return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
}
