import { describe, it, expect } from "vitest";

import {
  compareRaw,
  getModel,
  getProvider,
  listBenchmarks,
  listModels,
  listProviders,
  type ToolContext,
} from "../../src/mcp/tools.js";
import type { Dataset, ModelFact } from "../../src/schema.js";

const NOW = "2026-05-07T12:00:00.000Z";

function makeModel(p: string, slug: string, overrides: Partial<ModelFact> = {}): ModelFact {
  return {
    id: `${p}/${slug}`,
    provider: p,
    name: `${p} ${slug}`,
    aliases: [],
    context_window: 200000,
    max_output_tokens: 8000,
    pricing: {
      input_per_million_usd: 5,
      output_per_million_usd: 15,
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
    sources: [{ type: "docs", url: `https://${p}.example/docs`, scraped_at: NOW }],
    ...overrides,
  };
}

const dataset: Dataset = {
  $schema: "https://modelpicker.dev/schema/v1.json",
  version: 1,
  generated_at: NOW,
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      homepage: "https://www.anthropic.com",
      docs_url: "https://docs.anthropic.com",
      pricing_url: "https://www.anthropic.com/pricing",
    },
    {
      id: "openai",
      name: "OpenAI",
      homepage: "https://openai.com",
      docs_url: "https://platform.openai.com/docs",
      pricing_url: "https://openai.com/api/pricing/",
    },
  ],
  models: [
    makeModel("anthropic", "claude-opus-4-5", {
      pricing: {
        input_per_million_usd: 15,
        output_per_million_usd: 75,
        cache_read_per_million_usd: 1.5,
        cache_write_per_million_usd: 18.75,
      },
      capabilities: ["tool_use", "vision", "prompt_caching"],
      modalities: { input: ["text", "image"], output: ["text"] },
      aliases: ["claude-opus-latest"],
      benchmarks: [
        {
          name: "mmlu-pro",
          score: 84,
          unit: "%",
          source: "https://artificialanalysis.ai/models",
          source_name: "Artificial Analysis",
          as_of: "2026-05-07",
        },
        {
          name: "swe-bench-verified",
          score: 75,
          unit: "%",
          source: "https://artificialanalysis.ai/models",
          source_name: "Artificial Analysis",
          as_of: "2026-05-07",
        },
      ],
    }),
    makeModel("anthropic", "claude-haiku-4-5", {
      context_window: 200000,
      pricing: {
        input_per_million_usd: 1,
        output_per_million_usd: 5,
        cache_read_per_million_usd: null,
        cache_write_per_million_usd: null,
      },
    }),
    makeModel("openai", "gpt-5", {
      context_window: 1_000_000,
      pricing: {
        input_per_million_usd: 10,
        output_per_million_usd: 30,
        cache_read_per_million_usd: 1,
        cache_write_per_million_usd: null,
      },
      capabilities: ["tool_use", "vision", "structured_output"],
      modalities: { input: ["text", "image"], output: ["text"] },
      benchmarks: [
        {
          name: "mmlu-pro",
          score: 86,
          unit: "%",
          source: "https://artificialanalysis.ai/models",
          source_name: "Artificial Analysis",
          as_of: "2026-05-07",
        },
      ],
    }),
    makeModel("openai", "gpt-4-legacy", {
      deprecated: true,
      deprecation_date: "2026-12-31",
      pricing: {
        input_per_million_usd: 30,
        output_per_million_usd: 60,
        cache_read_per_million_usd: null,
        cache_write_per_million_usd: null,
      },
    }),
  ],
};

const ctx: ToolContext = { dataset };

function structured(r: { structuredContent?: Record<string, unknown> }): Record<string, unknown> {
  if (!r.structuredContent) throw new Error("expected structuredContent");
  return r.structuredContent;
}

describe("list_models", () => {
  it("excludes deprecated by default", () => {
    const r = structured(listModels(ctx, {}));
    expect(r.count).toBe(3);
    const ids = (r.models as ModelFact[]).map((m) => m.id);
    expect(ids).not.toContain("openai/gpt-4-legacy");
  });

  it("includes deprecated when asked", () => {
    const r = structured(listModels(ctx, { include_deprecated: true }));
    expect(r.count).toBe(4);
  });

  it("filters by provider", () => {
    const r = structured(listModels(ctx, { provider: "anthropic" }));
    expect((r.models as ModelFact[]).every((m) => m.provider === "anthropic")).toBe(true);
  });

  it("filters by capability", () => {
    const r = structured(listModels(ctx, { capability: "vision" }));
    const ids = (r.models as ModelFact[]).map((m) => m.id);
    expect(ids).toEqual(["anthropic/claude-opus-4-5", "openai/gpt-5"]);
  });

  it("filters by modality", () => {
    const r = structured(listModels(ctx, { modality: "image" }));
    expect((r.models as ModelFact[]).length).toBe(2);
  });

  it("filters by max input price", () => {
    const r = structured(listModels(ctx, { max_input_price_per_million_usd: 5 }));
    const ids = (r.models as ModelFact[]).map((m) => m.id);
    expect(ids).toEqual(["anthropic/claude-haiku-4-5"]);
  });

  it("filters by min context window", () => {
    const r = structured(listModels(ctx, { min_context_window: 500_000 }));
    const ids = (r.models as ModelFact[]).map((m) => m.id);
    expect(ids).toEqual(["openai/gpt-5"]);
  });

  it("includes dataset_generated_at", () => {
    const r = structured(listModels(ctx, {}));
    expect(r.dataset_generated_at).toBe(NOW);
  });
});

describe("get_model", () => {
  it("finds by id", () => {
    const r = structured(getModel(ctx, { id: "anthropic/claude-opus-4-5" }));
    expect((r.model as ModelFact).id).toBe("anthropic/claude-opus-4-5");
  });

  it("finds by alias", () => {
    const r = structured(getModel(ctx, { id: "claude-opus-latest" }));
    expect((r.model as ModelFact).id).toBe("anthropic/claude-opus-4-5");
  });

  it("returns isError when missing", () => {
    const r = getModel(ctx, { id: "fake/model" });
    expect(r.isError).toBe(true);
  });
});

describe("list_providers", () => {
  it("returns providers with model counts (excludes deprecated from count? — no, raw count)", () => {
    const r = structured(listProviders(ctx));
    const providers = r.providers as { id: string; model_count: number }[];
    const counts = Object.fromEntries(providers.map((p) => [p.id, p.model_count]));
    expect(counts).toEqual({ anthropic: 2, openai: 2 });
  });
});

describe("get_provider", () => {
  it("returns provider with embedded models", () => {
    const r = structured(getProvider(ctx, { id: "anthropic" }));
    const provider = r.provider as { id: string; models: ModelFact[] };
    expect(provider.id).toBe("anthropic");
    expect(provider.models).toHaveLength(2);
  });

  it("returns isError when provider missing", () => {
    const r = getProvider(ctx, { id: "noprov" });
    expect(r.isError).toBe(true);
  });
});

describe("list_benchmarks", () => {
  it("returns all benchmark rows when no filter", () => {
    const r = structured(listBenchmarks(ctx, {}));
    expect(r.count).toBe(3); // 2 on opus, 1 on gpt-5
    expect(r.benchmark_names).toEqual(["mmlu-pro", "swe-bench-verified"]);
    expect(r.source_names).toEqual(["Artificial Analysis"]);
  });

  it("filters by model_id", () => {
    const r = structured(listBenchmarks(ctx, { model_id: "openai/gpt-5" }));
    expect(r.count).toBe(1);
  });

  it("resolves alias to model", () => {
    const r = structured(listBenchmarks(ctx, { model_id: "claude-opus-latest" }));
    expect(r.count).toBe(2);
  });

  it("filters by benchmark_name", () => {
    const r = structured(listBenchmarks(ctx, { benchmark_name: "mmlu-pro" }));
    const rows = r.rows as { model_id: string }[];
    expect(rows.map((x) => x.model_id).sort()).toEqual([
      "anthropic/claude-opus-4-5",
      "openai/gpt-5",
    ]);
  });

  it("returns isError when model_id not found", () => {
    const r = listBenchmarks(ctx, { model_id: "fake/model" });
    expect(r.isError).toBe(true);
  });

  it("returns no rankings or 'best' fields", () => {
    const r = structured(listBenchmarks(ctx, {}));
    expect(JSON.stringify(r)).not.toMatch(/winner|rank|best/i);
  });
});

describe("compare_raw", () => {
  it("produces a side-by-side matrix without a winner", () => {
    const r = structured(
      compareRaw(ctx, {
        ids: ["anthropic/claude-opus-4-5", "openai/gpt-5"],
      }),
    );
    expect(r.fields).toBeInstanceOf(Array);
    expect(r.matrix).toBeInstanceOf(Array);
    const row = (r.matrix as Record<string, unknown>[]).find((x) => x.field === "context_window");
    expect(row).toBeTruthy();
    expect(row!["anthropic/claude-opus-4-5"]).toBe(200000);
    expect(row!["openai/gpt-5"]).toBe(1_000_000);
    expect(JSON.stringify(r)).not.toMatch(/winner|recommend|best/i);
  });

  it("errors when fewer than two models found", () => {
    const r = compareRaw(ctx, { ids: ["nope/one", "nope/two"] });
    expect(r.isError).toBe(true);
  });

  it("resolves aliases", () => {
    const r = structured(
      compareRaw(ctx, {
        ids: ["claude-opus-latest", "openai/gpt-5"],
      }),
    );
    expect(r.models_found).toEqual(["anthropic/claude-opus-4-5", "openai/gpt-5"]);
  });
});
