import type { Scraper } from "./types.js";

// KNOWN LIMITATION: OpenAI's public-facing pricing/docs pages are protected by
// Cloudflare and return HTTP 403 to server-side fetches without browser-rendered
// JS. With page-level fetch tolerance, the pipeline degrades gracefully (the
// merge step preserves any prior dataset entries for openai). Workarounds:
//   - Run a Playwright-backed scraper (heavier; future enhancement).
//   - Maintain openai entries by manual PR until then.

export const openaiScraper: Scraper = {
  provider: {
    id: "openai",
    name: "OpenAI",
    homepage: "https://openai.com",
    docs_url: "https://platform.openai.com/docs",
    pricing_url: "https://openai.com/api/pricing/",
  },
  pages: [
    { type: "pricing_page", url: "https://openai.com/api/pricing/" },
    { type: "docs", url: "https://platform.openai.com/docs/models" },
  ],
  hints: `OpenAI model API IDs look like "gpt-5", "gpt-5-mini", "o4", "o4-mini", "gpt-4.1". The slug after "openai/" is the API ID exactly.
- "Function calling" / "tools" → "function_calling" + "tool_use".
- "Structured outputs" / "JSON schema" → "structured_output" + "json_mode".
- "Vision" / "image input" → modality "image" in input + capability "vision".
- "Reasoning" or models in the "o-series" → "extended_thinking".
- "Cached input" pricing maps to cache_read_per_million_usd. OpenAI does not have a separate cache_write price; if absent, leave cache_write null.
- Skip embeddings, moderation, TTS, transcription, image-generation models for the V1 list.
- "gpt-5-latest" / "chatgpt-4o-latest" pointers go in aliases.`,
};
