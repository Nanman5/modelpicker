import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Dataset, type Dataset as DatasetT } from "../schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Locate `data/models.json`. We try several places to handle:
 *  1. Running compiled `dist/mcp/server.js` — data is at `<pkg>/data/models.json`
 *  2. Running source via tsx (`src/mcp/server.ts`) — data is at `<repo>/data/models.json`
 *  3. Custom override via env var (handy for tests / local datasets)
 */
export function resolveDatasetPath(): string {
  if (process.env.MODELPICKER_DATA) {
    return resolve(process.env.MODELPICKER_DATA);
  }
  const candidates = [
    resolve(__dirname, "..", "..", "data", "models.json"),     // dist/mcp → ../../data
    resolve(__dirname, "..", "..", "..", "data", "models.json"), // src/mcp → ../../../data
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export async function loadDataset(path = resolveDatasetPath()): Promise<DatasetT> {
  if (!existsSync(path)) {
    throw new Error(
      `dataset not found at ${path}\n` +
        `Run \`npm run scrape\` to generate it, or set MODELPICKER_DATA to point at an existing models.json.`,
    );
  }
  const raw = await readFile(path, "utf8");
  const parsed = Dataset.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`dataset at ${path} failed schema validation:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
