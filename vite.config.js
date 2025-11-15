import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { copyFileSync } from "fs";

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), "");
  const isLightningMode = env.VITE_BACKEND_MODE === "lightning";

  // Base configuration
  const config = {
    base: "/threat-designer/",
    plugins: [
      react({
        jsxRuntime: "automatic",
        jsxImportSource: "@emotion/react",
        babel: {
          plugins: ["@emotion/babel-plugin"],
        },
      }),
      // Plugin to copy 404.html to dist
      {
        name: "copy-404",
        closeBundle() {
          try {
            copyFileSync("404.html", "dist/404.html");
            console.log("✓ 404.html copied to dist/");
          } catch (err) {
            console.warn("Could not copy 404.html:", err.message);
          }
        },
      },
    ],
    root: ".",
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      extensions: [".js", ".jsx", ".json"],
    },
    define: {
      // Make backend mode available at build time
      __BACKEND_MODE__: JSON.stringify(env.VITE_BACKEND_MODE || "remote"),
    },
  };

  // Add Lightning Mode specific configuration
  if (isLightningMode) {
    // Import nodePolyfills plugin dynamically for Lightning Mode
    // Note: This requires vite-plugin-node-polyfills to be installed
    try {
      const { nodePolyfills } = require("vite-plugin-node-polyfills");

      config.plugins.push(
        nodePolyfills({
          globals: {
            Buffer: true,
            global: true,
            process: true,
          },
          protocolImports: true,
          exclude: ["fs", "child_process", "os", "async_hooks"],
        })
      );
    } catch (e) {
      console.warn(
        "vite-plugin-node-polyfills not found. Install it for Lightning Mode: npm install -D vite-plugin-node-polyfills"
      );
    }

    // Add embedded-backend specific aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      // Runtime config for AWS SDK
      "./runtimeConfig": "./runtimeConfig.browser",

      // Node.js module stubs
      child_process: path.resolve(__dirname, "./embedded-backend/src/stubs/child_process.js"),
      fs: path.resolve(__dirname, "./embedded-backend/src/stubs/fs.js"),
      os: path.resolve(__dirname, "./embedded-backend/src/stubs/os.js"),
      async_hooks: path.resolve(__dirname, "./embedded-backend/src/stubs/async_hooks.js"),
      "node:child_process": path.resolve(
        __dirname,
        "./embedded-backend/src/stubs/child_process.js"
      ),
      "node:fs": path.resolve(__dirname, "./embedded-backend/src/stubs/fs.js"),
      "node:os": path.resolve(__dirname, "./embedded-backend/src/stubs/os.js"),
      "node:async_hooks": path.resolve(__dirname, "./embedded-backend/src/stubs/async_hooks.js"),

      // AWS credential provider stubs (critical for browser)
      "@aws-sdk/credential-provider-node": path.resolve(
        __dirname,
        "./embedded-backend/src/stubs/empty.js"
      ),
      "@aws-sdk/credential-provider-process": path.resolve(
        __dirname,
        "./embedded-backend/src/stubs/empty.js"
      ),
      "@aws-sdk/credential-provider-ini": path.resolve(
        __dirname,
        "./embedded-backend/src/stubs/empty.js"
      ),
      "@aws-sdk/credential-provider-env": path.resolve(
        __dirname,
        "./embedded-backend/src/stubs/empty.js"
      ),
      "@aws-sdk/credential-provider-sso": path.resolve(
        __dirname,
        "./embedded-backend/src/stubs/empty.js"
      ),
      "@aws-sdk/token-providers": path.resolve(__dirname, "./embedded-backend/src/stubs/empty.js"),
    };

    // Add Lightning Mode specific defines
    config.define = {
      ...config.define,
      global: "globalThis",
      "process.env": {},
    };

    // Add optimizeDeps configuration
    config.optimizeDeps = {
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
    };
  }

  return config;
});
