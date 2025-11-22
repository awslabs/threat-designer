import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
      jsxImportSource: "@emotion/react",
      babel: {
        plugins: ["@emotion/babel-plugin"],
      },
    }),
  ],
  root: ".",
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
    // Let Vite handle chunking automatically for proper dependency resolution
    rollupOptions: {},
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    extensions: [".js", ".jsx", ".json"],
  },
  optimizeDeps: {
    include: ["hoist-non-react-statics"],
  },
});
