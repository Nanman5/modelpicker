import type { Provider, ProviderSnapshot, SourceType } from "../schema.js";
import type { LLMClient } from "./extract.js";

export interface ScraperPage {
  type: SourceType;
  url: string;
}

export interface Scraper {
  provider: Provider;
  pages: ScraperPage[];
  /** Provider-specific guidance appended to the extraction prompt. Optional. */
  hints?: string;
}

export interface RunScraperOptions {
  llm: LLMClient;
  /** Provide cached HTML keyed by URL for tests / offline runs. */
  htmlByUrl?: Record<string, string>;
  /** Override "today" timestamp for deterministic tests. ISO string. */
  now?: string;
}

export type RunScraper = (scraper: Scraper, options: RunScraperOptions) => Promise<ProviderSnapshot>;
