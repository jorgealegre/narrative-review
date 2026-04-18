import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores([
    "dist-action/**",
    "dist-static/**",
    "node_modules/**",
    "tsconfig.tsbuildinfo",
  ]),
  {
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Blob: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        KeyboardEvent: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        atob: "readonly",
        btoa: "readonly",
        TextDecoder: "readonly",
        Uint8Array: "readonly",
        Buffer: "readonly",
      },
    },
  },
];
