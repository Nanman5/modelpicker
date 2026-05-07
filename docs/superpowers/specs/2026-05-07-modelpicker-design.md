# modelpicker — Design Spec

**Date:** 2026-05-07
**Status:** Approved
**Author:** Hernán López

## Problem

When working with AI agents (Claude, Codex, etc.) on a project, users frequently ask the agent to pick a model — for the project itself, for an internal LLM call, etc. Agents fail at this in predictable ways:

- **Knowledge cutoff**: their training data is months old; they don't know about recently released models.
- **Bias**: they over-recommend models from their own provider, or whatever was popular at training time.
- **Laziness**: they default to "use GPT-4" or "use Claude 3.5 Sonnet" without checking what currently exists or what fits the constraints.
- **Hallucination**: invented prices, invented context windows, invented capabilities.

The agent has no reliable, fresh, structured source of truth about the current LLM landscape.

## Solution

A Model Context Protocol (MCP) server that any agent can install and query. It exposes **raw, normalized, sourced facts** about LLMs — no opinions, no recommendations, no "winners". The agent retrieves clean data and applies its own judgment.

Framing: **"Crunchbase / API docs for LLMs"** — fresh, normalized, machine-readable.

## Non-goals

- The MCP does **not** recommend models. No `recommend_*` tools. No "best for X" output.
- The MCP does **not** rank or aggregate benchmarks. It surfaces raw scores with sources; the agent reasons over them.
- The MCP does **not** include subjective tiers (`latency_tier`, `quality_tier`). Benchmarks replace that need.
- The MCP does **not** wrap aggregator APIs (models.dev, OpenRouter). We scrape provider docs directly for control and freshness.
- The MCP does **not** cover every model. V1 is focused on the four providers that matter most for code/agent work: Anthropic, OpenAI, Google, xAI.

## Architecture

Two sub-systems, one repo, one dataset as the boundary:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Scraper pipe    │────▶│  data/models.    │────▶│   MCP server     │
│  (GH Action)     │     │  json (committed)│     │   (npm package)  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
   daily / manual           single source              consumed by
                            of truth, in git           Claude/Codex/etc
```

### Scraper pipeline

- One module per provider in `src/scrapers/`: `anthropic.ts`, `openai.ts`, `google.ts`, `xai.ts`.
- Each exports `{ id, name, fetch(): Promise<ProviderSnapshot> }`.
- Implementation: `undici` for fetch, `cheerio` for HTML parsing. `playwright` is a fallback only if a provider requires JS rendering.
- Pipeline (`src/pipeline/run.ts`) orchestrates all scrapers in parallel, validates each result with Zod, merges with the previous dataset (preserves prior data on partial failure), writes new `data/models.json`.
- Failure tolerance: if a single scraper throws, that provider's previous data is retained and a warning is logged. Pipeline never produces an empty dataset.

### Dataset

- `data/models.json` — single source of truth, committed to git.
- Update mechanism: GitHub Action on `schedule` (daily) and `workflow_dispatch` (manual). If the diff is non-empty, the action commits with a message like `chore(data): refresh dataset 2026-05-07` and pushes.
- Auditability: full history available via `git log -p data/models.json`.
- Distribution: bundled with the npm package at publish time. Users get fresh data with `npm update`.

### MCP server

- Built with `@modelcontextprotocol/sdk`.
- Loads `data/models.json` once at startup, holds in memory, serves all tools from memory.
- Stateless beyond the loaded dataset.

## Schema

Defined in `src/schema.ts` using Zod; types inferred via `z.infer<>`.

```ts
ModelFact {
  id: "anthropic/claude-opus-4-7"      // <provider>/<slug>, lowercase, dash-separated
  provider: "anthropic"
  name: "Claude Opus 4.7"
  aliases: ["claude-opus-latest"]      // []  if none

  context_window: 1_000_000             // tokens; null if unknown
  max_output_tokens: 64_000             // null if unknown

  pricing: {
    input_per_million_usd: 15.00
    output_per_million_usd: 75.00
    cache_read_per_million_usd: 1.50    // null if not offered
    cache_write_per_million_usd: 18.75  // null if not offered
  }

  modalities: {
    input: ["text", "image"]            // subset of: text, image, audio, video
    output: ["text"]
  }

  capabilities: ["tool_use", "vision", "extended_thinking", "prompt_caching"]
  // controlled vocabulary: tool_use, vision, audio_input, audio_output,
  //   video_input, extended_thinking, prompt_caching, structured_output,
  //   json_mode, function_calling, fine_tunable, code_interpreter,
  //   web_search, embeddings, image_generation, video_generation, speech_synthesis

  knowledge_cutoff: "2026-01"           // YYYY-MM, null if unknown
  released_at: "2026-XX-XX"             // null if unknown
  deprecated: false
  deprecation_date: null                // YYYY-MM-DD or null

  benchmarks: [
    {
      name: "mmlu-pro",                 // canonical, lowercase, dash-separated
      score: 84.2,
      unit: "%",                        // null for dimensionless
      source: "https://artificialanalysis.ai/models",
      source_name: "Artificial Analysis",
      as_of: "2026-05-07"
    }
  ]

  last_updated: "2026-05-07"            // when this record was last verified
  sources: [
    { type: "pricing_page", url: "...", scraped_at: "2026-05-07T12:00:00Z" },
    { type: "docs",         url: "...", scraped_at: "2026-05-07T12:00:00Z" }
  ]
}

Provider {
  id: "anthropic"
  name: "Anthropic"
  homepage: "https://www.anthropic.com"
  docs_url: "https://docs.anthropic.com"
  pricing_url: "https://www.anthropic.com/pricing"
}

Dataset {
  $schema: "https://modelpicker.dev/schema/v1.json"
  version: 1
  generated_at: "2026-05-07T12:00:00Z"
  providers: Provider[]
  models: ModelFact[]
}
```

## MCP tools

All responses include `dataset_generated_at` so the agent can reason about freshness.

| Tool | Input | Output |
|------|-------|--------|
| `list_models` | `{ provider?, capability?, modality?, max_input_price?, min_context?, include_deprecated? }` | `ModelFact[]` |
| `get_model` | `{ id: string }` | `ModelFact \| null` |
| `list_providers` | `{}` | `Provider[]` |
| `get_provider` | `{ id: string }` | `Provider & { models: ModelFact[] }` or `null` |
| `list_benchmarks` | `{ model_id?, benchmark_name?, source_name? }` | rows of `(model, benchmark)` with raw scores, no rankings |
| `compare_raw` | `{ ids: string[] }` | `{ fields: string[], rows: Record<string, unknown>[] }` — side-by-side matrix, no winner |

Filters in `list_models`:
- `provider`: exact match against `Provider.id`
- `capability`: model must include this in `capabilities[]`
- `modality`: model must accept this in `modalities.input[]`
- `max_input_price`: USD/M tokens
- `min_context`: tokens
- `include_deprecated`: defaults to `false`

## Stack

- **Language:** TypeScript, strict mode
- **Runtime:** Node.js 24 LTS
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Validation:** `zod`
- **HTTP:** `undici`
- **HTML parsing:** `cheerio`
- **Bundler:** `tsup` (single bin output)
- **Tests:** `vitest`
- **CI:** GitHub Actions

## Distribution

Published to npm as `modelpicker-mcp`. Users add to their MCP config:

```jsonc
// claude_desktop_config.json or .mcp.json
{
  "mcpServers": {
    "modelpicker": {
      "command": "npx",
      "args": ["-y", "modelpicker-mcp"]
    }
  }
}
```

The dataset is bundled with the package; `npm update` brings fresh data.

## Repo layout

```
modelpicker/
├── src/
│   ├── schema.ts                  # Zod schemas + inferred types
│   ├── scrapers/
│   │   ├── index.ts               # registry
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── google.ts
│   │   └── xai.ts
│   ├── pipeline/
│   │   ├── run.ts                 # CLI: `npm run scrape`
│   │   ├── merge.ts               # merge with previous dataset
│   │   └── validate.ts
│   └── mcp/
│       ├── server.ts              # MCP entrypoint (bin)
│       ├── tools/
│       │   ├── list-models.ts
│       │   ├── get-model.ts
│       │   ├── list-providers.ts
│       │   ├── get-provider.ts
│       │   └── compare-raw.ts
│       └── data-loader.ts
├── data/
│   └── models.json                # committed, source of truth
├── tests/
│   ├── fixtures/                  # HTML fixtures per provider
│   │   ├── anthropic/
│   │   ├── openai/
│   │   ├── google/
│   │   └── xai/
│   ├── scrapers/
│   ├── pipeline/
│   └── mcp/
├── .github/workflows/
│   ├── scrape-daily.yml
│   └── ci.yml
├── docs/superpowers/specs/
│   └── 2026-05-07-modelpicker-design.md
├── package.json
├── tsconfig.json
└── README.md
```

## Scraper strategy (the fragile part)

Two-stage extraction — robust against HTML changes:

1. **Fetch + clean**: `undici` fetches the page. `cheerio` strips scripts/styles/nav and extracts the relevant region as plain text or compact HTML.
2. **LLM extract**: cleaned content + a Zod-schema-derived JSON spec are sent to an LLM via NVIDIA Build API (OpenAI-compatible endpoint at `https://integrate.api.nvidia.com/v1`). The model returns structured `ModelFact[]` which is validated again with Zod.

Why LLM-assisted rather than pure CSS selectors:
- Provider pricing pages restructure constantly; selectors rot fast.
- The prompt encodes our schema, not the page's DOM. New page layouts work without code changes.
- The LLM normalizes inconsistencies ("$3.00 / 1M" vs "$3 per million tokens") cheaply.

Guards against LLM unreliability:
- Output validated by Zod; non-conforming rows are dropped (with a warning) rather than corrupting the dataset.
- Each `ModelFact.sources` records exactly which URL its data came from, so a human can verify.
- HTML fixtures saved per scrape (`tests/fixtures/{provider}/{date}-{page}.html`) so regressions can be reproduced offline.
- Tests run scrapers against fixtures with a mocked LLM that returns a known-good extraction — no live API calls in CI.

Configuration via env vars (see `.env.example`):
- `NVIDIA_API_KEY` (required to run the pipeline)
- `NVIDIA_EXTRACTION_MODEL` (default `meta/llama-3.3-70b-instruct`)
- `NVIDIA_BASE_URL` (default `https://integrate.api.nvidia.com/v1`)

The MCP server itself does NOT call the LLM — it only reads the static `data/models.json`. LLM use is confined to the scraper pipeline (run by the GH Action, not by end users at runtime).

## Benchmarks

Benchmarks are first-class facts on each `ModelFact`, sourced from independent leaderboards rather than provider self-reports. The pipeline runs in two stages:

1. **Provider stage** — per-provider scrapers fill everything except `benchmarks`.
2. **Benchmark stage** — separate scrapers in `src/scrapers/benchmarks/` (V1: Artificial Analysis) extract `(model_label, benchmark)` records, then `attachBenchmarks` in `attach.ts` resolves each record to a `ModelFact` by id → alias → name. Records that match no model are dropped with a warning; we never silently misattach.

Each benchmark record carries its own `source` URL, `source_name`, and `as_of` date, so the agent can decide how much to trust it. Multiple sources for the same `(model, benchmark)` pair coexist as separate entries — we don't average or rank.

CLI flags on `npm run scrape`:
- `--skip-benchmarks` — only refresh provider data
- `--benchmarks-only` — only refresh benchmark scores
- `--only <id1,id2>` — restrict to specific provider scrapers

## Error handling

- Scraper throws → pipeline retains previous provider data, logs warning, exits 0 (so the GH Action does not fail catastrophically on a single provider hiccup).
- Pipeline produces invalid Zod data → exits non-zero, GH Action fails, no commit.
- MCP fails to load `data/models.json` → exits with clear error message; the package is broken.

## Testing

- Scrapers: fixture-based unit tests in `tests/scrapers/`.
- Pipeline merge: unit tests with synthetic snapshots, asserting partial-failure behavior.
- MCP tools: handler tests with a small synthetic dataset.
- No integration tests against live provider pages in CI (flaky); a separate `npm run scrape:check` can be run locally / in scrape workflow.

## Open questions / future

- **Subjective tiers**: if added later, source from Artificial Analysis or LMArena and cite explicitly.
- **More providers**: Mistral, DeepSeek, Meta, Cohere — straightforward to add (one file each, follow the `Scraper` interface).
- **Open-source models via HuggingFace**: deferred; out of V1 scope.
- **Rate-limited / authenticated provider APIs**: some providers expose an official models list endpoint (e.g., OpenAI `/v1/models`). Could supplement scraping later.
