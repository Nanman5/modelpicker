import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional; createLLMClient() will throw a friendly error if the key is missing.
}

import { Dataset, type ProviderSnapshot } from "../schema.js";
import { runScraper, scrapers, createLLMClient } from "../scrapers/index.js";
import {
  runBenchmarkScraper,
  benchmarkScrapers,
  attachBenchmarks,
  type BenchmarkRecord,
} from "../scrapers/benchmarks/index.js";
import { mergeSnapshots } from "./merge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const DATA_PATH = resolve(REPO_ROOT, "data", "models.json");

interface CliFlags {
  dryRun: boolean;
  only: string[] | null;
  skipBenchmarks: boolean;
  benchmarksOnly: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    dryRun: false,
    only: null,
    skipBenchmarks: false,
    benchmarksOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "-n") flags.dryRun = true;
    else if (arg === "--skip-benchmarks") flags.skipBenchmarks = true;
    else if (arg === "--benchmarks-only") flags.benchmarksOnly = true;
    else if (arg === "--only" && argv[i + 1]) {
      flags.only = argv[i + 1]!.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    }
  }
  return flags;
}

async function loadPrevious(): Promise<Dataset | null> {
  if (!existsSync(DATA_PATH)) return null;
  try {
    const raw = await readFile(DATA_PATH, "utf8");
    const parsed = Dataset.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`previous dataset invalid; ignoring: ${parsed.error.toString().slice(0, 300)}`);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn(`failed to load previous dataset: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const now = new Date().toISOString();

  const llm = createLLMClient();

  const targets = flags.only
    ? scrapers.filter((s) => flags.only!.includes(s.provider.id))
    : scrapers;
  if (flags.only && targets.length === 0) {
    console.error(`--only matched no providers (got: ${flags.only.join(",")}). Available: ${scrapers.map((s) => s.provider.id).join(",")}`);
    process.exit(2);
  }

  const previous = await loadPrevious();

  const snapshots: ProviderSnapshot[] = [];
  if (!flags.benchmarksOnly) {
    console.log(
      `scraping ${targets.length} provider(s): ${targets.map((s) => s.provider.id).join(", ")}`,
    );
    const results = await Promise.allSettled(
      targets.map((s) => runScraper(s, { llm, now })),
    );
    for (const [i, result] of results.entries()) {
      const id = targets[i]!.provider.id;
      if (result.status === "fulfilled") {
        console.log(`[${id}] ${result.value.models.length} model(s)`);
        snapshots.push(result.value);
      } else {
        console.warn(`[${id}] scraper failed: ${(result.reason as Error).message}`);
      }
    }
  } else {
    console.log("benchmarks-only run: skipping provider scrapers");
  }

  const merged = mergeSnapshots(previous, snapshots, now);
  for (const w of merged.warnings) console.warn(w);
  let dataset = merged.dataset;

  if (!flags.skipBenchmarks && benchmarkScrapers.length > 0) {
    console.log(
      `scraping ${benchmarkScrapers.length} benchmark source(s): ${benchmarkScrapers.map((b) => b.source.id).join(", ")}`,
    );
    const benchResults = await Promise.allSettled(
      benchmarkScrapers.map((b) => runBenchmarkScraper(b, { llm, now })),
    );
    const allRecords: BenchmarkRecord[] = [];
    for (const [i, result] of benchResults.entries()) {
      const id = benchmarkScrapers[i]!.source.id;
      if (result.status === "fulfilled") {
        console.log(`[benchmarks/${id}] ${result.value.length} record(s)`);
        allRecords.push(...result.value);
      } else {
        console.warn(`[benchmarks/${id}] failed: ${(result.reason as Error).message}`);
      }
    }
    if (allRecords.length > 0) {
      const { models: nextModels, attached, dropped } = attachBenchmarks(
        dataset.models,
        allRecords,
      );
      dataset = { ...dataset, models: nextModels };
      console.log(`benchmarks: attached ${attached}, dropped ${dropped} (no model match)`);
    }
  } else if (flags.skipBenchmarks) {
    console.log("--skip-benchmarks: leaving model.benchmarks untouched");
  }

  const validated = Dataset.safeParse(dataset);
  if (!validated.success) {
    console.error("merged dataset failed schema validation:");
    console.error(validated.error.toString());
    process.exit(1);
  }

  if (flags.dryRun) {
    console.log(`dry-run: would write ${validated.data.models.length} models to ${DATA_PATH}`);
    return;
  }

  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(validated.data, null, 2) + "\n", "utf8");
  const benchmarkCount = validated.data.models.reduce(
    (acc, m) => acc + m.benchmarks.length,
    0,
  );
  console.log(
    `wrote ${validated.data.models.length} models, ${benchmarkCount} benchmark records, ${validated.data.providers.length} provider(s) → ${DATA_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
