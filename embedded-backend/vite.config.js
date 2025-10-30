import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
      exclude: ["fs", "child_process", "os"],
    }),
  ],
  resolve: {
    alias: {
      // Runtime config for AWS SDK
      "./runtimeConfig": "./runtimeConfig.browser",

      // Node.js module stubs
      child_process: path.resolve(__dirname, "./src/stubs/child_process.js"),
      fs: path.resolve(__dirname, "./src/stubs/fs.js"),
      os: path.resolve(__dirname, "./src/stubs/os.js"),
      "node:child_process": path.resolve(__dirname, "./src/stubs/child_process.js"),
      "node:fs": path.resolve(__dirname, "./src/stubs/fs.js"),
      "node:os": path.resolve(__dirname, "./src/stubs/os.js"),

      // AWS credential provider stubs (critical for browser)
      "@aws-sdk/credential-provider-node": path.resolve(__dirname, "./src/stubs/empty.js"),
      "@aws-sdk/credential-provider-process": path.resolve(__dirname, "./src/stubs/empty.js"),
      "@aws-sdk/credential-provider-ini": path.resolve(__dirname, "./src/stubs/empty.js"),
      "@aws-sdk/credential-provider-env": path.resolve(__dirname, "./src/stubs/empty.js"),
      "@aws-sdk/credential-provider-sso": path.resolve(__dirname, "./src/stubs/empty.js"),
      "@aws-sdk/token-providers": path.resolve(__dirname, "./src/stubs/empty.js"),
    },
  },
  define: {
    global: "globalThis",
    "process.env": {},
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
    exclude: [
      "@aws-sdk/credential-provider-node",
      "@aws-sdk/credential-provider-process",
      "@aws-sdk/credential-provider-ini",
      "@aws-sdk/credential-provider-env",
      "@aws-sdk/credential-provider-sso",
      "@aws-sdk/token-providers",
    ],
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.js"),
      name: "EmbeddedBackend",
      fileName: (format) => `embedded-backend.${format}.js`,
      formats: ["es"],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
});
