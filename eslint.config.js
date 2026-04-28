import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", ".cambrian-tree/**", ".codex-tree/**", "node_modules/**", "node-*/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "scripts/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        process: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
);
