import type { Scraper } from "./types.js";

export const googleScraper: Scraper = {
  provider: {
    id: "google",
    name: "Google",
    homepage: "https://ai.google.dev",
    docs_url: "https://ai.google.dev/gemini-api/docs/models",
    pricing_url: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  pages: [
    { type: "pricing_page", url: "https://ai.google.dev/gemini-api/docs/pricing" },
    { type: "docs", url: "https://ai.google.dev/gemini-api/docs/models" },
  ],
  hints: `Gemini model API IDs look like "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite". The slug after "google/" is the API ID exactly (use the canonical id, not the dated variant unless that's all the page lists).
- Audio input → modality "audio" + capability "audio_input".
- Video input → modality "video" + capability "video_input".
- "Thinking" / "deep think" → "extended_thinking".
- "Function calling" → "function_calling" + "tool_use".
- "Structured output" / "JSON mode" → "structured_output" + "json_mode".
- Pricing on Google's page often distinguishes prompts ≤200K vs >200K tokens. Use the <=200K tier for input/output_per_million_usd. Note this in the model name only if Google explicitly bundles tiers as separate SKUs.
- Skip embeddings, Imagen, Veo, and Lyria; those are not chat/text-generation models.`,
};
