import { z } from "zod";

import {
  CAPABILITIES,
  MODALITIES,
  type Benchmark,
  type Dataset,
  type ModelFact,
} from "../schema.js";

export interface ToolContext {
  dataset: Dataset;
}

interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

const json = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data as Record<string, unknown>,
});

const error = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

// ---------- list_models ----------

export const listModelsInputShape = {
  provider: z
    .string()
    .optional()
    .describe('Filter by provider id, e.g. "anthropic", "openai", "google", "xai".'),
  capability: z
    .enum(CAPABILITIES)
    .optional()
    .describe("Only models with this capability."),
  modality: z
    .enum(MODALITIES)
    .optional()
    .describe("Only models that accept this input modality."),
  max_input_price_per_million_usd: z
    .number()
    .positive()
    .optional()
    .describe("Max input price in USD per million tokens."),
  min_context_window: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Minimum context window in tokens."),
  include_deprecated: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include deprecated/legacy models. Defaults to false."),
};

export function listModels(ctx: ToolContext, args: {
  provider?: string;
  capability?: (typeof CAPABILITIES)[number];
  modality?: (typeof MODALITIES)[number];
  max_input_price_per_million_usd?: number;
  min_context_window?: number;
  include_deprecated?: boolean;
}): ToolResult {
  const { dataset } = ctx;
  let models = dataset.models;

  if (!args.include_deprecated) models = models.filter((m) => !m.deprecated);
  if (args.provider) models = models.filter((m) => m.provider === args.provider);
  if (args.capability) models = models.filter((m) => m.capabilities.includes(args.capability!));
  if (args.modality) models = models.filter((m) => m.modalities.input.includes(args.modality!));
  if (typeof args.max_input_price_per_million_usd === "number") {
    const cap = args.max_input_price_per_million_usd;
    models = models.filter((m) => {
      const p = m.pricing.input_per_million_usd;
      return p !== null && p <= cap;
    });
  }
  if (typeof args.min_context_window === "number") {
    const min = args.min_context_window;
    models = models.filter((m) => m.context_window !== null && m.context_window >= min);
  }

  return json({
    dataset_generated_at: dataset.generated_at,
    count: models.length,
    models,
  });
}

// ---------- get_model ----------

export const getModelInputShape = {
  id: z.string().describe('Full model id, e.g. "anthropic/claude-opus-4-5".'),
};

export function getModel(ctx: ToolContext, args: { id: string }): ToolResult {
  const model = ctx.dataset.models.find((m) => m.id === args.id || m.aliases.includes(args.id));
  if (!model) {
    return error(
      `No model with id or alias "${args.id}". Use list_models to see what's available.`,
    );
  }
  return json({
    dataset_generated_at: ctx.dataset.generated_at,
    model,
  });
}

// ---------- list_providers ----------

export const listProvidersInputShape = {} as const;

export function listProviders(ctx: ToolContext): ToolResult {
  const counts = new Map<string, number>();
  for (const m of ctx.dataset.models) {
    counts.set(m.provider, (counts.get(m.provider) ?? 0) + 1);
  }
  const providers = ctx.dataset.providers.map((p) => ({
    ...p,
    model_count: counts.get(p.id) ?? 0,
  }));
  return json({
    dataset_generated_at: ctx.dataset.generated_at,
    count: providers.length,
    providers,
  });
}

// ---------- get_provider ----------

export const getProviderInputShape = {
  id: z.string().describe('Provider id, e.g. "anthropic".'),
};

export function getProvider(ctx: ToolContext, args: { id: string }): ToolResult {
  const provider = ctx.dataset.providers.find((p) => p.id === args.id);
  if (!provider) {
    return error(
      `No provider with id "${args.id}". Use list_providers to see what's available.`,
    );
  }
  const models = ctx.dataset.models.filter((m) => m.provider === provider.id);
  return json({
    dataset_generated_at: ctx.dataset.generated_at,
    provider: { ...provider, models },
  });
}

// ---------- compare_raw ----------

export const compareRawInputShape = {
  ids: z
    .array(z.string())
    .min(2)
    .describe('Two or more model ids, e.g. ["anthropic/claude-opus-4-5","openai/gpt-5"].'),
};

const COMPARE_FIELDS: { key: string; pick: (m: ModelFact) => unknown }[] = [
  { key: "id", pick: (m) => m.id },
  { key: "provider", pick: (m) => m.provider },
  { key: "name", pick: (m) => m.name },
  { key: "context_window", pick: (m) => m.context_window },
  { key: "max_output_tokens", pick: (m) => m.max_output_tokens },
  { key: "input_per_million_usd", pick: (m) => m.pricing.input_per_million_usd },
  { key: "output_per_million_usd", pick: (m) => m.pricing.output_per_million_usd },
  { key: "cache_read_per_million_usd", pick: (m) => m.pricing.cache_read_per_million_usd },
  { key: "cache_write_per_million_usd", pick: (m) => m.pricing.cache_write_per_million_usd },
  { key: "modalities_input", pick: (m) => m.modalities.input },
  { key: "modalities_output", pick: (m) => m.modalities.output },
  { key: "capabilities", pick: (m) => m.capabilities },
  { key: "knowledge_cutoff", pick: (m) => m.knowledge_cutoff },
  { key: "released_at", pick: (m) => m.released_at },
  { key: "deprecated", pick: (m) => m.deprecated },
];

// ---------- list_benchmarks ----------

export const listBenchmarksInputShape = {
  model_id: z
    .string()
    .optional()
    .describe('Restrict to one model (id or alias), e.g. "anthropic/claude-opus-4-5".'),
  benchmark_name: z
    .string()
    .optional()
    .describe(
      'Restrict to one benchmark, e.g. "mmlu-pro", "swe-bench-verified", "lmarena-elo".',
    ),
  source_name: z
    .string()
    .optional()
    .describe('Restrict to one source attribution, e.g. "Artificial Analysis".'),
};

export function listBenchmarks(
  ctx: ToolContext,
  args: { model_id?: string; benchmark_name?: string; source_name?: string },
): ToolResult {
  const rows: { model_id: string; model_name: string; provider: string; benchmark: Benchmark }[] = [];

  const targetModels = args.model_id
    ? ctx.dataset.models.filter(
        (m) => m.id === args.model_id || m.aliases.includes(args.model_id!),
      )
    : ctx.dataset.models;

  if (args.model_id && targetModels.length === 0) {
    return error(
      `No model with id or alias "${args.model_id}". Use list_models to see what's available.`,
    );
  }

  for (const m of targetModels) {
    for (const b of m.benchmarks) {
      if (args.benchmark_name && b.name !== args.benchmark_name) continue;
      if (args.source_name && b.source_name !== args.source_name) continue;
      rows.push({
        model_id: m.id,
        model_name: m.name,
        provider: m.provider,
        benchmark: b,
      });
    }
  }

  const benchmarkNames = Array.from(new Set(rows.map((r) => r.benchmark.name))).sort();
  const sources = Array.from(new Set(rows.map((r) => r.benchmark.source_name))).sort();

  return json({
    dataset_generated_at: ctx.dataset.generated_at,
    count: rows.length,
    benchmark_names: benchmarkNames,
    source_names: sources,
    rows,
  });
}

// ---------- compare_raw ----------

export function compareRaw(ctx: ToolContext, args: { ids: string[] }): ToolResult {
  const found: ModelFact[] = [];
  const missing: string[] = [];
  for (const id of args.ids) {
    const m = ctx.dataset.models.find((x) => x.id === id || x.aliases.includes(id));
    if (m) found.push(m);
    else missing.push(id);
  }
  if (found.length < 2) {
    return error(
      `compare_raw needs at least two known models. Missing: ${JSON.stringify(missing)}.`,
    );
  }
  const fields = COMPARE_FIELDS.map((f) => f.key);
  const matrix: Record<string, unknown>[] = COMPARE_FIELDS.map((f) => {
    const row: Record<string, unknown> = { field: f.key };
    for (const m of found) row[m.id] = f.pick(m);
    return row;
  });
  return json({
    dataset_generated_at: ctx.dataset.generated_at,
    fields,
    models_found: found.map((m) => m.id),
    missing,
    matrix,
  });
}
