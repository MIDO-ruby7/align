import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      "node_modules/**",
      "build/**",
      "dist/**",
      ".react-router/**",
      ".wrangler/**",
      "worker-configuration.d.ts",
      "db/migrations/**",
    ],
  }
);
