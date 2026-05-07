import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "mcp/server": "src/mcp/server.ts",
    "pipeline/run": "src/pipeline/run.ts",
  },
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  dts: false,
});
