import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";

/**
 * Flat ESLint config for the Astro + TypeScript app.
 *
 * Intentionally pragmatic: it catches real bugs (undefined vars, unreachable
 * code, etc.) without enforcing stylistic churn. `any` is allowed because the
 * Directus block payloads are intentionally loose, and unused vars are warnings
 * (prefixed with `_` to silence) so CI stays green on `eslint .`.
 */
export default [
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "public/**",
      "*.min.js",
      // Applied, one-off migration scripts kept only for history.
      "scripts/archive/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Opinionated and prone to false positives on default-then-assign
      // patterns (e.g. `let x = []` reset before a loop); not worth the churn.
      "no-useless-assignment": "off",
    },
  },
  {
    // Provisioning / migration scripts are Node ESM and log to the console.
    files: ["scripts/**/*.{js,mjs,cjs}", "*.config.{js,mjs,cjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
];
