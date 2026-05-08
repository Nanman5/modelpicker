import type { BenchmarkScraper } from "./types.js";
import { artificialAnalysisScraper } from "./artificial-analysis.js";
import { aiderScraper } from "./aider.js";

export const benchmarkScrapers: BenchmarkScraper[] = [
  artificialAnalysisScraper,
  aiderScraper,
];

export { runBenchmarkScraper } from "./run.js";
export { attachBenchmarks } from "./attach.js";
export type {
  BenchmarkScraper,
  BenchmarkSource,
  BenchmarkRecord,
  RunBenchmarkScraperOptions,
} from "./types.js";
