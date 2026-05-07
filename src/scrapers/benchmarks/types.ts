import type { Benchmark } from "../../schema.js";
import type { LLMClient } from "../extract.js";

/**
 * A single benchmark observation, plus enough hints to map it back to a model.
 * The pipeline's `attachBenchmarks` resolves these to ModelFact entries.
 */
export interface BenchmarkRecord {
  /** Free-text model identifier as it appears on the source. e.g. "Claude Opus 4.5", "claude-opus-4-5", "GPT-5". */
  model_label: string;
  /** Optional API id when the source provides it. e.g. "claude-opus-4-5". */
  model_api_id?: string;
  /** Optional provider hint to constrain matching. */
  provider_hint?: string;
  benchmark: Benchmark;
}

export interface BenchmarkSource {
  id: string;
  name: string;
  url: string;
}

export interface BenchmarkScraper {
  source: BenchmarkSource;
  /** Pages to fetch (multiple if the leaderboard spans tabs). */
  urls: string[];
  /** Provider-specific guidance for the extraction LLM. */
  hints?: string;
}

export interface RunBenchmarkScraperOptions {
  llm: LLMClient;
  htmlByUrl?: Record<string, string>;
  now?: string;
}

export type RunBenchmarkScraper = (
  scraper: BenchmarkScraper,
  options: RunBenchmarkScraperOptions,
) => Promise<BenchmarkRecord[]>;
