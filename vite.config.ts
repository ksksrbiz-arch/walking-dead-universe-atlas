import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { buildShareIndex } from "./src/lib/shareIndex";

// Link previews: api/share.ts and api/og.ts read this precomputed file from
// the deployment instead of importing the atlas data (see src/lib/shareIndex.ts).
function shareIndex(): Plugin {
  return {
    name: "twdu-share-index",
    apply: "build",
    generateBundle() {
      const land = JSON.parse(readFileSync(new URL("./node_modules/@cublya/world-atlas/land-110m.json", import.meta.url), "utf8"));
      this.emitFile({ type: "asset", fileName: "share-index.json", source: JSON.stringify({ ...buildShareIndex(), land }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), shareIndex()],
});
