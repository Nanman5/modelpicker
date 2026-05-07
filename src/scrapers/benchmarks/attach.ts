import type { ModelFact } from "../../schema.js";
import type { BenchmarkRecord } from "./types.js";

/**
 * Resolve benchmark records to ModelFacts and merge them into the model list.
 *
 * Matching strategy (in order, first match wins):
 *   1. Exact ModelFact.id == "<provider>/<model_api_id>" if both are known
 *   2. Exact ModelFact.id == "<provider_hint>/<slug-from-label>"
 *   3. ModelFact.id endswith "/<model_api_id>" (provider not specified by source)
 *   4. ModelFact.aliases includes either the api id or the label slug
 *   5. ModelFact.name matches model_label (case-insensitive, ignoring punctuation)
 *
 * If a record matches no model, it is dropped with a warning. We never
 * silently attach a benchmark to the wrong model.
 */
export function attachBenchmarks(
  models: ModelFact[],
  records: BenchmarkRecord[],
  log: (msg: string) => void = console.warn,
): { models: ModelFact[]; attached: number; dropped: number } {
  const byId = new Map<string, ModelFact>(models.map((m) => [m.id, m]));
  const byAlias = new Map<string, ModelFact>();
  for (const m of models) {
    for (const alias of m.aliases) byAlias.set(normalize(alias), m);
    byAlias.set(normalize(m.id.split("/")[1] ?? m.id), m);
    byAlias.set(normalize(m.name), m);
  }

  const attachments = new Map<string, ModelFact["benchmarks"]>();
  let attached = 0;
  let dropped = 0;

  for (const rec of records) {
    const target = resolve(rec, models, byId, byAlias);
    if (!target) {
      log(
        `[benchmarks] no model match for "${rec.model_label}" (${rec.model_api_id ?? "no api id"}, hint=${rec.provider_hint ?? "none"}, benchmark=${rec.benchmark.name})`,
      );
      dropped++;
      continue;
    }
    const list = attachments.get(target.id) ?? [...target.benchmarks];
    // dedupe by (name + source_name); newer score wins
    const idx = list.findIndex(
      (b) => b.name === rec.benchmark.name && b.source_name === rec.benchmark.source_name,
    );
    if (idx >= 0) list[idx] = rec.benchmark;
    else list.push(rec.benchmark);
    attachments.set(target.id, list);
    attached++;
  }

  const next = models.map((m) => {
    const merged = attachments.get(m.id);
    return merged ? { ...m, benchmarks: merged } : m;
  });

  return { models: next, attached, dropped };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_./()]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripParentheticals(s: string): string {
  // "Claude Opus 4.7 (Adaptive Reasoning, Max Effort)" → "Claude Opus 4.7"
  return s.replace(/\([^)]*\)/g, " ").trim();
}

function resolve(
  rec: BenchmarkRecord,
  all: ModelFact[],
  byId: Map<string, ModelFact>,
  byAlias: Map<string, ModelFact>,
): ModelFact | undefined {
  const provider = rec.provider_hint ? slugifyProvider(rec.provider_hint) : null;
  const apiId = rec.model_api_id?.trim();
  const cleanLabel = stripParentheticals(rec.model_label);
  const labelSlug = normalize(cleanLabel);

  if (provider && apiId) {
    const id = `${provider}/${apiId}`;
    const hit = byId.get(id);
    if (hit) return hit;
  }
  if (provider) {
    const id = `${provider}/${labelSlug}`;
    const hit = byId.get(id);
    if (hit) return hit;
  }
  if (apiId) {
    const hit = all.find((m) => m.id.endsWith(`/${apiId}`));
    if (hit) return hit;
  }

  const aliasHit = byAlias.get(normalize(apiId ?? "")) ?? byAlias.get(labelSlug);
  if (aliasHit) {
    if (!provider || aliasHit.provider === provider) return aliasHit;
  }

  // Fuzzy: model.id ends with the labelSlug (handles "claude opus 4.7" → "anthropic/claude-opus-4-7")
  const candidates = all.filter((m) => {
    if (provider && m.provider !== provider) return false;
    const slug = m.id.split("/")[1] ?? m.id;
    return slug === labelSlug || normalize(m.name) === labelSlug;
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1 && provider) {
    return candidates.find((c) => c.provider === provider);
  }

  return undefined;
}

function slugifyProvider(hint: string): string {
  const h = hint.toLowerCase().trim();
  if (h.includes("anthropic")) return "anthropic";
  if (h.includes("openai") || h.includes("open ai")) return "openai";
  if (h.includes("google") || h.includes("gemini") || h.includes("deepmind")) return "google";
  if (h.includes("xai") || h.includes("x ai") || h.includes("grok")) return "xai";
  return normalize(hint);
}
