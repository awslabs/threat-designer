import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import babelParser from "@babel/eslint-parser";

export default [
  // Ignore patterns
  {
    ignores: ["node_modules/", "dist/", "build/", "coverage/", "htmlcov/", "infra/build/"],
  },

  // Base configuration for all JS/JSX files
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-react"],
        },
      },
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        location: "readonly",
        history: "readonly",
        alert: "readonly",
        confirm: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        // Node globals
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        // ES2021 globals
        Promise: "readonly",
        Symbol: "readonly",
        WeakMap: "readonly",
        WeakSet: "readonly",
        Map: "readonly",
        Set: "readonly",
        // Worker globals
        self: "readonly",
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
      prettier,
    },
    rules: {
      // ESLint recommended rules
      ...js.configs.recommended.rules,

      // Prettier integration
      "prettier/prettier": "error",

      // Code style
      indent: ["error", 2],
      "linebreak-style": ["error", "unix"],
      quotes: ["error", "double"],
      semi: ["error", "always"],

      // Variables
      "no-unused-vars": "warn",

      // React rules
      ...react.configs.recommended.rules,
      "react/prop-types": 0,
      "react/react-in-jsx-scope": "off", // Not needed in React 17+

      // React Hooks rules
      ...reactHooks.configs.recommended.rules,

      // Unused imports
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],

      // Disable rules that conflict with Prettier
      ...prettierConfig.rules,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];
