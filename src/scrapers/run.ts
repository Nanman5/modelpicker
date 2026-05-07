import { z } from "zod";

import {
  CAPABILITIES,
  MODALITIES,
  ModelFact,
  type ProviderSnapshot,
} from "../schema.js";
import { fetchHtml, htmlToStructuredText } from "./fetch.js";
import type { Scraper, RunScraper, ScraperPage } from "./types.js";

/**
 * Permissive top-level schema: we want one bad row to not nuke the whole batch.
 * Each row is later validated strictly by ModelFact.safeParse and dropped on failure.
 */
const ExtractionResult = z.object({
  models: z.array(z.record(z.string(), z.unknown())),
});

const SYSTEM_PROMPT = `You are a precise information extractor. You read provider documentation and pricing pages for AI / LLM models, and you output structured JSON describing each distinct model.

RULES — read carefully:
1. Output ONLY models that the provider currently lists as generally available, in preview, in beta, or as deprecated/legacy. Do NOT fabricate models. Do NOT invent fields.
2. If a fact is not explicitly stated on the page, set it to null. Never guess pricing, context windows, or capabilities.
3. Return numbers, not formatted strings. Prices are USD per million tokens. "$3 per 1M input tokens" → 3.0. "300K context" → 300000.
4. \`id\` MUST be \`<provider_id>/<slug>\` where slug is lowercase, dash- or dot-separated, taken from the model's API identifier (the string a user would pass as the "model" parameter when calling the API).
5. \`aliases\` includes the marketing name and any "-latest" pointers if the page documents them.
6. \`deprecated\` is true if the page explicitly marks the model as deprecated, legacy, or scheduled for retirement.
7. Capability vocabulary (use ONLY these): ${CAPABILITIES.join(", ")}.
8. Modality vocabulary (use ONLY these): ${MODALITIES.join(", ")}.
9. \`knowledge_cutoff\` format is YYYY-MM. \`released_at\` and \`deprecation_date\` are YYYY-MM-DD.
10. If the page lists the same model multiple times (different aliases or regions), output ONE entry and put the alternates in \`aliases\`.
11. Skip embedding-only / moderation / TTS / image-only models UNLESS the user explicitly indicates the provider catalog includes them.
12. DO NOT include benchmarks. Benchmarks are sourced from independent leaderboards by a separate pipeline stage.

The schema your output MUST match (TypeScript-style):
{
  models: Array<{
    id: string,                               // "<provider>/<slug>"
    provider: string,                         // matches provider_id supplied
    name: string,                             // marketing name
    aliases: string[],                        // [] if none
    context_window: number | null,
    max_output_tokens: number | null,
    pricing: {
      input_per_million_usd: number | null,
      output_per_million_usd: number | null,
      cache_read_per_million_usd: number | null,
      cache_write_per_million_usd: number | null
    },
    modalities: { input: string[], output: string[] },
    capabilities: string[],
    knowledge_cutoff: string | null,          // YYYY-MM
    released_at: string | null,               // YYYY-MM-DD
    deprecated: boolean,
    deprecation_date: string | null           // YYYY-MM-DD
  }>
}`;

export const runScraper: RunScraper = async (scraper: Scraper, options): Promise<ProviderSnapshot> => {
  const { llm, htmlByUrl = {}, now = new Date().toISOString() } = options;
  const today = now.slice(0, 10);

  const pageContents: { page: ScraperPage; text: string }[] = [];
  for (const page of scraper.pages) {
    const html = htmlByUrl[page.url] ?? (await fetchHtml(page.url));
    const text = htmlToStructuredText(html);
    pageContents.push({ page, text });
  }

  const userPrompt = buildUserPrompt(scraper, pageContents);

  const extracted = await llm.extract({
    system: SYSTEM_PROMPT + (scraper.hints ? `\n\nProvider-specific hints:\n${scraper.hints}` : ""),
    user: userPrompt,
    schema: ExtractionResult,
    schemaName: "result",
  });

  const sources = scraper.pages.map((page) => ({
    type: page.type,
    url: page.url,
    scraped_at: now,
  }));

  const models = extracted.models.flatMap((m) => {
    const candidate = {
      ...m,
      provider: scraper.provider.id,
      sources,
      last_updated: today,
    };
    const result = ModelFact.safeParse(candidate);
    if (!result.success) {
      console.warn(
        `[${scraper.provider.id}] dropped model "${m.id}" — schema validation failed: ${result.error.toString()}`,
      );
      return [];
    }
    return [result.data];
  });

  return {
    provider: scraper.provider,
    models,
    scraped_at: now,
  };
};

function buildUserPrompt(
  scraper: Scraper,
  pages: { page: ScraperPage; text: string }[],
): string {
  const header = `Provider: ${scraper.provider.name} (id: "${scraper.provider.id}")\n`;
  const sections = pages
    .map(({ page, text }) => `--- ${page.type.toUpperCase()} (${page.url}) ---\n${text}`)
    .join("\n\n");
  const tail = `\n\nExtract every model documented above. Remember: facts only, null for anything not on the page.`;
  return header + sections + tail;
}
