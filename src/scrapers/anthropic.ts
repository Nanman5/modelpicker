import type { Scraper } from "./types.js";

export const anthropicScraper: Scraper = {
  provider: {
    id: "anthropic",
    name: "Anthropic",
    homepage: "https://www.anthropic.com",
    docs_url: "https://docs.anthropic.com",
    pricing_url: "https://www.anthropic.com/pricing",
  },
  pages: [
    { type: "pricing_page", url: "https://www.anthropic.com/pricing" },
    {
      type: "docs",
      url: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    },
  ],
  hints: `Claude model API IDs look like "claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5". The slug after "anthropic/" is the API ID exactly.
- "Prompt caching" maps to capability "prompt_caching".
- "Extended thinking" / "thinking" maps to capability "extended_thinking".
- "Tool use" / "tools" maps to "tool_use" and also "function_calling".
- "Vision" / "image input" → modality "image" in input + capability "vision".
- The pricing page lists "input", "output", "prompt caching write" (cache_write), "prompt caching read" (cache_read).
- Aliases like "claude-opus-latest" should go in the aliases array, not as separate models.`,
};
