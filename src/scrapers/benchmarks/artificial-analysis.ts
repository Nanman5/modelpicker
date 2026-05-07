import type { BenchmarkScraper } from "./types.js";

export const artificialAnalysisScraper: BenchmarkScraper = {
  source: {
    id: "artificial-analysis",
    name: "Artificial Analysis",
    url: "https://artificialanalysis.ai/models",
  },
  urls: ["https://artificialanalysis.ai/models"],
  hints: `Artificial Analysis publishes a "Quality Index" / "Intelligence Index" along with several sub-benchmarks (MMLU-Pro, GPQA, HumanEval, MATH, etc.).
- Quality / Intelligence Index → benchmark name "artificial-analysis-intelligence-index", unit "score" if it's a 0-100 number, null if normalized 0-1.
- Their pricing and speed columns are NOT benchmarks — skip those (we already capture pricing).
- The "model" column may include the provider name; strip it from model_label and put it in provider_hint.
- Some scores show as fractions (e.g. "0.84"); preserve the number as-is and use unit "score" unless the column header indicates a percentage.`,
};
