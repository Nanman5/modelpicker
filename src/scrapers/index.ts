import type { Scraper } from "./types.js";
import { anthropicScraper } from "./anthropic.js";
import { openaiScraper } from "./openai.js";
import { googleScraper } from "./google.js";
import { xaiScraper } from "./xai.js";

export const scrapers: Scraper[] = [
  anthropicScraper,
  openaiScraper,
  googleScraper,
  xaiScraper,
];

export { runScraper } from "./run.js";
export { createLLMClient } from "./extract.js";
export type { Scraper, ScraperPage, RunScraperOptions } from "./types.js";
