import { describe, it, expect } from "vitest";
import { z } from "zod";

import { runScraper } from "../../src/scrapers/run.js";
import type { Scraper } from "../../src/scrapers/types.js";
import type { LLMClient } from "../../src/scrapers/extract.js";

const NOW = "2026-05-07T12:00:00.000Z";

const fakeProvider = {
  id: "fakeprov",
  name: "Fakeprov",
  homepage: "https://fakeprov.example",
  docs_url: "https://fakeprov.example/docs",
  pricing_url: "https://fakeprov.example/pricing",
};

const fakeScraper: Scraper = {
  provider: fakeProvider,
  pages: [
    { type: "pricing_page", url: "https://fakeprov.example/pricing" },
  ],
};

function makeLLM(payload: unknown): LLMClient {
  return {
    async extract<T>({ schema }: { schema: z.ZodType<T> }) {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new Error(`test payload failed: ${parsed.error.toString()}`);
      return parsed.data;
    },
  };
}

describe("runScraper", () => {
  it("attaches sources and last_updated, then validates with the strict schema", async () => {
    const llm = makeLLM({
      models: [
        {
          id: "fakeprov/superllm-1",
          provider: "fakeprov",
          name: "SuperLLM 1",
          aliases: ["superllm-latest"],
          context_window: 200000,
          max_output_tokens: 8000,
          pricing: {
            input_per_million_usd: 5,
            output_per_million_usd: 15,
            cache_read_per_million_usd: 0.5,
            cache_write_per_million_usd: null,
          },
          modalities: { input: ["text"], output: ["text"] },
          capabilities: ["tool_use", "function_calling"],
          knowledge_cutoff: "2026-01",
          released_at: "2026-04-15",
          deprecated: false,
          deprecation_date: null,
        },
      ],
    });

    const snap = await runScraper(fakeScraper, {
      llm,
      htmlByUrl: { "https://fakeprov.example/pricing": "<html><body><h1>Pricing</h1></body></html>" },
      now: NOW,
    });

    expect(snap.provider.id).toBe("fakeprov");
    expect(snap.models).toHaveLength(1);
    const m = snap.models[0]!;
    expect(m.id).toBe("fakeprov/superllm-1");
    expect(m.last_updated).toBe("2026-05-07");
    expect(m.sources).toEqual([
      {
        type: "pricing_page",
        url: "https://fakeprov.example/pricing",
        scraped_at: NOW,
      },
    ]);
  });

  it("drops models that fail strict validation but keeps the rest", async () => {
    const llm = makeLLM({
      models: [
        {
          id: "fakeprov/good",
          provider: "fakeprov",
          name: "Good",
          aliases: [],
          context_window: 100000,
          max_output_tokens: 4000,
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
        },
        {
          id: "fakeprov/bad",
          provider: "fakeprov",
          name: "Bad",
          aliases: [],
          context_window: 100000,
          max_output_tokens: 4000,
          pricing: {
            input_per_million_usd: 1,
            output_per_million_usd: 2,
            cache_read_per_million_usd: null,
            cache_write_per_million_usd: null,
          },
          modalities: { input: ["text"], output: ["text"] },
          capabilities: ["telepathy"], // invalid capability — should be dropped
          knowledge_cutoff: null,
          released_at: null,
          deprecated: false,
          deprecation_date: null,
        },
      ],
    });

    const snap = await runScraper(fakeScraper, {
      llm,
      htmlByUrl: { "https://fakeprov.example/pricing": "<html></html>" },
      now: NOW,
    });

    expect(snap.models.map((m) => m.id)).toEqual(["fakeprov/good"]);
  });
});
