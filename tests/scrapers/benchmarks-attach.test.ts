import { describe, it, expect } from "vitest";

import { attachBenchmarks } from "../../src/scrapers/benchmarks/attach.js";
import type { BenchmarkRecord } from "../../src/scrapers/benchmarks/types.js";
import type { Benchmark, ModelFact } from "../../src/schema.js";

const NOW_DATE = "2026-05-07";

function makeModel(p: string, slug: string, overrides: Partial<ModelFact> = {}): ModelFact {
  return {
    id: `${p}/${slug}`,
    provider: p,
    name: `${p} ${slug}`,
    aliases: [],
    context_window: 100000,
    max_output_tokens: 8000,
    pricing: {
      input_per_million_usd: 1,
      output_per_million_usd: 2,
      cache_read_per_million_usd: null,
      cache_write_per_million_usd: null,
    },
    modalities: { input: ["text"], output: ["text"] },
    capabilities: [],
    knowledge_cutoff: null,
    released_at: null,
    deprecated: false,
    deprecation_date: null,
    benchmarks: [],
    last_updated: NOW_DATE,
    sources: [{ type: "docs", url: `https://${p}.example/docs`, scraped_at: `${NOW_DATE}T00:00:00.000Z` }],
    ...overrides,
  };
}

const makeBenchmark = (overrides: Partial<Benchmark> = {}): Benchmark => ({
  name: "mmlu-pro",
  score: 80,
  unit: "%",
  source: "https://artificialanalysis.ai/models",
  source_name: "Artificial Analysis",
  as_of: NOW_DATE,
  ...overrides,
});

describe("attachBenchmarks", () => {
  it("matches by provider hint + api id", () => {
    const models = [makeModel("anthropic", "claude-opus-4-5")];
    const records: BenchmarkRecord[] = [
      {
        model_label: "Claude Opus 4.5",
        model_api_id: "claude-opus-4-5",
        provider_hint: "Anthropic",
        benchmark: makeBenchmark(),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.attached).toBe(1);
    expect(result.dropped).toBe(0);
    expect(result.models[0]!.benchmarks).toHaveLength(1);
    expect(result.models[0]!.benchmarks[0]!.name).toBe("mmlu-pro");
  });

  it("matches by alias when api id missing", () => {
    const models = [makeModel("anthropic", "claude-opus-4-5", { aliases: ["claude-opus-latest"] })];
    const records: BenchmarkRecord[] = [
      {
        model_label: "claude-opus-latest",
        benchmark: makeBenchmark({ name: "gpqa-diamond", score: 70 }),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.attached).toBe(1);
    expect(result.models[0]!.benchmarks[0]!.name).toBe("gpqa-diamond");
  });

  it("matches by name (case + punctuation insensitive)", () => {
    const models = [makeModel("openai", "gpt-5", { name: "GPT-5" })];
    const records: BenchmarkRecord[] = [
      {
        model_label: "gpt 5",
        benchmark: makeBenchmark({ name: "humaneval", score: 92 }),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.attached).toBe(1);
    expect(result.models[0]!.benchmarks[0]!.name).toBe("humaneval");
  });

  it("drops records that match no model and never silently misattaches", () => {
    const models = [makeModel("anthropic", "claude-opus-4-5")];
    const warnings: string[] = [];
    const records: BenchmarkRecord[] = [
      {
        model_label: "Some Unknown Model",
        provider_hint: "Mistral",
        benchmark: makeBenchmark(),
      },
    ];
    const result = attachBenchmarks(models, records, (m) => warnings.push(m));
    expect(result.attached).toBe(0);
    expect(result.dropped).toBe(1);
    expect(result.models[0]!.benchmarks).toHaveLength(0);
    expect(warnings.some((w) => w.includes("Some Unknown Model"))).toBe(true);
  });

  it("dedupes by (name + source_name) — higher score wins (so xhigh isn't overwritten by high)", () => {
    const high = makeBenchmark({ score: 80, as_of: NOW_DATE });
    const models = [makeModel("anthropic", "claude-opus-4-5", { benchmarks: [high] })];
    const records: BenchmarkRecord[] = [
      {
        model_label: "Claude Opus 4.5",
        provider_hint: "Anthropic",
        benchmark: makeBenchmark({ score: 70, as_of: NOW_DATE }),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.models[0]!.benchmarks).toHaveLength(1);
    expect(result.models[0]!.benchmarks[0]!.score).toBe(80);
  });

  it("dedupe upgrades to higher score when new record is better", () => {
    const lower = makeBenchmark({ score: 59 });
    const models = [makeModel("openai", "gpt-5.5", { benchmarks: [lower] })];
    const records: BenchmarkRecord[] = [
      {
        model_label: "GPT-5.5 (xhigh)",
        provider_hint: "OpenAI",
        benchmark: makeBenchmark({ score: 60 }),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.models[0]!.benchmarks[0]!.score).toBe(60);
  });

  it("strips parenthetical reasoning-effort tags from model label before matching", () => {
    const models = [makeModel("anthropic", "claude-opus-4-7", { name: "Claude Opus 4.7" })];
    const records: BenchmarkRecord[] = [
      {
        model_label: "Claude Opus 4.7 (Adaptive Reasoning, Max Effort)",
        provider_hint: "Anthropic",
        benchmark: makeBenchmark({ name: "artificial-analysis-intelligence-index", score: 78 }),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.attached).toBe(1);
    expect(result.dropped).toBe(0);
  });

  it("matches 'Claude Opus 4.7' label to anthropic/claude-opus-4-7 by slug", () => {
    const models = [makeModel("anthropic", "claude-opus-4-7", { name: "Claude Opus 4.7" })];
    const records: BenchmarkRecord[] = [
      {
        model_label: "Claude Opus 4.7",
        provider_hint: "Anthropic",
        benchmark: makeBenchmark(),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.attached).toBe(1);
  });

  it("does not match across providers when provider_hint is given", () => {
    const models = [
      makeModel("anthropic", "shared-name", { name: "Shared Name" }),
      makeModel("openai", "shared-name", { name: "Shared Name" }),
    ];
    const records: BenchmarkRecord[] = [
      {
        model_label: "Shared Name",
        provider_hint: "OpenAI",
        benchmark: makeBenchmark(),
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.attached).toBe(1);
    const openaiModel = result.models.find((m) => m.id === "openai/shared-name")!;
    const anthropicModel = result.models.find((m) => m.id === "anthropic/shared-name")!;
    expect(openaiModel.benchmarks).toHaveLength(1);
    expect(anthropicModel.benchmarks).toHaveLength(0);
  });

  it("keeps benchmarks from different sources side-by-side", () => {
    const aa = makeBenchmark({ source_name: "Artificial Analysis", score: 80 });
    const lm = makeBenchmark({ source_name: "LMArena", score: 75, source: "https://lmarena.ai/leaderboard" });
    const models = [makeModel("anthropic", "claude-opus-4-5", { benchmarks: [aa] })];
    const records: BenchmarkRecord[] = [
      {
        model_label: "Claude Opus 4.5",
        provider_hint: "Anthropic",
        benchmark: lm,
      },
    ];
    const result = attachBenchmarks(models, records, () => {});
    expect(result.models[0]!.benchmarks).toHaveLength(2);
  });
});
