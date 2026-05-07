import { z } from "zod";

import { fetchHtml, htmlToStructuredText } from "../fetch.js";
import { Benchmark } from "../../schema.js";
import type {
  BenchmarkRecord,
  BenchmarkScraper,
  RunBenchmarkScraper,
} from "./types.js";

const ExtractionResult = z.object({
  records: z.array(z.record(z.string(), z.unknown())),
});

const SYSTEM_PROMPT = `You are a precise extractor for AI / LLM benchmark leaderboards.

For each model on the page, output one record PER benchmark score. Output ONLY benchmarks the page explicitly states; do NOT invent or estimate scores.

Each record must follow this shape:
{
  model_label: string,           // model name as printed on the page
  model_api_id?: string,         // API identifier if shown (e.g. "claude-opus-4-5"); omit if absent
  provider_hint?: string,        // e.g. "Anthropic", "OpenAI"; omit if unclear
  benchmark: {
    name: string,                // lowercase, dash-separated. Examples below.
    score: number,               // numeric value as printed
    unit: string | null,         // "%", "elo", "pass@1", "score", etc. null if dimensionless
    source_name: string,         // e.g. "Artificial Analysis", "LMArena"
    as_of: string                // YYYY-MM-DD; today's date if not stated
  }
}

Top-level shape:
{ records: BenchmarkRecord[] }

Benchmark name normalization (use these canonical forms when applicable):
- "MMLU" → "mmlu"
- "MMLU-Pro" → "mmlu-pro"
- "GPQA Diamond" → "gpqa-diamond"
- "HumanEval" → "humaneval"
- "SWE-Bench Verified" → "swe-bench-verified"
- "AIME 2024" → "aime-2024"
- "AIME 2025" → "aime-2025"
- "LiveCodeBench" → "livecodebench"
- "MATH" → "math"
- "MATH-500" → "math-500"
- "MMMU" → "mmmu"
- "Quality Index" / "Intelligence Index" → "artificial-analysis-intelligence-index"
- "Arena Score" / "LMArena Elo" → "lmarena-elo"
- "Aider Polyglot" → "aider-polyglot"

For percentages, store the percent value (e.g. 78.4 for "78.4%"), unit "%".
For Elo, store the Elo number, unit "elo".
For pass@1 fractions like "0.75", convert to "75" with unit "%" only if the page renders it as a percentage; otherwise keep the raw number with unit "score" or null.
Skip rows that don't have a numeric score.`;

export const runBenchmarkScraper: RunBenchmarkScraper = async (scraper, options) => {
  const { llm, htmlByUrl = {}, now = new Date().toISOString() } = options;
  const today = now.slice(0, 10);

  const pageContents: { url: string; text: string }[] = [];
  for (const url of scraper.urls) {
    const html = htmlByUrl[url] ?? (await fetchHtml(url));
    pageContents.push({ url, text: htmlToStructuredText(html) });
  }

  const userPrompt =
    `Source: ${scraper.source.name}\nSource URL: ${scraper.source.url}\n\n` +
    pageContents.map((p) => `--- ${p.url} ---\n${p.text}`).join("\n\n") +
    `\n\nExtract every (model, benchmark, score) triple visible above. If "as_of" is not stated, use ${today}.`;

  const extracted = await llm.extract({
    system: SYSTEM_PROMPT + (scraper.hints ? `\n\nSource-specific hints:\n${scraper.hints}` : ""),
    user: userPrompt,
    schema: ExtractionResult,
    schemaName: "result",
  });

  const records: BenchmarkRecord[] = [];
  for (const raw of extracted.records) {
    const candidate = {
      model_label: typeof raw.model_label === "string" ? raw.model_label : "",
      model_api_id: typeof raw.model_api_id === "string" ? raw.model_api_id : undefined,
      provider_hint: typeof raw.provider_hint === "string" ? raw.provider_hint : undefined,
      benchmark: {
        ...(raw.benchmark as Record<string, unknown> | undefined),
        source: scraper.source.url,
      },
    };

    const benchmark = Benchmark.safeParse(candidate.benchmark);
    if (!benchmark.success || !candidate.model_label) {
      console.warn(
        `[benchmarks/${scraper.source.id}] dropped record (${candidate.model_label || "no label"}): ${benchmark.success ? "missing model_label" : benchmark.error.toString().slice(0, 200)}`,
      );
      continue;
    }
    records.push({
      model_label: candidate.model_label,
      ...(candidate.model_api_id ? { model_api_id: candidate.model_api_id } : {}),
      ...(candidate.provider_hint ? { provider_hint: candidate.provider_hint } : {}),
      benchmark: benchmark.data,
    });
  }

  return records;
};

export function makeBenchmarkScraper(scraper: BenchmarkScraper): BenchmarkScraper {
  return scraper;
}
