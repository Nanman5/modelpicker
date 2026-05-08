import type { BenchmarkScraper } from "./types.js";

export const aiderScraper: BenchmarkScraper = {
  source: {
    id: "aider",
    name: "Aider Polyglot Leaderboard",
    url: "https://aider.chat/docs/leaderboards/",
  },
  urls: ["https://aider.chat/docs/leaderboards/"],
  hints: `Aider's polyglot benchmark measures coding ability across multiple languages. The headline number is "Pass rate 2" (final pass rate after Aider's standard two-attempt loop), shown on each row as a percent (e.g. "88.0%").
- Benchmark name: emit "aider-polyglot" (unit "%").
- model_label is the model's marketing/api name as printed on the leaderboard. Strip the trailing effort tag like "(high)", "(medium)", "(32k think)" — those go to effort variants; emit ONE record per model with the HIGHEST pass rate seen.
- provider_hint: infer from model_label ("gpt-*" → OpenAI, "claude-*" → Anthropic, "gemini-*" → Google, "grok-*" → xAI, "deepseek-*" → DeepSeek, etc.).
- Skip the legacy / older models that Aider explicitly groups under "older results" if they aren't of interest. Newer is better — focus on the top of the leaderboard.
- Aider exposes a separate "Code editing" leaderboard. If both are on the page, prefer the polyglot rows — they're the headline number.
- Aider also reports per-model COST in USD. Don't emit that as a benchmark — pricing is captured elsewhere.`,
};
