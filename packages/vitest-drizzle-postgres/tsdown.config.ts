import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  onSuccess: "cp src/types.d.ts dist/types.d.ts",
  dts: true,
  clean: true,
  external: [
    // Peer dependencies - don't bundle these
    "drizzle-orm",
    "pg",
    "vitest",
    // Node.js built-ins
    "node:crypto",
    "node:fs",
    "node:path",
    "crypto",
    "fs",
    "path",
  ],
  target: "node18",
  outDir: "dist",
});
