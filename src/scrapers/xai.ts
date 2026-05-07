import type { Scraper } from "./types.js";

export const xaiScraper: Scraper = {
  provider: {
    id: "xai",
    name: "xAI",
    homepage: "https://x.ai",
    docs_url: "https://docs.x.ai",
    pricing_url: "https://docs.x.ai/docs/models",
  },
  pages: [
    { type: "docs", url: "https://docs.x.ai/developers/models" },
  ],
  hints: `Grok model API IDs look like "grok-4", "grok-4-fast", "grok-code-fast-1". The slug after "xai/" is the API ID exactly.
- "Vision" → modality "image" in input + capability "vision".
- "Reasoning" / "thinking" → "extended_thinking".
- "Function calling" / "tools" → "function_calling" + "tool_use".
- xAI publishes "Cached input" pricing → cache_read_per_million_usd.
- The two URLs we pass may resolve to the same page; deduplicate models by id.`,
};
