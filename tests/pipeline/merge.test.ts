import { describe, it, expect } from "vitest";

import { mergeSnapshots } from "../../src/pipeline/merge.js";
import type { Dataset, ProviderSnapshot, Provider, ModelFact } from "../../src/schema.js";

const NOW = "2026-05-07T12:00:00.000Z";

function makeProvider(id: string): Provider {
  return {
    id,
    name: id.toUpperCase(),
    homepage: `https://${id}.example.com`,
    docs_url: `https://${id}.example.com/docs`,
    pricing_url: `https://${id}.example.com/pricing`,
  };
}

function makeModel(provider: string, slug: string): ModelFact {
  return {
    id: `${provider}/${slug}`,
    provider,
    name: `${provider} ${slug}`,
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
    capabilities: ["tool_use"],
    knowledge_cutoff: null,
    released_at: null,
    deprecated: false,
    deprecation_date: null,
    benchmarks: [],
    last_updated: "2026-05-07",
    sources: [
      { type: "docs", url: `https://${provider}.example.com/docs`, scraped_at: NOW },
    ],
  };
}

function snap(provider: string, slugs: string[]): ProviderSnapshot {
  return {
    provider: makeProvider(provider),
    models: slugs.map((s) => makeModel(provider, s)),
    scraped_at: NOW,
  };
}

describe("mergeSnapshots", () => {
  it("creates a fresh dataset from snapshots when no previous exists", () => {
    const result = mergeSnapshots(null, [snap("anthropic", ["a", "b"])], NOW);
    expect(result.dataset.providers.map((p) => p.id)).toEqual(["anthropic"]);
    expect(result.dataset.models.map((m) => m.id)).toEqual([
      "anthropic/a",
      "anthropic/b",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("replaces a provider's models when a new snapshot is provided", () => {
    const previous: Dataset = {
      $schema: "https://modelpicker.dev/schema/v1.json",
      version: 1,
      generated_at: NOW,
      providers: [makeProvider("anthropic")],
      models: [makeModel("anthropic", "old-1"), makeModel("anthropic", "old-2")],
    };
    const result = mergeSnapshots(previous, [snap("anthropic", ["new-1"])], NOW);
    expect(result.dataset.models.map((m) => m.id)).toEqual(["anthropic/new-1"]);
    expect(result.warnings).toEqual([]);
  });

  it("keeps prior provider data when its snapshot is missing", () => {
    const previous: Dataset = {
      $schema: "https://modelpicker.dev/schema/v1.json",
      version: 1,
      generated_at: NOW,
      providers: [makeProvider("anthropic"), makeProvider("openai")],
      models: [makeModel("anthropic", "a"), makeModel("openai", "x")],
    };
    const result = mergeSnapshots(previous, [snap("anthropic", ["a-new"])], NOW);
    const ids = result.dataset.models.map((m) => m.id).sort();
    expect(ids).toEqual(["anthropic/a-new", "openai/x"]);
    expect(result.warnings).toContain(
      "[openai] no fresh snapshot this run — kept prior data",
    );
  });

  it("keeps prior data when a snapshot returns zero models (treated as failure)", () => {
    const previous: Dataset = {
      $schema: "https://modelpicker.dev/schema/v1.json",
      version: 1,
      generated_at: NOW,
      providers: [makeProvider("anthropic")],
      models: [makeModel("anthropic", "a")],
    };
    const result = mergeSnapshots(previous, [snap("anthropic", [])], NOW);
    expect(result.dataset.models.map((m) => m.id)).toEqual(["anthropic/a"]);
    expect(result.warnings.some((w) => w.includes("0 models"))).toBe(true);
  });

  it("preserves benchmarks across provider re-scrapes (provider snapshots don't fill benchmarks)", () => {
    const priorWithBench: ModelFact = {
      ...makeModel("anthropic", "claude-opus-4-7"),
      benchmarks: [
        {
          name: "mmlu-pro",
          score: 84,
          unit: "%",
          source: "https://artificialanalysis.ai/models",
          source_name: "Artificial Analysis",
          as_of: "2026-05-07",
        },
      ],
    };
    const previous: Dataset = {
      $schema: "https://modelpicker.dev/schema/v1.json",
      version: 1,
      generated_at: NOW,
      providers: [makeProvider("anthropic")],
      models: [priorWithBench],
    };
    // New snapshot has the same model id, but benchmarks: [] (provider scraper
    // doesn't fill them). Merge should preserve the prior benchmarks.
    const result = mergeSnapshots(
      previous,
      [snap("anthropic", ["claude-opus-4-7"])],
      NOW,
    );
    expect(result.dataset.models[0]!.benchmarks).toHaveLength(1);
    expect(result.dataset.models[0]!.benchmarks[0]!.name).toBe("mmlu-pro");
  });

  it("merges multiple providers and sorts deterministically", () => {
    const result = mergeSnapshots(
      null,
      [snap("openai", ["x"]), snap("anthropic", ["b", "a"])],
      NOW,
    );
    expect(result.dataset.providers.map((p) => p.id)).toEqual([
      "anthropic",
      "openai",
    ]);
    expect(result.dataset.models.map((m) => m.id)).toEqual([
      "anthropic/a",
      "anthropic/b",
      "openai/x",
    ]);
  });
});
