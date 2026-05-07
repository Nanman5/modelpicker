import { z } from "zod";

export const CAPABILITIES = [
  "tool_use",
  "vision",
  "audio_input",
  "audio_output",
  "video_input",
  "extended_thinking",
  "prompt_caching",
  "structured_output",
  "json_mode",
  "function_calling",
  "fine_tunable",
  "code_interpreter",
  "web_search",
  "embeddings",
  "image_generation",
  "video_generation",
  "speech_synthesis",
] as const;

export const MODALITIES = ["text", "image", "audio", "video"] as const;

export const SOURCE_TYPES = [
  "pricing_page",
  "docs",
  "model_card",
  "blog",
  "api",
  "benchmark_aggregator",
] as const;

export const Capability = z.enum(CAPABILITIES);
export const Modality = z.enum(MODALITIES);
export const SourceType = z.enum(SOURCE_TYPES);

export const Source = z.object({
  type: SourceType,
  url: z.string().url(),
  scraped_at: z.string().datetime(),
});

export const Benchmark = z.object({
  /** Benchmark identifier; lowercase, dash-separated. e.g. "mmlu-pro", "swe-bench-verified", "gpqa-diamond", "lmarena-elo". */
  name: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  /** Numeric score. For percentages use the percent value (e.g. 78.4 for 78.4%). For Elo, the Elo number. */
  score: z.number(),
  /** Unit of the score: "%", "elo", "pass@1", "score", etc. null if dimensionless. */
  unit: z.string().nullable().default(null),
  /** Where the score came from. */
  source: z.string().url(),
  /** Human-readable source attribution. e.g. "Artificial Analysis", "LMArena", "Provider self-reported". */
  source_name: z.string().min(1),
  /** When the score was published or scraped. YYYY-MM-DD. */
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const Pricing = z.object({
  input_per_million_usd: z.number().nonnegative().nullable(),
  output_per_million_usd: z.number().nonnegative().nullable(),
  cache_read_per_million_usd: z.number().nonnegative().nullable().default(null),
  cache_write_per_million_usd: z.number().nonnegative().nullable().default(null),
});

export const Modalities = z.object({
  input: z.array(Modality),
  output: z.array(Modality),
});

const ID_REGEX = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/;

export const ModelFact = z.object({
  id: z
    .string()
    .regex(ID_REGEX, "id must be `<provider>/<slug>` (lowercase, dash/dot/underscore allowed in slug)"),
  provider: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),

  context_window: z.number().int().positive().nullable(),
  max_output_tokens: z.number().int().positive().nullable(),

  pricing: Pricing,
  modalities: Modalities,
  capabilities: z.array(Capability).default([]),

  knowledge_cutoff: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "knowledge_cutoff must be YYYY-MM")
    .nullable(),
  released_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "released_at must be YYYY-MM-DD")
    .nullable(),

  deprecated: z.boolean().default(false),
  deprecation_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "deprecation_date must be YYYY-MM-DD")
    .nullable()
    .default(null),

  benchmarks: z.array(Benchmark).default([]),

  last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "last_updated must be YYYY-MM-DD"),
  sources: z.array(Source).min(1, "at least one source is required"),
});

export const Provider = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  homepage: z.string().url(),
  docs_url: z.string().url().nullable().default(null),
  pricing_url: z.string().url().nullable().default(null),
});

export const ProviderSnapshot = z.object({
  provider: Provider,
  models: z.array(ModelFact),
  scraped_at: z.string().datetime(),
});

export const Dataset = z.object({
  $schema: z.string().default("https://modelpicker.dev/schema/v1.json"),
  version: z.literal(1),
  generated_at: z.string().datetime(),
  providers: z.array(Provider),
  models: z.array(ModelFact),
});

export type Capability = z.infer<typeof Capability>;
export type Modality = z.infer<typeof Modality>;
export type SourceType = z.infer<typeof SourceType>;
export type Source = z.infer<typeof Source>;
export type Pricing = z.infer<typeof Pricing>;
export type Modalities = z.infer<typeof Modalities>;
export type Benchmark = z.infer<typeof Benchmark>;
export type ModelFact = z.infer<typeof ModelFact>;
export type Provider = z.infer<typeof Provider>;
export type ProviderSnapshot = z.infer<typeof ProviderSnapshot>;
export type Dataset = z.infer<typeof Dataset>;
