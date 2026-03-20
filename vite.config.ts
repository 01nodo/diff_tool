import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Build 1: React viewer app → media/viewer.js (loaded inside the WebviewPanel)
// Build 2: Extension host → dist/extension.js (compiled separately via tsc)

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "media",
    emptyOutDir: false,
    lib: {
      // Entry: main.tsx mounts the React app and wires the VS Code message bridge
      entry: path.resolve(__dirname, "src/main.tsx"),
      name: "LadderViewer",
      formats: ["iife"],          // single self-executing bundle, no ES module import needed
      fileName: () => "viewer.js",
    },
    rollupOptions: {
      // React bundled inline — webview has no npm access
      external: [],
    },
  },
});
