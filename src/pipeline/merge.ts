import type { Dataset, Provider, ProviderSnapshot } from "../schema.js";

export interface MergeResult {
  dataset: Dataset;
  warnings: string[];
}

/**
 * Merge new provider snapshots into a dataset.
 *
 * Behavior:
 * - For each provider in `snapshots`, replace its models in the dataset.
 * - For providers in the previous dataset but missing from `snapshots` (e.g. scraper failed),
 *   keep their existing data and emit a warning.
 * - If a provider in `snapshots` has zero models, treat it as failure: keep prior data, warn.
 * - The provider list in the new dataset is the union of (prior providers + snapshot providers).
 */
export function mergeSnapshots(
  previous: Dataset | null,
  snapshots: ProviderSnapshot[],
  generatedAt: string,
): MergeResult {
  const warnings: string[] = [];

  const priorByProvider: Map<string, { provider: Provider; models: Dataset["models"] }> = new Map();
  if (previous) {
    for (const provider of previous.providers) {
      const models = previous.models.filter((m) => m.provider === provider.id);
      priorByProvider.set(provider.id, { provider, models });
    }
  }

  const finalByProvider = new Map(priorByProvider);

  for (const snap of snapshots) {
    if (snap.models.length === 0 && priorByProvider.has(snap.provider.id)) {
      warnings.push(
        `[${snap.provider.id}] scraper returned 0 models — keeping prior data from previous run`,
      );
      finalByProvider.set(snap.provider.id, priorByProvider.get(snap.provider.id)!);
      continue;
    }
    finalByProvider.set(snap.provider.id, {
      provider: snap.provider,
      models: snap.models,
    });
  }

  const incomingIds = new Set(snapshots.map((s) => s.provider.id));
  for (const id of priorByProvider.keys()) {
    if (!incomingIds.has(id)) {
      warnings.push(`[${id}] no fresh snapshot this run — kept prior data`);
    }
  }

  const providers: Provider[] = [];
  const models: Dataset["models"] = [];
  for (const { provider, models: ms } of finalByProvider.values()) {
    providers.push(provider);
    models.push(...ms);
  }

  providers.sort((a, b) => a.id.localeCompare(b.id));
  models.sort((a, b) => a.id.localeCompare(b.id));

  return {
    dataset: {
      $schema: "https://modelpicker.dev/schema/v1.json",
      version: 1,
      generated_at: generatedAt,
      providers,
      models,
    },
    warnings,
  };
}
