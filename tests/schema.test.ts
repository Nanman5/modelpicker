import { describe, it, expect } from "vitest";

import { ModelFact, Dataset } from "../src/schema.js";

const validModel = {
  id: "anthropic/claude-opus-4-5",
  provider: "anthropic",
  name: "Claude Opus 4.5",
  aliases: [],
  context_window: 200000,
  max_output_tokens: 64000,
  pricing: {
    input_per_million_usd: 15,
    output_per_million_usd: 75,
    cache_read_per_million_usd: 1.5,
    cache_write_per_million_usd: 18.75,
  },
  modalities: { input: ["text", "image"], output: ["text"] },
  capabilities: ["tool_use", "vision", "prompt_caching"],
  knowledge_cutoff: "2025-04",
  released_at: "2025-10-01",
  deprecated: false,
  deprecation_date: null,
  last_updated: "2026-05-07",
  sources: [
    {
      type: "pricing_page",
      url: "https://www.anthropic.com/pricing",
      scraped_at: "2026-05-07T12:00:00.000Z",
    },
  ],
};

describe("ModelFact schema", () => {
  it("accepts a well-formed model", () => {
    const r = ModelFact.safeParse(validModel);
    expect(r.success).toBe(true);
  });

  it("rejects an id without provider/slug shape", () => {
    const r = ModelFact.safeParse({ ...validModel, id: "claude-opus-4-5" });
    expect(r.success).toBe(false);
  });

  it("rejects an id with uppercase letters", () => {
    const r = ModelFact.safeParse({ ...validModel, id: "Anthropic/Claude" });
    expect(r.success).toBe(false);
  });

  it("rejects a model without sources", () => {
    const r = ModelFact.safeParse({ ...validModel, sources: [] });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown capability", () => {
    const r = ModelFact.safeParse({
      ...validModel,
      capabilities: ["telepathy"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed knowledge_cutoff", () => {
    const r = ModelFact.safeParse({ ...validModel, knowledge_cutoff: "April 2025" });
    expect(r.success).toBe(false);
  });

  it("accepts null prices", () => {
    const r = ModelFact.safeParse({
      ...validModel,
      pricing: {
        input_per_million_usd: null,
        output_per_million_usd: null,
        cache_read_per_million_usd: null,
        cache_write_per_million_usd: null,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("Dataset schema", () => {
  it("accepts a dataset with the model above", () => {
    const r = Dataset.safeParse({
      $schema: "https://modelpicker.dev/schema/v1.json",
      version: 1,
      generated_at: "2026-05-07T12:00:00.000Z",
      providers: [
        {
          id: "anthropic",
          name: "Anthropic",
          homepage: "https://www.anthropic.com",
          docs_url: "https://docs.anthropic.com",
          pricing_url: "https://www.anthropic.com/pricing",
        },
      ],
      models: [validModel],
    });
    expect(r.success).toBe(true);
  });
});
