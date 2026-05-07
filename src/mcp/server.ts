import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadDataset } from "./data-loader.js";
import {
  compareRaw,
  compareRawInputShape,
  getModel,
  getModelInputShape,
  getProvider,
  getProviderInputShape,
  listBenchmarks,
  listBenchmarksInputShape,
  listModels,
  listModelsInputShape,
  listProviders,
  listProvidersInputShape,
  type ToolContext,
} from "./tools.js";

async function main() {
  const dataset = await loadDataset();
  const ctx: ToolContext = { dataset };

  const server = new McpServer({
    name: "modelpicker",
    version: "0.1.0",
  });

  server.registerTool(
    "list_models",
    {
      title: "List models",
      description:
        "List LLMs from the modelpicker dataset, optionally filtered by provider, capability, modality, max input price, or min context window. Returns raw normalized facts only — no recommendations.",
      inputSchema: listModelsInputShape,
    },
    async (args) => listModels(ctx, args),
  );

  server.registerTool(
    "get_model",
    {
      title: "Get a single model",
      description:
        "Fetch the full record for one model by id (e.g. 'anthropic/claude-opus-4-5') or alias.",
      inputSchema: getModelInputShape,
    },
    async (args) => getModel(ctx, args),
  );

  server.registerTool(
    "list_providers",
    {
      title: "List providers",
      description:
        "List all providers covered by the dataset, with the count of models per provider.",
      inputSchema: listProvidersInputShape,
    },
    async () => listProviders(ctx),
  );

  server.registerTool(
    "get_provider",
    {
      title: "Get provider details",
      description: "Fetch a provider with all of its models embedded.",
      inputSchema: getProviderInputShape,
    },
    async (args) => getProvider(ctx, args),
  );

  server.registerTool(
    "list_benchmarks",
    {
      title: "List benchmark scores",
      description:
        "List benchmark scores from the dataset. Optionally restrict to one model, one benchmark name, or one source. Returns raw scores with sources — no rankings, no aggregates.",
      inputSchema: listBenchmarksInputShape,
    },
    async (args) => listBenchmarks(ctx, args),
  );

  server.registerTool(
    "compare_raw",
    {
      title: "Compare models side-by-side",
      description:
        "Compare two or more models field-by-field. Returns a raw matrix — no winner, no recommendation.",
      inputSchema: compareRawInputShape,
    },
    async (args) => compareRaw(ctx, args),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr is safe for logs over stdio transport (stdout is the wire).
  console.error(
    `modelpicker-mcp ready · dataset generated_at=${dataset.generated_at} · ${dataset.models.length} models from ${dataset.providers.length} providers`,
  );
}

main().catch((err) => {
  console.error("modelpicker-mcp failed to start:");
  console.error(err);
  process.exit(1);
});
