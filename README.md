# modelpicker

> Fresh, normalized facts about LLMs — for the AI agents that have to pick one.

`modelpicker` is an [MCP](https://modelcontextprotocol.io) server that gives Claude, Codex, Cursor, Cline, and any other MCP-aware agent a clean source of truth about the current LLM landscape: which models exist, what they cost, what they can do, and how they score on independent benchmarks.

It is deliberately **opinion-free**. There is no `recommend_model` tool, no "winner" in `compare_raw`, no aggregated ranking. The agent gets raw, sourced facts and decides for itself.

## Why

When you ask an agent to pick a model:
- Its training data is months out of date.
- It has provider bias (Claude likes Claude, GPT likes GPT).
- It hallucinates prices, context windows, and capabilities.
- Or it just defaults to whatever was popular a year ago.

`modelpicker` removes the guessing. Every fact carries the URL it came from and the date it was scraped.

## Installation

Add it to your MCP-compatible client. The dataset is bundled with the package, so it works offline.

### For AI agents: self-install prompt

Paste this into any agent that can edit files and run shell commands (Claude Code, Cursor, Codex, etc.):

> Install the MCP server at `https://github.com/Nanman5/modelpicker`. Add an entry under `mcpServers.modelpicker` in my MCP config (Claude Code: `claude mcp add modelpicker -- npx -y github:Nanman5/modelpicker`; Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`; Cursor: `.cursor/mcp.json` or `~/.cursor/mcp.json`; Codex: `~/.codex/mcp_servers.json`). Use `command: "npx"` and `args: ["-y", "github:Nanman5/modelpicker"]`. After installing, restart the client and call the `list_providers` tool to verify it connected.

### Manual install — Claude Code

```bash
claude mcp add modelpicker -- npx -y github:Nanman5/modelpicker
```

### Manual install — config file (Claude Desktop / Cursor / Cline / generic `.mcp.json`)

```jsonc
{
  "mcpServers": {
    "modelpicker": {
      "command": "npx",
      "args": ["-y", "github:Nanman5/modelpicker"]
    }
  }
}
```

The first launch clones the repo and builds via the `prepare` script (~10 seconds). Subsequent launches are instant.

### Smoke test (no MCP client needed)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | npx -y github:Nanman5/modelpicker
```

Should print one JSON-RPC response per request. If you see the six tools listed in the second response, you're good.

When `modelpicker-mcp` is published to npm, replace `github:Nanman5/modelpicker` with `modelpicker-mcp`.

## What the agent gets

Six tools. Each response includes `dataset_generated_at` so the agent can reason about freshness.

| Tool | Purpose |
|---|---|
| `list_models` | List models, optionally filtered by provider, capability, modality, max input price, or min context window. Excludes deprecated by default. |
| `get_model` | Full record for one model id (or alias). |
| `list_providers` | All providers in the dataset with model counts. |
| `get_provider` | One provider with all of its models embedded. |
| `list_benchmarks` | Raw benchmark scores, optionally filtered by model, benchmark name, or source. No rankings, no aggregates. |
| `compare_raw` | Side-by-side matrix of two or more models. No "winner". |

Example `get_model` output:

```json
{
  "dataset_generated_at": "2026-05-07T06:17:00.000Z",
  "model": {
    "id": "anthropic/claude-opus-4-5",
    "provider": "anthropic",
    "name": "Claude Opus 4.5",
    "aliases": ["claude-opus-latest"],
    "context_window": 1000000,
    "max_output_tokens": 64000,
    "pricing": {
      "input_per_million_usd": 15,
      "output_per_million_usd": 75,
      "cache_read_per_million_usd": 1.5,
      "cache_write_per_million_usd": 18.75
    },
    "modalities": { "input": ["text", "image"], "output": ["text"] },
    "capabilities": ["tool_use", "vision", "extended_thinking", "prompt_caching"],
    "knowledge_cutoff": "2026-01",
    "released_at": "2025-10-15",
    "deprecated": false,
    "deprecation_date": null,
    "benchmarks": [
      {
        "name": "mmlu-pro",
        "score": 84.2,
        "unit": "%",
        "source": "https://artificialanalysis.ai/models",
        "source_name": "Artificial Analysis",
        "as_of": "2026-05-07"
      }
    ],
    "last_updated": "2026-05-07",
    "sources": [
      {
        "type": "pricing_page",
        "url": "https://www.anthropic.com/pricing",
        "scraped_at": "2026-05-07T06:17:00.000Z"
      }
    ]
  }
}
```

## V1 coverage

Providers: Anthropic, OpenAI, Google, xAI.
Benchmark sources: Artificial Analysis.

More providers (Mistral, DeepSeek, Meta, Cohere) and more benchmark sources (LMArena, Vellum) are straightforward to add — see `Contributing` below.

## How the dataset stays fresh

- A GitHub Action runs daily (and on-demand) and executes the scraper pipeline.
- Each provider has a per-file scraper in `src/scrapers/`. Scrapers fetch HTML, clean it, then use an LLM (NVIDIA Build API by default) to extract structured records — robust against page-layout changes.
- A separate stage runs benchmark scrapers (`src/scrapers/benchmarks/`) and attaches scores to models by id / alias / name, never silently misattributing.
- The pipeline writes `data/models.json` and commits it. The full history lives in `git log -p data/models.json`.
- The published npm package bundles the latest committed dataset, so MCP clients work offline.

## Local development

```bash
git clone <this repo>
cd modelpicker
npm install
cp .env.example .env  # add your NVIDIA API key (free at https://build.nvidia.com)

npm run typecheck
npm test

# Run the scraper pipeline locally:
npm run scrape -- --dry-run                  # see what would be written
npm run scrape -- --only anthropic           # one provider
npm run scrape -- --skip-benchmarks          # provider data only
npm run scrape -- --benchmarks-only          # refresh benchmark scores only

# Run the MCP server in dev:
npm run dev

# Build for publish:
npm run build
```

### Environment variables

| Variable | Required | Default |
|---|---|---|
| `NVIDIA_API_KEY` | yes (pipeline only) | — |
| `NVIDIA_EXTRACTION_MODEL` | no | `meta/llama-3.3-70b-instruct` |
| `NVIDIA_BASE_URL` | no | `https://integrate.api.nvidia.com/v1` |
| `MODELPICKER_DATA` | no | bundled `data/models.json` |

The MCP server itself never calls the LLM — only the pipeline does. End users do not need an API key.

## Contributing a new provider

1. Add a file `src/scrapers/<id>.ts` that exports a `Scraper` constant: provider metadata, the URLs to fetch, and any extraction hints.
2. Register it in `src/scrapers/index.ts`.
3. Add a fixture-based test in `tests/scrapers/` (mock the LLM and assert the run loop attaches sources correctly).

Same idea for benchmark sources under `src/scrapers/benchmarks/`.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Scraper pipe    │────▶│  data/models.    │────▶│   MCP server     │
│  (GH Action)     │     │  json (committed)│     │   (npm package)  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
   daily / manual           single source              consumed by
                            of truth, in git           Claude/Codex/etc
```

Full design rationale: [`docs/superpowers/specs/2026-05-07-modelpicker-design.md`](docs/superpowers/specs/2026-05-07-modelpicker-design.md).

## License

MIT
