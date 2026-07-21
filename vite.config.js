import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const e2eMock = process.env.VITE_E2E_MOCK === "true";

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
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      ...(e2eMock
        ? [
            {
              find: /^aws-amplify\/auth(\/.*)?$/,
              replacement: path.resolve(__dirname, "./src/e2e/amplifyAuthMock.js"),
            },
            {
              find: /^@aws-amplify\/auth(\/.*)?$/,
              replacement: path.resolve(__dirname, "./src/e2e/amplifyAuthMock.js"),
            },
          ]
        : []),
    ],
    extensions: [".js", ".jsx", ".json"],
  },
  optimizeDeps: {
    include: ["hoist-non-react-statics"],
  },
});
